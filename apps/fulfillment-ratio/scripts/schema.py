#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""统一数据点 schema 与归一化函数。

一个数据点 = 保司官网实现率表格里的一个格子。
八字段：保险公司 / 产品系列 / 产品类型 / 指标类别 / 红利类型 / 报告年度 / 生效年份 / 比率

坐标换算（GL16 口径，已用永明 2025、友邦 2024 双源验证）：
    保单年度 = 报告年度 − 保单生效年份
例：永明 2025 报告年度表里「第 1 个保单年度（于 2024 年开始生效之保单）」
    2025 − 2024 = 1 ✓
"""
from __future__ import annotations

import json
import pathlib
import re

BASE = pathlib.Path(__file__).resolve().parent.parent
TAXONOMY = json.loads((BASE / "config" / "taxonomy.json").read_text("utf-8"))

# ── 无数据原因枚举 ────────────────────────────────────────────────
# 官方用不同词表示「这一格没有数据」，原因不同，不可混为一谈，更不能当 0 参与统计
NO_DATA_TOKENS = {
    "已停售": "discontinued",
    "尚未推出": "not_launched",
    "尚未推出(4)": "not_launched",
    "不適用": "not_applicable",
    "不适用": "not_applicable",
    "N.A.": "not_applicable",
    "N/A": "not_applicable",
    "Closed to sales": "discontinued",
    "Not yet launched": "not_launched",
    "-": "not_applicable",
    "沒有": "not_applicable",
    "没有": "not_applicable",
    "未推出": "not_launched",
    "沒有保單終結": "no_terminated_policy",
    "没有保单终结": "no_terminated_policy",
    "沒有保單": "no_policy",
    "没有保单": "no_policy",
}

# ── 比率解析 ──────────────────────────────────────────────────────
_RATIO_RE = re.compile(r"^>?\s*(\d{1,4}(?:\.\d+)?)\s*%$")
_PLAIN_RE = re.compile(r"^(\d{1,4}(?:\.\d+)?)$")


def parse_ratio(raw: str) -> dict:
    """解析一个格子的字符串，返回结构化结果。

    返回 dict:
      kind      : 'value' | 'no_data'
      ratio_pct : float | None
      no_data_reason : str | None
      suspicious: bool  （超出合理区间，供人工复核，不自动剔除）
    """
    s = (raw or "").strip()
    s = re.sub(r"\s+", "", s)
    # 脚注标记：保诚用「N/A(1)」「不適用(2)」带脚注编号，先剥掉再匹配
    s = re.sub(r"[(（]\d+[)）]$", "", s)
    # 上标数字：友邦用「已停售¹」
    s = re.sub(r"[¹²³⁴⁰-₟]+$", "", s)

    if s in NO_DATA_TOKENS:
        return {"kind": "no_data", "ratio_pct": None,
                "no_data_reason": NO_DATA_TOKENS[s], "suspicious": False}
    if s == "":
        return {"kind": "no_data", "ratio_pct": None,
                "no_data_reason": "blank", "suspicious": False}

    m = _RATIO_RE.match(s) or _PLAIN_RE.match(s)
    if not m:
        return {"kind": "unparsed", "ratio_pct": None,
                "no_data_reason": None, "suspicious": True}

    v = float(m.group(1))
    lo = TAXONOMY["ratio_parse"]["suspicious_low"]
    hi = TAXONOMY["ratio_parse"]["suspicious_high"]
    return {"kind": "value", "ratio_pct": v, "no_data_reason": None,
            "suspicious": not (lo <= v <= hi)}


# ── 红利类型归一化 ─────────────────────────────────────────────────
def norm_bonus_type(text: str) -> str | None:
    """把保司用词映射到内部枚举。返回 annual / reversionary / terminal / tcvr / None"""
    if not text:
        return None
    s = re.sub(r"\s+", "", text).lower()
    # 长的先匹配，避免「终期红利或特别红利」被截断误判
    for key, cfg in TAXONOMY["bonus_type"].items():
        if key == "_doc":
            continue
        for kw in cfg["keywords"]:
            if re.sub(r"\s+", "", kw).lower() in s:
                return key
    return None


# ── 产品类型归一化 ─────────────────────────────────────────────────
def norm_product_type(product_name: str, official_type: str | None = None) -> str:
    """产品类型归一化。

    判据优先级：【产品名】> 官方『产品种类』栏。
    原因见 config/taxonomy.json 的 _doc——永明等公司官方分类过粗
    （仅『分红终身人寿 / 分红储蓄』两类，前者混装危疾与年金），
    直接用官方分类会让「储蓄险兑现力」统计被非储蓄产品污染。
    """
    cfg_all = TAXONOMY["product_type"]
    name = re.sub(r"\s+", "", product_name or "")
    official = re.sub(r"\s+", "", official_type or "")

    for key in cfg_all["order"]:
        cfg = cfg_all[key]
        for kw in cfg.get("name_keywords", []):
            if re.sub(r"\s+", "", kw) in name:
                return key

    for key in cfg_all["order"]:
        cfg = cfg_all[key]
        for kw in cfg.get("official_keywords", []):
            if re.sub(r"\s+", "", kw) in official:
                return key

    return "other"


# ── 产品名清洗 ────────────────────────────────────────────────────
_SUP_RE = re.compile(r"\d+$")


def clean_product_name(raw: str) -> str:
    """去掉上标脚注数字、多余空白。如『传爱储蓄计划1』→『传爱储蓄计划』"""
    s = " ".join((raw or "").split())
    s = _SUP_RE.sub("", s).strip()
    return s


def split_product_names(raw: str) -> list[str]:
    """有的格子放多个产品，用逗号/顿号分隔。如『生命安心保1, 生命安多保1』"""
    s = re.sub(r"\s+", "", raw or "")
    parts = [p for p in re.split(r"[,，、/]", s) if p]
    out = [clean_product_name(p) for p in parts]
    return [p for p in out if p]


# ── 数据点构造 ────────────────────────────────────────────────────
def make_fact(insurer_code, insurer_short, product_raw, product_type_raw,
              metric, bonus_type, reporting_year, inception_year,
              raw_value, source_url, fetch_date, currency=None,
              inception_year_end=None, policy_year_label=None,
              policy_year_override=None):
    """构造一个统一数据点。metric: 'FR' | 'TCVR'

    policy_year_override：官网表头直接写明保单年度时以官网为准。
    见于「第 10 个保单年度+（于 2010 年及 2014 年开始生效之保单）」这类混合桶——
    跨度 5 年，无法由单一生效年份反推。
    """
    parsed = parse_ratio(raw_value)
    product_types = norm_product_type(product_raw, product_type_raw)

    if policy_year_override is not None:
        policy_year = policy_year_override
    else:
        policy_year = None
        if isinstance(reporting_year, int) and isinstance(inception_year, int):
            policy_year = reporting_year - inception_year

    return {
        "insurer_code": insurer_code,
        "insurer_short": insurer_short,
        "product_raw": product_raw,
        "product_type_raw": product_type_raw,
        "product_type": product_types,
        "currency": currency or "所有",
        "metric": metric,
        "bonus_type": bonus_type,
        "reporting_year": reporting_year,
        "inception_year": inception_year,
        "inception_year_end": inception_year_end,
        "policy_year": policy_year,
        "policy_year_label": policy_year_label,
        "raw_value": str(raw_value).strip(),
        "kind": parsed["kind"],
        "ratio_pct": parsed["ratio_pct"],
        "no_data_reason": parsed["no_data_reason"],
        "suspicious": parsed["suspicious"],
        "source_url": source_url,
        "fetch_date": fetch_date,
    }


def fact_id(f: dict) -> str:
    iy = f["inception_year"]
    ie = f["inception_year_end"]
    span = f"{iy}" if not ie or ie == iy else f"{iy}-{ie}"
    return "|".join([
        f["insurer_code"], f["product_raw"], f["metric"],
        f["bonus_type"] or "na", str(f["reporting_year"]), span,
    ])
