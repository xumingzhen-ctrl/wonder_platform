#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""汇丰人寿 HSBC Life 适配器（静态通道，多页面源）。

页面结构（2026-09-05 实测）：
  入口页 https://www.hsbc.com.hk/zh-cn/misc/insurance/fulfillment-ratio/ 只有演示个案，
  真实数据按官方品类拆三个子页（SOURCES）：
    whole-life  终身人寿 | endowment 储蓄人寿 | annuity 年金

  子页内：每个产品一对「宽表 + 长表」（响应式重复，内容相同），只解析宽表：
    宽表：行 = 货币，列 = 2024年生效的保单（第1个保单年度）…2015年之前生效的保单（保单年度10+）
    产品名 = 表格前最近的 h3。
  汇丰每产品只披露单一实现率序列，不区分红利类型 → bonus_type=None。
  无 TCVR 板块（2026-09-05 未见）。
"""
from __future__ import annotations

import pathlib
import re
import sys

from bs4 import BeautifulSoup

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from schema import fact_id, make_fact

CODE = "HSBC"
SHORT = "汇丰人寿"
URL = "https://www.hsbc.com.hk/zh-cn/misc/insurance/fulfillment-ratio/"
_BASE = URL
SOURCES = [
    ("whole-life", _BASE + "whole-life/"),
    ("endowment", _BASE + "endowment/"),
    ("annuity", _BASE + "annuity/"),
]
_OFFICIAL_TYPE = {
    "whole-life": "终身人寿",
    "endowment": "储蓄人寿",
    "annuity": "年金",
}

# 列头两种形态
_COL_RE = re.compile(r"(\d{4})\s*年生效的保单[（(]第\s*(\d+)\s*个保单年度")
_BUCKET_RE = re.compile(r"(\d{4})\s*年之前生效的保单[（(]保单年度\s*(\d+)\s*\+")
_GL16_FLOOR = 2010


def _product_name_of(table):
    node = table
    for _ in range(8):
        node = node.find_previous(["h3", "h4", "h2"])
        if node is None:
            return ""
        t = node.get_text(" ", strip=True)
        if t and "分红实现率" not in t and len(t) < 60:
            return t
    return ""


def parse(html: str, source_url: str, fetch_date: str):
    soup = BeautifulSoup(html, "lxml")
    facts: list[dict] = []
    stats = {"tables_seen": 0, "tables_used": 0, "rows": 0}
    slug = source_url.rstrip("/").split("/")[-1]
    official_type = _OFFICIAL_TYPE.get(slug, "")

    for table in soup.find_all("table"):
        stats["tables_seen"] += 1
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue

        # 宽表识别：首行第二格起含「YYYY年生效的保单（第N个保单年度）」
        header_cells = rows[0].find_all(["th", "td"])
        col_meta: list[dict | None] = []
        for c in header_cells:
            t = re.sub(r"\s+", "", c.get_text(" ", strip=True))
            m = _COL_RE.search(t)
            if m:
                col_meta.append({"policy_year": int(m.group(2)),
                                 "inception_year": int(m.group(1)),
                                 "inception_year_end": None, "label": t})
                continue
            mb = _BUCKET_RE.search(t)
            if mb:  # 2015年之前生效（保单年度10+）→ ≤2014 混合桶
                col_meta.append({"policy_year": int(mb.group(2)),
                                 "inception_year": _GL16_FLOOR,
                                 "inception_year_end": int(mb.group(1)) - 1,
                                 "label": t})
                continue
            col_meta.append(None)

        if sum(1 for c in col_meta if c is not None) < 3:
            continue  # 长表/个案表，跳过

        product_raw = _product_name_of(table)
        if not product_raw:
            stats["no_product"] = stats.get("no_product", 0) + 1
            continue

        stats["tables_used"] += 1
        metas = [c for c in col_meta if c is not None]
        for tr in rows[1:]:
            tds = tr.find_all(["td", "th"])
            if len(tds) < 2:
                continue
            currency = tds[0].get_text(" ", strip=True) or "所有"
            data_cells = tds[len(tds) - len(metas):]
            for cm, td in zip(metas, data_cells):
                raw_val = td.get_text(" ", strip=True)
                facts.append(make_fact(
                    insurer_code=CODE, insurer_short=SHORT,
                    product_raw=product_raw, product_type_raw=official_type,
                    metric="FR", bonus_type=None,
                    reporting_year=2025,  # 表头年份反推：2024生效=第1保单年度
                    inception_year=cm["inception_year"],
                    raw_value=raw_val, source_url=source_url,
                    fetch_date=fetch_date, currency=currency,
                    inception_year_end=cm["inception_year_end"],
                    policy_year_label=cm["label"],
                    policy_year_override=cm["policy_year"],
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
    p = pathlib.Path(sys.argv[1])
    facts, stats, _ = parse(p.read_text("utf-8"), p.parent.name + "/", p.parent.parent.name)
    print(f"数据点 {len(facts)} 条（有效值 {sum(1 for f in facts if f['kind']=='value')}）")
    print("stats:", stats)
    for f in facts[:6]:
        print(f"  {f['reporting_year']} 生效{f['inception_year']} 第{f['policy_year']}年 "
              f"{f['product_raw'][:18]:<20} {f['currency']:<4} {f['raw_value']}")
