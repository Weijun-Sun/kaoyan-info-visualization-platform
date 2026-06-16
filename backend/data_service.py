from __future__ import annotations

import hashlib
import json
import math
import re
import sqlite3
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
DATA_CSV = DATA_DIR / "考研信息类专业_2020_2026_合并规整.csv"
DATA_SQLITE = DATA_DIR / "考研信息类专业_2020_2026.sqlite"

STANDARD_COLUMNS = [
    "院校",
    "年份",
    "院系",
    "专业",
    "初试成绩",
    "复试成绩",
    "复试满分",
    "总成绩",
    "是否录取",
]

SCORE_BINS = [0, 250, 280, 300, 320, 340, 360, 380, 400, 430, 500]
SCORE_LABELS = ["250以下", "250-280", "280-300", "300-320", "320-340", "340-360", "360-380", "380-400", "400-430", "430以上"]

PROVINCE_COORDS: dict[str, tuple[float, float]] = {
    "北京": (116.40, 39.90),
    "上海": (121.47, 31.23),
    "天津": (117.20, 39.12),
    "重庆": (106.55, 29.56),
    "河北": (114.52, 38.04),
    "山西": (112.55, 37.87),
    "辽宁": (123.43, 41.80),
    "吉林": (125.32, 43.90),
    "黑龙江": (126.63, 45.75),
    "江苏": (118.80, 32.06),
    "浙江": (120.16, 30.27),
    "安徽": (117.23, 31.82),
    "福建": (119.30, 26.08),
    "江西": (115.86, 28.68),
    "山东": (117.12, 36.65),
    "河南": (113.62, 34.75),
    "湖北": (114.30, 30.59),
    "湖南": (112.94, 28.23),
    "广东": (113.26, 23.13),
    "广西": (108.32, 22.82),
    "海南": (110.33, 20.03),
    "四川": (104.07, 30.67),
    "贵州": (106.71, 26.57),
    "云南": (102.71, 25.04),
    "陕西": (108.94, 34.34),
    "甘肃": (103.83, 36.06),
    "青海": (101.78, 36.62),
    "宁夏": (106.23, 38.49),
    "新疆": (87.62, 43.82),
    "内蒙古": (111.75, 40.84),
    "西藏": (91.13, 29.65),
    "其他": (104.00, 35.00),
}

PROVINCE_KEYWORDS = {
    "北京": ["北京", "清华", "中国人民大学", "中国矿业大学(北京)", "北京航空航天", "北京理工", "北京邮电", "北京科技"],
    "上海": ["上海", "复旦", "同济", "华东师范"],
    "天津": ["天津", "南开"],
    "重庆": ["重庆"],
    "河北": ["河北"],
    "山西": ["山西", "太原"],
    "辽宁": ["东北大学", "大连", "辽宁"],
    "吉林": ["吉林", "东北师范"],
    "黑龙江": ["哈尔滨", "黑龙江"],
    "江苏": ["南京", "东南", "苏州", "江南"],
    "浙江": ["浙江", "宁波"],
    "安徽": ["安徽", "中国科学技术"],
    "福建": ["厦门", "福州", "福建"],
    "江西": ["江西", "南昌"],
    "山东": ["山东", "中国海洋", "济南"],
    "河南": ["河南", "郑州"],
    "湖北": ["武汉", "华中科技", "中国地质大学(武汉)", "华中师范"],
    "湖南": ["湖南", "中南"],
    "广东": ["中山", "华南理工", "广东", "深圳"],
    "广西": ["广西"],
    "海南": ["海南"],
    "四川": ["四川", "电子科技"],
    "贵州": ["贵州"],
    "云南": ["云南"],
    "陕西": ["西安", "西北", "长安"],
    "甘肃": ["兰州"],
    "青海": ["青海"],
    "宁夏": ["宁夏"],
    "新疆": ["新疆"],
    "内蒙古": ["内蒙古"],
    "西藏": ["西藏"],
}

