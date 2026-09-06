#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""万通保险 YF Life 适配器（JSON API 通道）。

背景（2026-09-05 实测）：
  保监局索引指向 corp.yflife.com 的 Investment-Strategy 页——只是个壳。
  真实页面在 www.yflife.com/sc/support/useful-information/investment-strategy/，
  页面内产品数据由 JS 调 JSON API 加载：
    POST /aisite-applyapi/hk/support/getDividend   分红实现率（按红利类型分行）
    POST /aisite-applyapi/hk/support/getTotalCash  总现金价值比率
    入参 {"productCode": "BIS", "currency": "ALL", "region": "Hong Kong"}
  产品清单就在静态页 .pro_select_list li（data-value=代码, data-text=名称,
    data-type=官方分类, data-status=current/shelved）——GL16 涵盖已停售产品，全量采集。

  响应格式：
    header.rightTitle  "Fulfillment Ratio for reporting year 2025"
    years              ["Policy Year 1", …, "Policy Year 10 afterwards"]
    benefits[]         {name: "Reversionary Bonus", values: ["N/A3(a)", "112%", …]}
  值带脚注如 "N/A3(a)"、"112%2(b)"——解析前剥掉。
  API 响应一律归档 data/raw/YF/{date}/api/，可追溯、可复用（--reparse）。
"""
from __future__ import annotations

import json
import pathlib
import re
import sys
import time

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from schema import fact_id, make_fact

CODE = "YF"
SHORT = "万通"
URL = "https://www.yflife.com/sc/support/useful-information/investment-strategy/"
_API = "https://www.yflife.com/aisite-applyapi/hk/support"
_HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"),
    "Content-Type": "application/json",
    "Referer": URL,
}
BASE = pathlib.Path(__file__).resolve().parent.parent.parent

_YEAR_RE = re.compile(r"reporting year\s+(\d{4})")
_PY_RE = re.compile(r"Policy Year\s+(\d+)")
_FOOTNOTE_RE = re.compile(r"(\d+\([a-z0-9]+\))+$", re.I)
_GL16_FLOOR = 2010

_BONUS_MAP = [
    ("reversionary", "reversionary"),
    ("terminal", "terminal"),
    ("annual", "annual"),
    ("extra", "annual"),        # 额外红利
    ("special", "terminal"),    # 特别红利/特别回报
]


def _bonus_of(name: str) -> str | None:
    s = name.lower()
    for kw, bt in _BONUS_MAP:
        if kw in s:
            return bt
    return None


def _clean_value(v: str) -> str:
    s = re.sub(r"\s+", "", v or "")
    s = _FOOTNOTE_RE.sub("", s)
    return s


def _api_dir(fetch_date: str) -> pathlib.Path:
    d = BASE / "data" / "raw" / CODE / fetch_date / "api"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _call_api(endpoint: str, product_code: str, fetch_date: str,
              use_archive: bool) -> dict | None:
    """调用（或复用）API，返回 data 字段。响应归档。"""
    fpath = _api_dir(fetch_date) / f"{product_code}_{endpoint}.json"
    if use_archive and fpath.exists():
        return json.loads(fpath.read_text("utf-8")).get("data")
    try:
        r = requests.post(f"{_API}/{endpoint}",
                          json={"productCode": product_code, "currency": "ALL",
                                "region": "Hong Kong"},
                          headers=_HEADERS, timeout=30)
        if r.status_code != 200:
            return None
        payload = r.json()
    except Exception:
        return None
    fpath.write_text(json.dumps(payload, ensure_ascii=False), "utf-8")
    time.sleep(0.3)
    return payload.get("data")


def _emit(data: dict, metric: str, product_name: str, official_type: str,
          source_url: str, fetch_date: str, facts: list, stats: dict):
    if not data:
        return
    title = (data.get("header") or {}).get("rightTitle", "")
    m = _YEAR_RE.search(title)
    if not m:
        stats["no_reporting_year"] = stats.get("no_reporting_year", 0) + 1
        return
    reporting_year = int(m.group(1))

    years = data.get("years") or []
    col_meta = []
    for y in years:
        my = _PY_RE.search(y)
        if not my:
            col_meta.append(None)
            continue
        py = int(my.group(1))
        if "afterwards" in y or "+" in y:
            col_meta.append({"policy_year": py, "inception_year": _GL16_FLOOR,
                             "inception_year_end": reporting_year - py,
                             "label": y})
        else:
            col_meta.append({"policy_year": py,
                             "inception_year": reporting_year - py,
                             "inception_year_end": None, "label": y})

    for ben in data.get("benefits") or []:
        if metric == "TCVR":
            bonus_type = "tcvr"
        else:
            bonus_type = _bonus_of(ben.get("name", ""))
            if bonus_type is None:
                stats["unknown_bonus"] = stats.get("unknown_bonus", 0) + 1
                continue
        for cm, raw in zip(col_meta, ben.get("values") or []):
            if cm is None:
                continue
            facts.append(make_fact(
                insurer_code=CODE, insurer_short=SHORT,
                product_raw=product_name, product_type_raw=official_type,
                metric=metric, bonus_type=bonus_type,
                reporting_year=reporting_year,
                inception_year=cm["inception_year"],
                raw_value=_clean_value(raw), source_url=source_url,
                fetch_date=fetch_date, currency="所有",
                inception_year_end=cm["inception_year_end"],
                policy_year_label=cm["label"],
                policy_year_override=cm["policy_year"],
            ))
            stats["rows"] += 1


def parse(html: str, source_url: str, fetch_date: str, use_archive: bool = False):
    soup = BeautifulSoup(html, "lxml")
    facts: list[dict] = []
    stats = {"products": 0, "rows": 0, "api_failed": 0}

    products = []
    for li in soup.select(".pro_select_list li"):
        code = li.get("data-value")
        name = (li.get("data-text") or li.get_text(" ", strip=True) or "").strip()
        ptype = li.get("data-type") or ""
        status = li.get("data-status") or ""
        if code and name:
            products.append({"code": code, "name": name,
                             "type": ptype, "status": status})

    for p in products:
        stats["products"] += 1
        div = _call_api("getDividend", p["code"], fetch_date, use_archive)
        tcv = _call_api("getTotalCash", p["code"], fetch_date, use_archive)
        if div is None and tcv is None:
            stats["api_failed"] += 1
            continue
        _emit(div, "FR", p["name"], p["type"], source_url, fetch_date, facts, stats)
        _emit(tcv, "TCVR", p["name"], p["type"], source_url, fetch_date, facts, stats)

    seen, uniq = set(), []
    for f in facts:
        k = fact_id(f)
        if k in seen:
            continue
        seen.add(k)
        uniq.append(f)

    stats["facts"] = len(uniq)
    return uniq, stats, None


if __name__ == "__main__":
    p = pathlib.Path(sys.argv[1])
    archive = "--archive" in sys.argv
    facts, stats, _ = parse(p.read_text("utf-8"), URL, p.parent.parent.name,
                            use_archive=archive)
    print(f"数据点 {len(facts)} 条（有效值 {sum(1 for f in facts if f['kind']=='value')}）")
    print("stats:", stats)
    for f in facts[:8]:
        print(f"  {f['metric']:<5} {str(f['bonus_type']):<12} {f['reporting_year']} "
              f"生效{f['inception_year']} 第{f['policy_year']}年 "
              f"{f['product_raw'][:16]:<18} {f['raw_value']}")
