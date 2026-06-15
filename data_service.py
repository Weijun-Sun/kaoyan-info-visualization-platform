from __future__ import annotations

from collections import OrderedDict
import json
from pathlib import Path
import sqlite3
from functools import lru_cache

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_CSV = BASE_DIR / "考研信息类专业_2020_2026_合并规整.csv"
DATA_SQLITE = BASE_DIR / "考研信息类专业_2020_2026.sqlite"

STANDARD_COLUMNS = ["院校", "年份", "院系", "专业", "初试成绩", "复试成绩", "复试满分", "总成绩", "是否录取"]


def _normalize_text(series: pd.Series) -> pd.Series:
    return (
        series.astype(str)
        .str.replace("\u3000", " ", regex=False)
        .str.replace(r"\s+", " ", regex=True)
        .str.strip()
        .replace({"nan": pd.NA, "None": pd.NA, "": pd.NA})
    )


@lru_cache(maxsize=1)
def load_data() -> pd.DataFrame:
    if DATA_CSV.exists():
        df = pd.read_csv(DATA_CSV, encoding="utf-8-sig")
    elif DATA_SQLITE.exists():
        with sqlite3.connect(DATA_SQLITE) as conn:
            df = pd.read_sql_query("SELECT * FROM kaoyan_data", conn)
    else:
        raise FileNotFoundError("未找到数据文件，请检查 CSV 或 SQLite 是否存在。")

    df = df.copy()
    df = df[[c for c in STANDARD_COLUMNS if c in df.columns]].copy()
    for col in ["院校", "院系", "专业", "是否录取"]:
        if col in df.columns:
            df[col] = _normalize_text(df[col])
    for col in ["年份", "初试成绩", "复试成绩", "复试满分", "总成绩"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    if "年份" in df.columns:
        df["年份"] = df["年份"].astype("Int64")
    df = df.dropna(subset=["院校", "年份", "专业"], how="any").copy()
    return df


def get_year_options() -> list[int]:
    df = load_data()
    years = df["年份"].dropna().astype(int).sort_values().unique().tolist()
    return years


def get_school_options(limit: int = 80) -> list[str]:
    df = load_data()
    schools = (
        df["院校"]
        .dropna()
        .value_counts()
        .head(limit)
        .index
        .tolist()
    )
    return schools


def get_summary() -> dict:
    df = load_data()
    score = pd.to_numeric(df["初试成绩"], errors="coerce")
    return {
        "records": int(len(df)),
        "schools": int(df["院校"].nunique()),
        "majors": int(df["专业"].nunique()),
        "years": int(df["年份"].nunique()),
        "score_count": int(score.notna().sum()),
        "score_median": round(float(score.median()), 2) if score.notna().any() else None,
    }


def filter_data(year: int | None = None, school: str | None = None, keyword: str | None = None) -> pd.DataFrame:
    df = load_data().copy()
    if year is not None:
        df = df[df["年份"] == year]
    if school:
        df = df[df["院校"].str.contains(str(school), na=False)]
    if keyword:
        k = str(keyword).strip()
        if k:
            mask = (
                df["院校"].str.contains(k, na=False)
                | df["院系"].str.contains(k, na=False)
                | df["专业"].str.contains(k, na=False)
            )
            df = df[mask]
    return df


def year_stats() -> pd.DataFrame:
    df = load_data().copy()
    out = (
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
    return out


def top_schools(metric: str = "记录数", limit: int = 10) -> pd.DataFrame:
    df = load_data().copy()
    agg = (
        df.groupby("院校")
        .agg(
            记录数=("专业", "size"),
            初试中位数=("初试成绩", "median"),
            初试均分=("初试成绩", "mean"),
            专业数=("专业", "nunique"),
            覆盖年份数=("年份", "nunique"),
        )
        .reset_index()
    )
    if metric not in agg.columns:
        metric = "记录数"
    return agg.sort_values(metric, ascending=False).head(limit)


def dashboard_data() -> dict:
    df = load_data().copy()
    score = pd.to_numeric(df["初试成绩"], errors="coerce")

    summary = get_summary()
    year_df = year_stats()

    school_rank = (
        df.groupby("院校")
        .agg(
            记录数=("专业", "size"),
            初试中位数=("初试成绩", "median"),
            初试均分=("初试成绩", "mean"),
            专业数=("专业", "nunique"),
            覆盖年份数=("年份", "nunique"),
        )
        .reset_index()
        .sort_values(["记录数", "初试中位数"], ascending=[False, False])
        .head(12)
    )

    major_rank = (
        df.groupby("专业")
        .agg(
            记录数=("院校", "size"),
            初试中位数=("初试成绩", "median"),
            覆盖院校数=("院校", "nunique"),
        )
        .reset_index()
        .sort_values(["初试中位数", "记录数"], ascending=[False, False])
        .head(12)
    )

    score_band = pd.cut(
        score,
        bins=[0, 250, 280, 300, 320, 340, 360, 380, 400, 430, 500],
        labels=["250以下", "250-280", "280-300", "300-320", "320-340", "340-360", "360-380", "380-400", "400-430", "430以上"],
        right=False,
    )
    score_band_df = (
        score_band.value_counts()
        .reindex(["250以下", "250-280", "280-300", "300-320", "320-340", "340-360", "360-380", "380-400", "400-430", "430以上"])
        .fillna(0)
        .astype(int)
        .reset_index()
    )
    score_band_df.columns = ["分数段", "记录数"]

    top_schools_df = school_rank.copy()

    competition = (
        df[df["初试成绩"].notna()]
        .groupby("院校")
        .agg(
            样本数=("初试成绩", "size"),
            初试中位数=("初试成绩", "median"),
            初试均分=("初试成绩", "mean"),
            覆盖年份数=("年份", "nunique"),
            专业数=("专业", "nunique"),
        )
        .reset_index()
    )

    return {
        "summary": summary,
        "year_stats": json_records(year_df),
        "top_schools": json_records(top_schools_df),
        "major_rank": json_records(major_rank),
        "score_band": json_records(score_band_df),
        "competition": json_records(competition.sort_values(["样本数", "初试中位数"], ascending=[False, False]).head(30)),
        "year_heatmap": json_records(
            pd.pivot_table(
                df[df["初试成绩"].notna()],
                index="年份",
                columns=score_band,
                values="院校",
                aggfunc="count",
                fill_value=0,
            ).reset_index()
        ),
        "advice": json_records(build_advice_table(df)),
        "trend_schools": json_records(build_trend_schools(df)),
    }


def build_advice_table(df: pd.DataFrame) -> pd.DataFrame:
    score = pd.to_numeric(df["初试成绩"], errors="coerce").dropna()
    if score.empty:
        return pd.DataFrame(columns=["分位", "参考分数", "含义"])
    q1 = float(score.quantile(0.25))
    median = float(score.median())
    q3 = float(score.quantile(0.75))
    return pd.DataFrame([
        {"分位": "保守项", "参考分数": round(q1, 1), "含义": "低于该值时，建议优先选择稳妥院校与专业"},
        {"分位": "基准项", "参考分数": round(median, 1), "含义": "接近该值时，适合重点比较目标院校"},
        {"分位": "冲刺项", "参考分数": round(q3, 1), "含义": "达到该值时，可考虑更高竞争院校"},
    ])


def build_trend_schools(df: pd.DataFrame) -> pd.DataFrame:
    trend = (
        df[df["初试成绩"].notna()]
        .groupby("院校")
        .agg(
            年份覆盖=("年份", "nunique"),
            样本数=("初试成绩", "size"),
            初试中位数=("初试成绩", "median"),
            初试均分=("初试成绩", "mean"),
        )
        .reset_index()
        .sort_values(["年份覆盖", "样本数"], ascending=[False, False])
        .head(12)
    )
    return trend


def json_records(df: pd.DataFrame) -> list[dict]:
    return json.loads(df.to_json(orient="records", force_ascii=False))