MAJOR_RULES: list[tuple[str, str]] = [
    ("人工智能", "人工智能"),
    ("智能科学", "人工智能"),
    ("大数据", "大数据技术"),
    ("数据科学", "大数据技术"),
    ("网络空间安全", "网络空间安全"),
    ("网络与信息安全", "网络空间安全"),
    ("计算机", "计算机类"),
    ("软件", "软件工程"),
    ("电子信息", "电子信息"),
    ("电子科学", "电子科学与技术"),
    ("集成电路", "集成电路"),
    ("通信", "通信与信息系统"),
    ("信息与通信", "通信与信息系统"),
    ("信号", "通信与信息系统"),
    ("控制", "控制科学与工程"),
    ("自动化", "控制科学与工程"),
    ("电气", "电气工程"),
    ("光电", "光电信息"),
    ("工程管理", "工程管理"),
]


def _normalize_text(series: pd.Series) -> pd.Series:
    return (
        series.astype("string")
        .str.normalize("NFKC")
        .str.replace("\u3000", " ", regex=False)
        .str.replace(r"\s+", " ", regex=True)
        .str.strip()
        .replace({"": pd.NA, "nan": pd.NA, "None": pd.NA, "null": pd.NA})
    )


def _to_jsonable(value: Any) -> Any:
    if value is pd.NA or value is None:
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


def _find_data_csv() -> Path | None:
    if DATA_CSV.exists():
        return DATA_CSV
    matches = sorted(DATA_DIR.glob("*合并规整.csv"), key=lambda p: p.stat().st_size, reverse=True)
    return matches[0] if matches else None


def guess_province(school: str) -> str:
    name = str(school)
    for province, keys in PROVINCE_KEYWORDS.items():
        if any(key in name for key in keys):
            return province
    return "其他"


def classify_major(major: str) -> str:
    text = str(major)
    for key, label in MAJOR_RULES:
        if key in text:
            return label
    return "其他信息类"


def classify_degree(major: str) -> str:
    text = str(major)
    code = re.search(r"\b(08\d{4}|085\d{3}|125\d{3})\b", text)
    if code:
        value = code.group(1)
        if value.startswith("085"):
            return "专业硕士"
        if value.startswith("08"):
            return "学术硕士/工学"
        return "管理类专业硕士"
    if "硕士" in text or "专硕" in text:
        return "专业硕士"
    return "未标注代码"


def _jitter(name: str, scale: float = 0.55) -> tuple[float, float]:
    digest = hashlib.md5(name.encode("utf-8")).hexdigest()
    a = int(digest[:4], 16) / 65535 - 0.5
    b = int(digest[4:8], 16) / 65535 - 0.5
    return a * scale, b * scale


def school_coord(school: str, province: str) -> tuple[float, float]:
    lon, lat = PROVINCE_COORDS.get(province, PROVINCE_COORDS["其他"])
    dx, dy = _jitter(str(school))
    return lon + dx, lat + dy


