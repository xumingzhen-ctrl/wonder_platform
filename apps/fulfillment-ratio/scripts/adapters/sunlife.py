#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""永明金融 Sun Life 适配器（静态通道）。

页面结构（2026-09-05 实测）：
  URL  https://www.sunlife.com.hk/zh-hans/insurance/fulfillment-ratios-of-respective-products/
  注意：保监局索引给的 savings-and-life 路径只含「个案」演示表，
        真正的产品级数据在这个路径下。索引 URL 不可盲信。

  .cmp-tabs__tabpanel[3] 各产品的分红实现率      (77 个表, 每表 1 个产品)
  .cmp-tabs__tabpanel[4] 分红产品总现金价值比率  (48 个表)
  .cmp-tabs__tabpanel[2] 个案一~八 营销个险演示  (8 个表) ← 口径不同，必须排除

  表格格式（格式 A：列 = 保单生效年份）
    产品 | 产品种类 | 第 1 个保单年度（于 2024 年开始生效之保单）| … | 第 10 个保单年度+（于 2010 年及 2014 年开始生效之保单）
  红利类型与报告年度写在表格**前一段标题**里，如
    「各产品的 2025 报告年度的归原红利之分红实现率」
"""
from __future__ import annotations

import pathlib
import re
import sys

from bs4 import BeautifulSoup

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from schema import (clean_product_name, fact_id, make_fact, norm_bonus_type,
                    split_product_names)

CODE = "SUN"
SHORT = "永明"
URL = ("https://www.sunlife.com.hk/zh-hans/insurance/"
       "fulfillment-ratios-of-respective-products/")

# 表头：「第 N 个保单年度+（于 YYYY 年及 YYYY 年开始生效之保单）」
# 实测原站有「保 单」中间带空格的情况，正则需容忍空白
_HDR_RE = re.compile(
    r"第\s*(\d+)\s*个保单年度\s*(\+?)\s*[（(]\s*于\s*"
    r"(\d{4})\s*年(?:\s*及\s*(\d{4})\s*年)?[^）)]*[）)]"
)
_YEAR_RE = re.compile(r"(\d{4})\s*报告年度")

# 需要排除的板块（营销性质的个险演示，非 GL16 产品级聚合数据）
_EXCLUDE_PANEL_HINTS = ("个案",)


def _panel_metric(panel) -> str | None:
    """判断某个 tabpanel 是 FR 还是 TCVR 板块；个案板块返回 None 表示跳过。"""
    txt = re.sub(r"\s+", "", panel.get_text(" ", strip=True))
    if any(h in txt for h in _EXCLUDE_PANEL_HINTS):
        # 个案演示板块——口径是个别保单，不是产品聚合，绝不混入
        return None
    if "总现金价值比率" in txt:
        return "TCVR"
    if "分红实现率" in txt:
        return "FR"
    return None


def _heading_of(table) -> str:
    """取表格前最近的段落/标题文本，里面含报告年度与红利类型。"""
    node = table
    for _ in range(6):
        node = node.find_previous(["h1", "h2", "h3", "h4", "h5", "p", "div"])
        if node is None:
            return ""
        if node.name == "div" and node.find("table"):
            continue
        t = node.get_text(" ", strip=True)
        if 6 < len(t) < 200 and ("报告年度" in t or "红利" in t):
            return t
    return ""


def parse(html: str, source_url: str, fetch_date: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    facts: list[dict] = []
    stats = {"tables_seen": 0, "tables_used": 0, "rows": 0}

    for panel in soup.select(".cmp-tabs__tabpanel"):
        metric = _panel_metric(panel)
        if metric is None:
            continue

        for table in panel.find_all("table"):
            stats["tables_seen"] += 1
            head = _heading_of(table)
            if not head:
                continue

            m_year = _YEAR_RE.search(head)
            if not m_year:
                continue
            reporting_year = int(m_year.group(1))

            bonus_type = norm_bonus_type(head)
            if bonus_type is None:
                continue

            # ── 表头 → 列元数据 ────────────────────────────────────
            header_cells = table.find_all("tr")[0].find_all(["th", "td"])
            col_meta: list[dict | None] = []
            for th in header_cells:
                t = re.sub(r"\s+", "", th.get_text(" ", strip=True))
                m = _HDR_RE.search(t)
                if not m:
                    col_meta.append(None)      # 产品名 / 产品种类列
                    continue
                py = int(m.group(1))
                iy = int(m.group(3))
                iy_end = int(m.group(4)) if m.group(4) else None
                col_meta.append({
                    "policy_year": py,
                    "inception_year": iy,
                    "inception_year_end": iy_end,
                    "is_bucket": bool(m.group(2)) or iy_end is not None,
                    "label": t,
                })

            if not any(c for c in col_meta):
                continue

            # ── 数据行 ────────────────────────────────────────────
            stats["tables_used"] += 1
            for tr in table.find_all("tr")[1:]:
                tds = tr.find_all(["td", "th"])
                if len(tds) < 3:
                    continue
                prod_raw = tds[0].get_text(" ", strip=True)
                if not prod_raw or "产品" in prod_raw:
                    continue
                ptype_raw = tds[1].get_text(" ", strip=True) if len(tds) > 1 else ""

                products = split_product_names(prod_raw) or [clean_product_name(prod_raw)]
                if not products or not products[0]:
                    continue

                for ci, cm in enumerate(col_meta):
                    if cm is None:
                        continue
                    vi = ci
                    if vi >= len(tds):
                        continue
                    raw_val = tds[vi].get_text(" ", strip=True)

                    for pname in products:
                        facts.append(make_fact(
                            insurer_code=CODE,
                            insurer_short=SHORT,
                            product_raw=pname,
                            product_type_raw=ptype_raw,
                            metric=metric,
                            bonus_type=bonus_type,
                            reporting_year=reporting_year,
                            inception_year=cm["inception_year"],
                            raw_value=raw_val,
                            source_url=source_url,
                            fetch_date=fetch_date,
                            currency="所有",
                            inception_year_end=cm["inception_year_end"],
                            policy_year_label=cm["label"],
                            policy_year_override=cm["policy_year"],
                        ))
                        stats["rows"] += 1

    # 去重（同一产品可能出现于同一板块的不同表）
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
    res = parse(p.read_text("utf-8"), URL, p.parent.name)
    facts, stats = res[0], res[1]
    print(f"数据点 {len(facts)} 条")
    print(f"表格：扫描 {stats['tables_seen']} / 采用 {stats['tables_used']} / 行 {stats['rows']}")
    for f in facts[:8]:
        print(f"  {f['metric']:<5} {f['bonus_type']:<12} {f['reporting_year']} "
              f"生效{f['inception_year']} 第{f['policy_year']}年 "
              f"{f['product_raw'][:16]:<18} {f['raw_value']}")
