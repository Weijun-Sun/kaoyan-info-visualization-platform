from __future__ import annotations

import json
import math
import sqlite3
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
DATA_CSV = DATA_DIR / "考研信息类专业_2020_2026_合并规整.csv"
DATA_SQLITE = DATA_DIR / "考研信息类专业_2020_2026.sqlite"

STANDARD_COLUMNS = ["院校", "年份", "院系", "专业", "初试成绩", "复试成绩", "复试满分", "总成绩", "是否录取"]


def _normalize_text(series: pd.Series) -> pd.Series:
    return (
        series.astype(str)
        .str.replace("\u3000", " ", regex=False)
        .str.replace(r"\s+", " ", regex=True)
        .str.strip()
        .replace({"nan": pd.NA, "None": pd.NA, "": pd.NA})
    )


def _to_jsonable(value: Any) -> Any:
    if value is pd.NA:
        return None
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        if value.is_integer():
            return int(value)
        return round(value, 2)
    if hasattr(value, "item"):
        return _to_jsonable(value.item())
    return value


def json_records(df: pd.DataFrame) -> list[dict]:
    rows = json.loads(df.to_json(orient="records", force_ascii=False))
    return [{k: _to_jsonable(v) for k, v in row.items()} for row in rows]


@lru_cache(maxsize=1)
def load_data() -> pd.DataFrame:
    if DATA_CSV.exists():
        df = pd.read_csv(DATA_CSV, encoding="utf-8-sig")
    elif DATA_SQLITE.exists():
        with sqlite3.connect(DATA_SQLITE) as conn:
            table_names = pd.read_sql_query("SELECT name FROM sqlite_master WHERE type='table'", conn)["name"].tolist()
            table = "kaoyan_data" if "kaoyan_data" in table_names else table_names[0]
            df = pd.read_sql_query(f"SELECT * FROM {table}", conn)
    else:
        raise FileNotFoundError(f"未找到数据文件：{DATA_CSV} 或 {DATA_SQLITE}")

    df = df.copy()
    for col in STANDARD_COLUMNS:
        if col not in df.columns:
            df[col] = pd.NA
    df = df[STANDARD_COLUMNS].copy()

    for col in ["院校", "院系", "专业", "是否录取"]:
        df[col] = _normalize_text(df[col])
    for col in ["年份", "初试成绩", "复试成绩", "复试满分", "总成绩"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["年份"] = df["年份"].astype("Int64")
    df = df.dropna(subset=["院校", "年份", "专业"]).copy()
    return df


def get_summary() -> dict:
    df = load_data()
    score = pd.to_numeric(df["初试成绩"], errors="coerce")
    admitted = df["是否录取"].astype(str).str.contains("是|yes|录取", case=False, regex=True, na=False)
    return {
        "总记录数": int(len(df)),
        "覆盖院校": int(df["院校"].nunique()),
        "专业数量": int(df["专业"].nunique()),
        "年份数量": int(df["年份"].nunique()),
        "年份范围": f"{int(df['年份'].min())}-{int(df['年份'].max())}",
        "初试中位数": round(float(score.median()), 2) if score.notna().any() else None,
        "初试均分": round(float(score.mean()), 2) if score.notna().any() else None,
        "录取记录数": int(admitted.sum()),
    }


def get_options() -> dict:
    df = load_data()
    return {
        "年份": [int(x) for x in df["年份"].dropna().sort_values().unique().tolist()],
        "院校": df["院校"].dropna().value_counts().index.tolist(),
        "专业": df["专业"].dropna().value_counts().head(300).index.tolist(),
    }


def filter_data(
    year: int | None = None,
    school: str = "",
    keyword: str = "",
    min_score: float | None = None,
    max_score: float | None = None,
) -> pd.DataFrame:
    df = load_data().copy()
    if year is not None:
        df = df[df["年份"] == year]
    if school.strip():
        df = df[df["院校"].str.contains(school.strip(), na=False, case=False)]
    if keyword.strip():
        key = keyword.strip()
        mask = (
            df["院校"].str.contains(key, na=False, case=False)
            | df["院系"].str.contains(key, na=False, case=False)
            | df["专业"].str.contains(key, na=False, case=False)
        )
        df = df[mask]
    if min_score is not None:
        df = df[df["初试成绩"] >= min_score]
    if max_score is not None:
        df = df[df["初试成绩"] <= max_score]
    return df.sort_values(["年份", "院校", "专业"], ascending=[False, True, True])


def year_stats() -> pd.DataFrame:
    df = load_data()
    return (
        df.groupby("年份", dropna=True)
        .agg(
            记录数=("专业", "size"),
            院校数=("院校", "nunique"),
            专业数=("专业", "nunique"),
            初试中位数=("初试成绩", "median"),
            初试均分=("初试成绩", "mean"),
        )
        .reset_index()
        .sort_values("年份")
    )


def school_rank(limit: int = 20) -> pd.DataFrame:
    df = load_data()
    out = (
        df.groupby("院校", dropna=True)
        .agg(
            样本数=("初试成绩", "count"),
            记录数=("专业", "size"),
            专业数=("专业", "nunique"),
            覆盖年份数=("年份", "nunique"),
            初试中位数=("初试成绩", "median"),
            初试均分=("初试成绩", "mean"),
            最高分=("初试成绩", "max"),
            最低分=("初试成绩", "min"),
        )
        .reset_index()
    )
    return out.sort_values(["记录数", "初试中位数"], ascending=[False, False]).head(limit)


def major_rank(limit: int = 20) -> pd.DataFrame:
    df = load_data()
    out = (
        df.groupby("专业", dropna=True)
        .agg(
            记录数=("院校", "size"),
            覆盖院校数=("院校", "nunique"),
            初试中位数=("初试成绩", "median"),
            初试均分=("初试成绩", "mean"),
        )
        .reset_index()
    )
    return out.sort_values(["记录数", "初试中位数"], ascending=[False, False]).head(limit)


def score_band() -> pd.DataFrame:
    df = load_data()
    bins = [0, 250, 280, 300, 320, 340, 360, 380, 400, 430, 500]
    labels = ["250以下", "250-280", "280-300", "300-320", "320-340", "340-360", "360-380", "380-400", "400-430", "430以上"]
    band = pd.cut(df["初试成绩"], bins=bins, labels=labels, right=False)
    out = band.value_counts().reindex(labels).fillna(0).astype(int).reset_index()
    out.columns = ["分数段", "记录数"]
    return out


def year_score_heatmap() -> pd.DataFrame:
    df = load_data()
    bins = [0, 250, 280, 300, 320, 340, 360, 380, 400, 430, 500]
    labels = ["250以下", "250-280", "280-300", "300-320", "320-340", "340-360", "360-380", "380-400", "400-430", "430以上"]
    temp = df[df["初试成绩"].notna()].copy()
    temp["分数段"] = pd.cut(temp["初试成绩"], bins=bins, labels=labels, right=False)
    return (
        temp.pivot_table(index="年份", columns="分数段", values="院校", aggfunc="count", fill_value=0, observed=False)
        .reindex(columns=labels, fill_value=0)
        .reset_index()
    )


def admission_by_band() -> pd.DataFrame:
    df = load_data().copy()
    bins = [0, 300, 340, 360, 380, 400, 500]
    labels = ["300以下", "300-340", "340-360", "360-380", "380-400", "400以上"]
    df["分数段"] = pd.cut(df["初试成绩"], bins=bins, labels=labels, right=False)
    df["录取"] = df["是否录取"].astype(str).str.contains("是|yes|录取", case=False, regex=True, na=False)
    out = (
        df.dropna(subset=["分数段"])
        .groupby("分数段", observed=False)
        .agg(样本数=("院校", "size"), 录取数=("录取", "sum"))
        .reset_index()
    )
    out["录取率"] = (out["录取数"] / out["样本数"] * 100).round(2)
    return out


def province_stats() -> pd.DataFrame:
    province_map = {
        "北京": "北京", "清华": "北京", "中国人民大学": "北京", "北京航空航天": "北京", "北京理工": "北京", "北京邮电": "北京",
        "上海": "上海", "复旦": "上海", "同济": "上海", "华东师范": "上海",
        "南京": "江苏", "东南": "江苏", "苏州": "江苏",
        "浙江": "浙江",
        "中国科学技术": "安徽", "安徽": "安徽",
        "武汉": "湖北", "华中科技": "湖北",
        "西安": "陕西", "西北": "陕西",
        "哈尔滨": "黑龙江", "东北": "辽宁", "大连": "辽宁",
        "天津": "天津", "南开": "天津",
        "山东": "山东", "中国海洋": "山东",
        "四川": "四川", "电子科技": "四川",
        "重庆": "重庆",
        "中山": "广东", "华南理工": "广东",
        "厦门": "福建",
        "湖南": "湖南", "中南": "湖南",
        "吉林": "吉林",
        "兰州": "甘肃",
        "新疆": "新疆",
        "广西": "广西",
        "云南": "云南",
        "贵州": "贵州",
        "宁夏": "宁夏",
        "河北": "河北",
    }
    df = load_data().copy()

    def guess(name: str) -> str:
        for key, province in province_map.items():
            if key in str(name):
                return province
        return "其他"

    df["省份"] = df["院校"].map(guess)
    return (
        df.groupby("省份")
        .agg(记录数=("院校", "size"), 院校数=("院校", "nunique"), 初试中位数=("初试成绩", "median"))
        .reset_index()
        .sort_values("记录数", ascending=False)
    )


def trend_schools(limit: int = 8) -> pd.DataFrame:
    df = load_data()
    candidates = (
        df[df["初试成绩"].notna()]
        .groupby("院校")
        .agg(年份覆盖=("年份", "nunique"), 样本数=("初试成绩", "count"))
        .query("年份覆盖 >= 2")
        .sort_values(["年份覆盖", "样本数"], ascending=[False, False])
        .head(limit)
        .index
    )
    return (
        df[df["院校"].isin(candidates)]
        .groupby(["院校", "年份"])
        .agg(初试中位数=("初试成绩", "median"), 样本数=("初试成绩", "count"))
        .reset_index()
        .sort_values(["院校", "年份"])
    )


def recommendation_table() -> pd.DataFrame:
    df = load_data()
    out = (
        df[df["初试成绩"].notna()]
        .groupby("院校")
        .agg(
            样本数=("初试成绩", "count"),
            专业数=("专业", "nunique"),
            初试中位数=("初试成绩", "median"),
            分数波动=("初试成绩", "std"),
            覆盖年份数=("年份", "nunique"),
        )
        .reset_index()
    )
    out["分数波动"] = out["分数波动"].fillna(0)
    out["择校难度"] = pd.cut(out["初试中位数"], bins=[0, 330, 360, 380, 500], labels=["稳妥", "适中", "较高", "冲刺"], include_lowest=True).astype(str)
    out["建议"] = out["择校难度"].map({
        "稳妥": "适合作为保底或稳妥选择",
        "适中": "适合作为主力目标院校",
        "较高": "需要较强初试基础和复试准备",
        "冲刺": "建议作为冲刺院校并搭配稳妥项",
    })
    return out.sort_values(["初试中位数", "样本数"], ascending=[False, False]).head(30)


def dashboard_data() -> dict:
    return {
        "summary": get_summary(),
        "yearStats": json_records(year_stats()),
        "schoolRank": json_records(school_rank(20)),
        "majorRank": json_records(major_rank(20)),
        "scoreBand": json_records(score_band()),
        "heatmap": json_records(year_score_heatmap()),
        "admissionBand": json_records(admission_by_band()),
        "provinceStats": json_records(province_stats()),
        "trendSchools": json_records(trend_schools()),
        "recommendations": json_records(recommendation_table()),
    }