@lru_cache(maxsize=1)
def load_data() -> pd.DataFrame:
    csv_path = _find_data_csv()
    if csv_path:
        df = pd.read_csv(csv_path, encoding="utf-8-sig")
    elif DATA_SQLITE.exists():
        with sqlite3.connect(DATA_SQLITE) as conn:
            table_names = pd.read_sql_query("SELECT name FROM sqlite_master WHERE type='table'", conn)["name"].tolist()
            table = "kaoyan_data" if "kaoyan_data" in table_names else table_names[0]
            df = pd.read_sql_query(f"SELECT * FROM {table}", conn)
    else:
        raise FileNotFoundError(f"未找到数据文件：{DATA_CSV} 或 {DATA_SQLITE}")

    df = df.reindex(columns=STANDARD_COLUMNS).copy()
    for col in ["院校", "院系", "专业", "是否录取"]:
        df[col] = _normalize_text(df[col])
    for col in ["年份", "初试成绩", "复试成绩", "复试满分", "总成绩"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df["年份"] = df["年份"].astype("Int64")
    df = df.dropna(subset=["院校", "年份", "专业"]).copy()
    df["数据阶段"] = df["年份"].apply(lambda x: "历史数据(2020-2023)" if int(x) <= 2023 else "新收集数据(2024-2026)")
    df["是否录取_bool"] = df["是否录取"].astype(str).str.contains("是|yes|录取", case=False, regex=True, na=False)
    df["专业类别"] = df["专业"].map(classify_major)
    df["学位类型"] = df["专业"].map(classify_degree)
    df["省份"] = df["院校"].map(guess_province)
    coords = df.apply(lambda row: school_coord(row["院校"], row["省份"]), axis=1)
    df["经度"] = [item[0] for item in coords]
    df["纬度"] = [item[1] for item in coords]
    return df.sort_values(["年份", "院校", "院系", "专业"], kind="stable").reset_index(drop=True)


def get_summary() -> dict:
    df = load_data()
    score = df["初试成绩"]
    return {
        "总记录数": int(len(df)),
        "覆盖院校": int(df["院校"].nunique()),
        "专业数量": int(df["专业"].nunique()),
        "专业类别": int(df["专业类别"].nunique()),
        "年份范围": f"{int(df['年份'].min())}-{int(df['年份'].max())}",
        "初试中位数": round(float(score.median()), 2) if score.notna().any() else None,
        "录取记录数": int(df["是否录取_bool"].sum()),
        "覆盖省份": int(df["省份"].nunique()),
    }


def get_options() -> dict:
    df = load_data()
    return {
        "年份": [int(x) for x in df["年份"].dropna().sort_values().unique().tolist()],
        "院校": df["院校"].dropna().value_counts().index.tolist(),
        "专业": df["专业"].dropna().value_counts().head(300).index.tolist(),
        "专业类别": df["专业类别"].dropna().value_counts().index.tolist(),
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
            | df["专业类别"].str.contains(key, na=False, case=False)
        )
        df = df[mask]
    if min_score is not None:
        df = df[df["初试成绩"] >= min_score]
    if max_score is not None:
        df = df[df["初试成绩"] <= max_score]
    return df[STANDARD_COLUMNS].sort_values(["年份", "院校", "专业"], ascending=[False, True, True])


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


def score_band_data() -> pd.DataFrame:
    df = load_data()
    band = pd.cut(df["初试成绩"], bins=SCORE_BINS, labels=SCORE_LABELS, right=False)
    out = band.value_counts().reindex(SCORE_LABELS).fillna(0).astype(int).reset_index()
    out.columns = ["分数段", "记录数"]
    return out


def year_score_heatmap() -> pd.DataFrame:
    df = load_data()
    temp = df[df["初试成绩"].notna()].copy()
    temp["分数段"] = pd.cut(temp["初试成绩"], bins=SCORE_BINS, labels=SCORE_LABELS, right=False)
    return (
        temp.pivot_table(index="年份", columns="分数段", values="院校", aggfunc="count", fill_value=0, observed=False)
        .reindex(columns=SCORE_LABELS, fill_value=0)
        .reset_index()
    )


def admission_by_band() -> pd.DataFrame:
    df = load_data().copy()
    bins = [0, 300, 340, 360, 380, 400, 500]
    labels = ["300以下", "300-340", "340-360", "360-380", "380-400", "400以上"]
    df["分数段"] = pd.cut(df["初试成绩"], bins=bins, labels=labels, right=False)
    out = (
        df.dropna(subset=["分数段"])
        .groupby("分数段", observed=False)
        .agg(样本数=("院校", "size"), 录取数=("是否录取_bool", "sum"))
        .reset_index()
    )
    out["未录取数"] = out["样本数"] - out["录取数"]
    out["录取率"] = (out["录取数"] / out["样本数"] * 100).round(2)
    return out


def school_rank(limit: int = 40) -> pd.DataFrame:
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
            录取率=("是否录取_bool", "mean"),
            省份=("省份", "first"),
            经度=("经度", "first"),
            纬度=("纬度", "first"),
        )
        .reset_index()
    )
    out["录取率"] = (out["录取率"] * 100).round(2)
    return out.sort_values(["记录数", "初试中位数"], ascending=[False, False]).head(limit)


