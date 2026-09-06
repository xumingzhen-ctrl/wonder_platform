#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""中银人寿 BOC Life 适配器（静态通道）。

页面结构（2026-09-05 实测）：
  URL  https://www.boclife.com.hk/sc/support/financial-information/dividend-fulfillment-ratios.html
  产品类别 tab（分红终身寿险 / 分红入息计划 / 分红储蓄寿险）下：
    .block-collapse  每个产品一个折叠面板，头部文本 = 产品名
      figure.fulfilment-tabs-tables__table--desktop  桌面版表格（另有 --sm 移动版重复，跳过）
        前置 p.fulfilment-tabs-tables__table-title：「2025年報告年度的终期红利分紅實現率」
        表头：产品类别 | 保单年度(保单生效年份) → 1(2024)…10+(2015之前)
        数据行：行首 = 产品类别（官方粗分类）
  无 TCVR 披露（2026-09-05 页面未见总现金价值比率板块）。
"""
from __future__ import annotations

import pathlib
import re
import sys

from bs4 import BeautifulSoup

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from schema import fact_id, make_fact, norm_bonus_type

CODE = "BOC"
SHORT = "中银人寿"
URL = "https://www.boclife.com.hk/sc/support/financial-information/dividend-fulfillment-ratios.html"

_TITLE_RE = re.compile(r"(\d{4})\s*年報告年度的(.+?)分[紅红]實現率")
_COL_RE = re.compile(r"^(\d+)\s*(\+?)\s*[（(]\s*(\d{4})\s*(?:之前|或之前)?\s*[)）]$")
_GL16_FLOOR = 2010


def parse(html: str, source_url: str, fetch_date: str):
    soup = BeautifulSoup(html, "lxml")
    facts: list[dict] = []
    stats = {"collapses": 0, "tables_seen": 0, "tables_used": 0, "rows": 0}

    for collapse in soup.select(".block-collapse"):
        head = collapse.select_one("[class*=head], [class*=title], h3, h4, button")
        if not head:
            continue
        product_raw = " ".join(head.get_text(" ", strip=True).split())
        if not product_raw:
            continue
        stats["collapses"] += 1

        for fig in collapse.select("figure.fulfilment-tabs-tables__table--desktop"):
            stats["tables_seen"] += 1
            title_p = fig.find_previous("p", class_=re.compile("table-title"))
            title = title_p.get_text(" ", strip=True) if title_p else ""
            m = _TITLE_RE.search(re.sub(r"\s+", "", title))
            if not m:
                stats["no_title"] = stats.get("no_title", 0) + 1
                continue
            reporting_year = int(m.group(1))
            bonus_type = norm_bonus_type(m.group(2))
            if bonus_type is None:
                stats["unknown_bonus"] = stats.get("unknown_bonus", 0) + 1
                continue

            table = fig.find("table")
            if not table:
                continue
            rows = table.find_all("tr")

            # 列头：含 1(2024) 样式的行（可能在第二行，第一行是跨行标题）
            col_meta: list[dict | None] = []
            hdr_idx = None
            for ri, tr in enumerate(rows):
                cells = tr.find_all(["th", "td"])
                hits = [_COL_RE.match(re.sub(r"\s+", "", c.get_text(" ", strip=True))) for c in cells]
                if sum(1 for h in hits if h) >= 3:
                    hdr_idx = ri
                    for c, h in zip(cells, hits):
                        raw = re.sub(r"\s+", "", c.get_text(" ", strip=True))
                        if not h:
                            col_meta.append(None)
                            continue
                        py = int(h.group(1))
                        plus = bool(h.group(2))
                        yr = int(h.group(3))
                        if plus:  # 10+(2015之前) → ≤2014 混合桶
                            col_meta.append({"policy_year": py, "inception_year": _GL16_FLOOR,
                                             "inception_year_end": yr - 1, "label": raw})
                        else:
                            col_meta.append({"policy_year": py, "inception_year": yr,
                                             "inception_year_end": None, "label": raw})
                    break
            if hdr_idx is None:
                continue

            stats["tables_used"] += 1
            metas = [c for c in col_meta if c is not None]
            for tr in rows[hdr_idx + 1:]:
                tds = tr.find_all(["td", "th"])
                if len(tds) < 2:
                    continue
                ptype_raw = tds[0].get_text(" ", strip=True)
                # 数据格对齐：行首 1 格是产品类别
                data_cells = tds[len(tds) - len(metas):]
                for cm, td in zip(metas, data_cells):
                    raw_val = td.get_text(" ", strip=True)
                    facts.append(make_fact(
                        insurer_code=CODE, insurer_short=SHORT,
                        product_raw=product_raw, product_type_raw=ptype_raw,
                        metric="FR", bonus_type=bonus_type,
                        reporting_year=reporting_year,
                        inception_year=cm["inception_year"],
                        raw_value=raw_val, source_url=source_url,
                        fetch_date=fetch_date, currency="所有",
                        inception_year_end=cm["inception_year_end"],
                        policy_year_label=cm["label"],
                        policy_year_override=cm["policy_year"],
                    ))
                    stats["rows"] += 1

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
    facts, stats, _ = parse(p.read_text("utf-8"), URL, p.parent.parent.name)
    print(f"数据点 {len(facts)} 条（有效值 {sum(1 for f in facts if f['kind']=='value')}）")
    print("stats:", stats)
    for f in facts[:8]:
        print(f"  {f['metric']:<5} {str(f['bonus_type']):<12} {f['reporting_year']} "
              f"生效{f['inception_year']} 第{f['policy_year']}年 "
              f"{f['product_raw'][:18]:<20} {f['raw_value']}")
