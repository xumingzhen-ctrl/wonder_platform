#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""友邦 AIA 香港适配器（JSON 数据文件通道）。

背景（2026-09-05 实测）：
  页面 https://www.aia.com.hk/zh-cn/products/further-product-information/participating-products/fulfillment-ratio
  是 AEM 站点 + 下拉选产品才渲染表格；Playwright 抓包发现页面加载时直接请求一个全量 JSON：
    https://www.aia.com.hk/content/dam/hk-wise/json/further-product-information/2026/fulfillment-ratio.json
  结构：
    report_year  2025
    pData[]      81 个产品 {productNm:{en,zh-hk,zh-cn}, type:{…},
                   AD/TD/RB/TB: [{currency:{…}, remark, data:[{year:"2024"|"Before 2015", ratio}]}]}
    AD=周年红利 TD=终期红利 RB=复归红利 TB=终期分红（实测无任何产品同时有 TD+TB，可同映射 terminal）
    data 行固定 11 行：2024(第1年)…2015(第10年) + "Before 2015"(第11年+混合桶 2010–2014)
    ratio 值带 <sup>(n)</sup> 脚注，解析前剥掉；
    非数值：Closed to sales / Not yet launched / N.A.
  JSON 一律归档 data/raw/AIA/{date}/api/fulfillment-ratio.json（--reparse 复用）。
  页面本体（渲染版快照）只作来源凭证存档，不参与解析。
"""
from __future__ import annotations

import json
import pathlib
import re
import sys

import requests

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from schema import fact_id, make_fact

CODE = "AIA"
SHORT = "友邦"
URL = "https://www.aia.com.hk/zh-cn/products/further-product-information/participating-products/fulfillment-ratio"
JSON_URL = "https://www.aia.com.hk/content/dam/hk-wise/json/further-product-information/2026/fulfillment-ratio.json"
SOURCES = [("zh-cn-render", URL)]
BASE = pathlib.Path(__file__).resolve().parent.parent.parent

_BONUS_MAP = {"AD": "annual", "TD": "terminal", "RB": "reversionary", "TB": "terminal"}
_SUP_RE = re.compile(r"<sup>.*?</sup>", re.S)
_GL16_FLOOR = 2010


def _load_json(fetch_date: str, use_archive: bool) -> dict:
    fpath = BASE / "data" / "raw" / CODE / fetch_date / "api" / "fulfillment-ratio.json"
    if use_archive and fpath.exists():
        return json.loads(fpath.read_text("utf-8"))
    r = requests.get(JSON_URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=60)
    r.raise_for_status()
    fpath.parent.mkdir(parents=True, exist_ok=True)
    fpath.write_bytes(r.content)
    return r.json()


def parse(html: str, source_url: str, fetch_date: str, use_archive: bool = False):
    data = _load_json(fetch_date, use_archive)
    reporting_year = int(data["report_year"])
    facts: list[dict] = []
    stats = {"products": len(data["pData"]), "rows": 0}

    for p in data["pData"]:
        product_raw = p["productNm"]["zh-cn"].strip()
        ptype = p.get("type", {}).get("zh-cn", "").strip()
        for series_key, bonus_type in _BONUS_MAP.items():
            for series in p.get(series_key) or []:
                currency = series.get("currency", {}).get("zh-cn", "所有") or "所有"
                for d in series["data"]:
                    y = d["year"]
                    raw_val = _SUP_RE.sub("", d["ratio"]).strip()
                    if y.startswith("Before"):
                        inception, y_end, override = _GL16_FLOOR, int(y.split()[-1]) - 1, 11
                        label = f"第11个保单年度+({y})"
                    else:
                        inception, y_end, override = int(y), None, None
                        label = None
                    facts.append(make_fact(
                        insurer_code=CODE, insurer_short=SHORT,
                        product_raw=product_raw, product_type_raw=ptype,
                        metric="FR", bonus_type=bonus_type,
                        reporting_year=reporting_year,
                        inception_year=inception,
                        raw_value=raw_val, source_url=JSON_URL,
                        fetch_date=fetch_date, currency=currency,
                        inception_year_end=y_end,
                        policy_year_label=label,
                        policy_year_override=override,
                    ))
                    stats["rows"] += 1

    seen, uniq = set(), []
    for f in facts:
        k = fact_id(f) + f"|{f['currency']}"
        if k in seen:
            continue
        seen.add(k)
        uniq.append(f)
    stats["facts"] = len(uniq)
    return uniq, stats, None


if __name__ == "__main__":
    facts, stats, _ = parse("", URL, "2026-09-05", use_archive=True)
    print(f"数据点 {len(facts)} 条（有效值 {sum(1 for f in facts if f['kind']=='value')}）")
    print("stats:", stats)
    for f in facts[:8]:
        print(f"  {str(f['bonus_type']):<12} {f['reporting_year']} 生效{f['inception_year']} "
              f"第{f['policy_year']}年 {f['product_raw'][:16]:<18} {f['currency']:<4} {f['raw_value']}")