def major_rank(limit: int = 30) -> pd.DataFrame:
    df = load_data()
    out = (
        df.groupby("专业", dropna=True)
        .agg(
            记录数=("院校", "size"),
            覆盖院校数=("院校", "nunique"),
            初试中位数=("初试成绩", "median"),
            初试均分=("初试成绩", "mean"),
            专业类别=("专业类别", "first"),
        )
        .reset_index()
    )
    return out.sort_values(["记录数", "初试中位数"], ascending=[False, False]).head(limit)


def major_category_stats() -> pd.DataFrame:
    df = load_data()
    out = (
        df.groupby("专业类别")
        .agg(
            记录数=("院校", "size"),
            覆盖院校数=("院校", "nunique"),
            初试中位数=("初试成绩", "median"),
            初试均分=("初试成绩", "mean"),
            录取率=("是否录取_bool", "mean"),
        )
        .reset_index()
    )
    out["录取率"] = (out["录取率"] * 100).round(2)
    return out.sort_values("记录数", ascending=False)


def waterfall_data() -> pd.DataFrame:
    stats = year_stats()[["年份", "记录数"]].copy()
    stats["变化量"] = stats["记录数"].diff().fillna(stats["记录数"]).astype(int)
    stats["累计记录数"] = stats["记录数"].astype(int)
    return stats


def bullet_data(limit: int = 12, target: int = 360) -> pd.DataFrame:
    out = school_rank(60)
    out = out[out["样本数"] >= 20].copy()
    out = out.sort_values(["初试中位数", "样本数"], ascending=[False, False]).head(limit)
    out["目标线"] = target
    out["达标差值"] = (out["初试中位数"] - target).round(2)
    return out[["院校", "初试中位数", "目标线", "达标差值", "样本数", "专业数"]]


def interval_line_data() -> pd.DataFrame:
    df = load_data()
    temp = df[df["初试成绩"].notna()].copy()
    out = (
        temp.groupby("年份")
        .agg(
            下四分位=("初试成绩", lambda x: x.quantile(0.25)),
            初试中位数=("初试成绩", "median"),
            上四分位=("初试成绩", lambda x: x.quantile(0.75)),
            样本数=("初试成绩", "count"),
        )
        .reset_index()
        .sort_values("年份")
    )
    out["区间宽度"] = out["上四分位"] - out["下四分位"]
    return out


def nested_donut_data() -> dict:
    df = load_data()
    inner = df.groupby("学位类型").size().reset_index(name="记录数").sort_values("记录数", ascending=False)
    outer = (
        df.groupby(["学位类型", "专业类别"]).size().reset_index(name="记录数").sort_values("记录数", ascending=False)
    )
    outer["名称"] = outer["学位类型"] + " - " + outer["专业类别"]
    return {"inner": json_records(inner), "outer": json_records(outer.rename(columns={"名称": "类别"}))}


def pie_data() -> pd.DataFrame:
    df = load_data()
    out = df["是否录取"].fillna("未标注").value_counts().reset_index()
    out.columns = ["类别", "记录数"]
    return out


def sunburst_data() -> list[dict]:
    df = load_data()
    data: list[dict] = []
    provinces = df["省份"].value_counts().head(10).index.tolist()
    for province in provinces:
        p_df = df[df["省份"] == province]
        school_children = []
        schools = p_df["院校"].value_counts().head(5).index.tolist()
        for school in schools:
            s_df = p_df[p_df["院校"] == school]
            cats = (
                s_df["专业类别"].value_counts().head(4).reset_index()
            )
            cats.columns = ["name", "value"]
            school_children.append({"name": school, "children": json_records(cats)})
        data.append({"name": province, "children": school_children})
    return data


