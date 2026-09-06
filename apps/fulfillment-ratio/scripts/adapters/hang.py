#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""恒生保险 Hang Seng Insurance 适配器（静态通道）。

页面结构（2026-09-05 实测）：
  URL  https://www.hangseng.com/zh-cn/personal/insurance-mpf/fulfillment-ratio/
  .rwd-landing-proposition-item  每个产品一个区块，产品名在 data-key 属性
    内部：h4「报告年度的XX红利之分红实现率 YYYY年」+ 宽表（行=货币，列=保单年度）
    列头：第1个保单年度（2024年生效的保单）… 第10+个保单年度（2010-2014年生效的保单）
  另有「解释说明」个案演示表（参考/实际/已缴总保费…）——口径是个案，必须排除。
  无 TCVR 板块（2026-09-05 未见）。
"""
from __future__ import annotations

import pathlib
import re
import sys

from bs4 import BeautifulSoup

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from schema import fact_id, make_fact, norm_bonus_type

CODE = "HANG"
SHORT = "恒生"
URL = "https://www.hangseng.com/zh-cn/personal/insurance-mpf/fulfillment-ratio/"

_HDR_RE = re.compile(
    r"第\s*(\d+)\s*个?\s*\+?\s*保单年度[（(]\s*(\d{4})\s*年(?:\s*[-–—]\s*(\d{4})\s*年)?生效的保单"
)
# 兼容「第10+个保单年度（2010-2014年生效的保单）」
_HDR_PLUS_RE = re.compile(
    r"第\s*(\d+)\s*\+\s*个保单年度[（(]\s*(\d{4})\s*年?\s*[-–—]\s*(\d{4})\s*年生效的保单"
)
_YEAR_RE = re.compile(r"(\d{4})\s*年")
_GL16_FLOOR = 2010


def _table_context(table):
    """找表格前的「报告年度的XX红利之分红实现率 YYYY年」标题 → (bonus_type, reporting_year)"""
    node = table
    for _ in range(10):
        node = node.find_previous(["h4", "h5", "p", "div"])
        if node is None:
            return None, None
        if node.name == "div" and node.find("table"):
            continue
        t = re.sub(r"\s+", "", node.get_text(" ", strip=True))
        if "分红实现率" in t and len(t) < 120:
            bonus = norm_bonus_type(t)
            m = _YEAR_RE.search(t)
            year = int(m.group(1)) if m else None
            return bonus, year
    return None, None


def parse(html: str, source_url: str, fetch_date: str):
    soup = BeautifulSoup(html, "lxml")
    facts: list[dict] = []
    stats = {"items": 0, "tables_seen": 0, "tables_used": 0, "rows": 0, "example_tables": 0}

    for item in soup.select(".rwd-landing-proposition-item"):
        product_raw = (item.get("data-key") or "").strip()
        if not product_raw:
            continue
        product_raw = product_raw.replace("“", "「").replace("”", "」")
        stats["items"] += 1

        # 按文档序扫 h4/h5/table，记录每张表最近的前置红利标题
        table_ctx: dict[int, tuple[str | None, int | None]] = {}
        last_bonus, last_year = None, None
        for el in item.find_all(["h4", "h5", "table"]):
            if el.name in ("h4", "h5"):
                t = re.sub(r"\s+", "", el.get_text(" ", strip=True))
                if "分红实现率" in t or "紅利" in t or "红利" in t:
                    last_bonus = norm_bonus_type(t)
                    m = _YEAR_RE.search(t)
                    last_year = int(m.group(1)) if m else None
            else:
                table_ctx[id(el)] = (last_bonus, last_year)

        for table in item.find_all("table"):
            stats["tables_seen"] += 1
            rows = table.find_all("tr")
            if len(rows) < 2:
                continue

            header_cells = rows[0].find_all(["th", "td"])
            col_meta: list[dict | None] = []
            for c in header_cells:
                t = re.sub(r"\s+", "", c.get_text(" ", strip=True))
                mb = _HDR_PLUS_RE.search(t)
                if mb:  # 混合桶 2010-2014
                    col_meta.append({"policy_year": int(mb.group(1)),
                                     "inception_year": int(mb.group(2)),
                                     "inception_year_end": int(mb.group(3)),
                                     "label": t})
                    continue
                m = _HDR_RE.search(t)
                if m:
                    col_meta.append({"policy_year": int(m.group(1)),
                                     "inception_year": int(m.group(2)),
                                     "inception_year_end": None, "label": t})
                    continue
                col_meta.append(None)

            if sum(1 for c in col_meta if c is not None) < 3:
                stats["example_tables"] += 1   # 个案演示表等
                continue

            bonus_type, reporting_year = table_ctx.get(id(table), (None, None))
            if reporting_year is None:
                # 从列头反推：第1个保单年度对应生效年份 + 1
                for cm in col_meta:
                    if cm and cm["policy_year"] == 1:
                        reporting_year = cm["inception_year"] + 1
                        break

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
                        product_raw=product_raw, product_type_raw="",
                        metric="FR", bonus_type=bonus_type,
                        reporting_year=reporting_year,
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
    facts, stats, _ = parse(p.read_text("utf-8"), URL, p.parent.parent.name)
    print(f"数据点 {len(facts)} 条（有效值 {sum(1 for f in facts if f['kind']=='value')}）")
    print("stats:", stats)
    for f in facts[:8]:
        print(f"  {str(f['bonus_type']):<12} {f['reporting_year']} 生效{f['inception_year']} "
              f"第{f['policy_year']}年 {f['product_raw'][:18]:<20} {f['currency']:<4} {f['raw_value']}")