def sankey_data() -> dict:
    df = load_data().copy()
    temp = df.groupby(["数据阶段", "年份", "专业类别"]).size().reset_index(name="记录数")
    top_cats = df["专业类别"].value_counts().head(8).index.tolist()
    temp = temp[temp["专业类别"].isin(top_cats)]
    node_names: set[str] = set()
    links: list[dict] = []
    for _, row in temp.groupby(["数据阶段", "年份"], as_index=False)["记录数"].sum().iterrows():
        source = str(row["数据阶段"])
        target = str(int(row["年份"]))
        node_names.update([source, target])
        links.append({"source": source, "target": target, "value": int(row["记录数"])})
    for _, row in temp.iterrows():
        source = str(int(row["年份"]))
        target = str(row["专业类别"])
        node_names.update([source, target])
        links.append({"source": source, "target": target, "value": int(row["记录数"])})
    nodes = [{"name": name} for name in sorted(node_names)]
    return {"nodes": nodes, "links": links}


def matrix_heatmap_data() -> dict:
    df = load_data()
    schools = df["院校"].value_counts().head(12).index.tolist()
    categories = df["专业类别"].value_counts().head(10).index.tolist()
    temp = df[df["院校"].isin(schools) & df["专业类别"].isin(categories)]
    pivot = temp.pivot_table(index="院校", columns="专业类别", values="初试成绩", aggfunc="median", observed=False)
    values = []
    for y, school in enumerate(schools):
        for x, cat in enumerate(categories):
            val = pivot.loc[school, cat] if school in pivot.index and cat in pivot.columns else None
            values.append([x, y, None if pd.isna(val) else round(float(val), 2)])
    return {"schools": schools, "categories": categories, "values": values}


def province_stats() -> pd.DataFrame:
    df = load_data()
    out = (
        df.groupby("省份")
        .agg(
            记录数=("院校", "size"),
            院校数=("院校", "nunique"),
            专业数=("专业", "nunique"),
            初试中位数=("初试成绩", "median"),
        )
        .reset_index()
        .sort_values("记录数", ascending=False)
    )
    out["经度"] = out["省份"].map(lambda x: PROVINCE_COORDS.get(x, PROVINCE_COORDS["其他"])[0])
    out["纬度"] = out["省份"].map(lambda x: PROVINCE_COORDS.get(x, PROVINCE_COORDS["其他"])[1])
    return out


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


def parallel_data() -> pd.DataFrame:
    out = school_rank(45)
    return out[["院校", "样本数", "专业数", "覆盖年份数", "初试中位数", "录取率"]].dropna().head(35)


def treemap_data() -> list[dict]:
    df = load_data()
    provinces = df["省份"].value_counts().head(12).index.tolist()
    tree = []
    for province in provinces:
        p_df = df[df["省份"] == province]
        school_nodes = []
        for school, s_df in p_df.groupby("院校"):
            if len(s_df) < 30:
                continue
            cat_nodes = [{"name": cat, "value": int(count)} for cat, count in s_df["专业类别"].value_counts().head(5).items()]
            school_nodes.append({"name": school, "children": cat_nodes})
        if school_nodes:
            tree.append({"name": province, "children": sorted(school_nodes, key=lambda x: sum(c["value"] for c in x["children"]), reverse=True)[:8]})
    return tree


def wordcloud_data() -> pd.DataFrame:
    df = load_data()
    keywords = [
        "电子信息",
        "计算机",
        "软件工程",
        "人工智能",
        "网络空间安全",
        "控制",
        "通信",
        "信息与通信",
        "集成电路",
        "大数据",
        "信号",
        "电气",
        "光电",
        "数据科学",
        "计算机技术",
        "网络与信息安全",
        "电子科学",
        "智能科学",
    ]
    text = "\n".join(df["专业"].dropna().astype(str).tolist())
    rows = []
    for key in keywords:
        count = len(re.findall(re.escape(key), text))
        if count:
            rows.append({"关键词": key, "权重": int(count)})
    return pd.DataFrame(rows).sort_values("权重", ascending=False)


def point_map_data() -> pd.DataFrame:
    return school_rank(120)[["院校", "省份", "经度", "纬度", "记录数", "专业数", "初试中位数"]].dropna(subset=["经度", "纬度"])


def recommendation_table() -> pd.DataFrame:
    out = school_rank(80).dropna(subset=["初试中位数"]).copy()
    out["择校难度"] = pd.cut(
        out["初试中位数"],
        bins=[0, 330, 360, 380, 500],
        labels=["稳妥", "适中", "较高", "冲刺"],
        include_lowest=True,
    ).astype(str)
    out["建议"] = out["择校难度"].map(
        {
            "稳妥": "可作为保底或稳妥选择，但仍需确认专业课与复试要求。",
            "适中": "适合作为主力目标院校，重点比较专业方向和复试比例。",
            "较高": "需要较强初试基础，建议搭配稳妥院校形成梯度。",
            "冲刺": "适合冲刺，报考时应准备充分的备选方案。",
        }
    )
    return out.sort_values(["初试中位数", "样本数"], ascending=[False, False]).head(30)


def chart_catalog() -> list[dict]:
    return [
        {"图表": "分组柱状图", "用途": "年度记录数、院校数、专业数对比"},
        {"图表": "堆叠柱状图", "用途": "不同年份的初试分数段结构"},
        {"图表": "双向对称条形图", "用途": "各分数段录取与未录取数量对照"},
        {"图表": "瀑布图", "用途": "年度记录规模的增减变化"},
        {"图表": "标准子弹对比图", "用途": "院校初试中位数与360参考线对比"},
        {"图表": "多系列折线趋势图", "用途": "重点院校多年初试中位数趋势"},
        {"图表": "渐变填充面积图", "用途": "年度数据规模变化强弱"},
        {"图表": "区间上下限填充折线图", "用途": "初试成绩四分位区间与中位数"},
        {"图表": "嵌套双层环形图", "用途": "学位类型与专业类别结构"},
        {"图表": "分离突出式饼图", "用途": "录取状态构成"},
        {"图表": "多层旭日层级图", "用途": "省份-院校-专业类别层级"},
        {"图表": "桑基流向迁移图", "用途": "数据阶段-年份-专业类别流向"},
        {"图表": "三维气泡散点图", "用途": "样本数、分数、专业数三维竞争关系"},
        {"图表": "矩阵热力对比图", "用途": "院校与专业类别的分数矩阵"},
        {"图表": "地理热力分布图", "用途": "省份记录数空间分布"},
        {"图表": "多指标雷达对比图", "用途": "热门专业类别多指标比较"},
        {"图表": "平行坐标多维分布图", "用途": "院校多指标竞争画像"},
        {"图表": "层级矩形树状图", "用途": "省份-院校-专业类别规模结构"},
        {"图表": "关键词权重词云图", "用途": "专业名称关键词热度"},
        {"图表": "全国地理点位散点地图", "用途": "院校地理点位、规模与分数"},
    ]


def dashboard_data() -> dict:
    return {
        "summary": get_summary(),
        "catalog": chart_catalog(),
        "yearStats": json_records(year_stats()),
        "scoreBand": json_records(score_band_data()),
        "stackedScore": json_records(year_score_heatmap()),
        "admissionBand": json_records(admission_by_band()),
        "schoolRank": json_records(school_rank(40)),
        "majorRank": json_records(major_rank(30)),
        "majorCategory": json_records(major_category_stats()),
        "waterfall": json_records(waterfall_data()),
        "bullet": json_records(bullet_data()),
        "intervalLine": json_records(interval_line_data()),
        "nestedDonut": nested_donut_data(),
        "pie": json_records(pie_data()),
        "sunburst": sunburst_data(),
        "sankey": sankey_data(),
        "matrixHeatmap": matrix_heatmap_data(),
        "provinceStats": json_records(province_stats()),
        "trendSchools": json_records(trend_schools()),
        "parallel": json_records(parallel_data()),
        "treemap": treemap_data(),
        "wordcloud": json_records(wordcloud_data()),
        "pointMap": json_records(point_map_data()),
        "recommendations": json_records(recommendation_table()),
    }
