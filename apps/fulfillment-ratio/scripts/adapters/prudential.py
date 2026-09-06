#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""保诚 Prudential 适配器（浏览器渲染通道）。

页面结构（2026-09-05 实测）：
  URL  https://www.prudential.com.hk/performance/fulfillment-ratio/tc/
  纯静态 GET 只返回 481 字节空壳，必须 Playwright 渲染。渲染后约 1MB、121 个表格。

  表格格式（格式 A 的转置版）
    行 = 貨幣（美元 / 港元 / 人民幣 / 英鎊 / 澳元）
    列 = 保單生效年期（保單生效年份）: 1 (2024) 2 (2023) … 10 (2015) 10+ (2015 之前)
  产品名与红利类型写在表格**所在 div.cmp-text 的开头**：
    特級「雋陞」儲蓄保險 II - 整付
    產品類別 : 分紅保險計劃
    2025 報告年度的歸原紅利現金價值分紅實現率
  同一产品的第二个红利类型块只写红利类型、不重复产品名 → 需向上文继承。

  数值形态：100% / N/A(1) / 已停售 / 尚未推出
"""
from __future__ import annotations

import pathlib
import re
import sys

from bs4 import BeautifulSoup, Tag

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from schema import clean_product_name, fact_id, make_fact, norm_bonus_type

CODE = "PRU"
SHORT = "保诚"

# 保诚把两个指标拆成两个页面：FR 一页，TCVR 另一页。
# FR 页里只放一句「按此查閱總現金價值比率」的链接，数据不在本页。
FR_URL = "https://www.prudential.com.hk/performance/fulfillment-ratio/tc/"
TCVR_URL = "https://www.prudential.com.hk/tc/general/performance/total-cash-value-ratio/"
URL = FR_URL
SOURCES = [
    ("fr", FR_URL),
    ("tcvr", TCVR_URL),
]

# 「1 (2024)」「10+ (2015 之前)」
_HDR_RE = re.compile(r"^\s*(\d+)\s*(\+?)\s*[（(]\s*(\d{4})\s*(之前)?\s*[）)]")

# 完整块：产品名 + 產品類別 + 报告年度 + 红利类型
_FULL_RE = re.compile(
    r"^(?P<prod>.+?)\s*產品類別\s*[:：]\s*(?P<cat>.+?)\s*"
    r"(?P<year>\d{4})\s*報告年度的\s*(?P<bonus>.+?)\s*$"
)
# 续块：只有报告年度 + 红利类型，产品名继承上文
_CONT_RE = re.compile(r"^(?P<year>\d{4})\s*報告年度的\s*(?P<bonus>.+?)\s*$")

# GL16 强制披露的最早保单生效年份，用于「10+」桶的下界
GL16_FLOOR_YEAR = 2010


def _block_header_text(table) -> str:
    """取表格所在 div.cmp-text 中、表格之前的说明文字。"""
    host = table.find_parent("div", class_="cmp-text")
    if host is None:
        return ""
    parts = []
    for el in host.children:
        # 必须判断 Tag：NavigableString 自带 str.find，会污染判断
        if not isinstance(el, Tag):
            continue
        if el.find("table") is not None:
            break
        t = re.sub(r"\s+", " ", el.get_text(" ", strip=True)).strip()
        if t:
            parts.append(t)
    return " ".join(parts)


def parse(html: str, source_url: str, fetch_date: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    facts: list[dict] = []
    stats = {"tables_seen": 0, "tables_used": 0, "rows": 0,
             "inherited_product": 0, "no_context": 0}

    current_product = None
    current_category = None

    for table in soup.find_all("table"):
        stats["tables_seen"] += 1
        head = _block_header_text(table)
        if not head:
            stats["no_context"] += 1
            continue

        head_flat = re.sub(r"\s+", " ", head).strip()

        m = _FULL_RE.match(head_flat)
        if m:
            current_product = clean_product_name(m.group("prod"))
            current_category = m.group("cat").strip()
            year = int(m.group("year"))
            bonus_src = m.group("bonus")
        else:
            m = _CONT_RE.match(head_flat)
            if not m:
                stats["no_context"] += 1
                continue
            if current_product is None:
                stats["no_context"] += 1
                continue
            stats["inherited_product"] += 1
            year = int(m.group("year"))
            bonus_src = m.group("bonus")

        bonus_type = norm_bonus_type(bonus_src)
        if bonus_type is None:
            stats["no_context"] += 1
            continue
        metric = "TCVR" if "總現金價值比率" in bonus_src else "FR"

        # ── 表头 → 列元数据 ────────────────────────────────────────
        # 保诚表头是两行：首行「貨幣 / 保單生效年期（保單生效年份 1）」跨列，
        # 次行才是「1 (2024) 2 (2023) …」。取匹配年份最多的一行作表头。
        def _row_meta(tr):
            meta: list[dict | None] = []
            for c in tr.find_all(["th", "td"]):
                t = re.sub(r"\s+", " ", c.get_text(" ", strip=True)).strip()
                mh = _HDR_RE.match(t)
                if not mh:
                    meta.append(None)
                    continue
                py = int(mh.group(1))
                iy = int(mh.group(3))
                is_before = bool(mh.group(4))     # 「2015 之前」
                is_plus = bool(mh.group(2))       # 「10+」
                if is_before or is_plus:
                    # 混合桶：生效年份 ≤ iy-1，下界取 GL16 起点 2010
                    iy_start, iy_end = GL16_FLOOR_YEAR, iy - 1
                else:
                    iy_start = iy_end = iy
                meta.append({
                    "policy_year": py,
                    "inception_year": iy_start,
                    "inception_year_end": iy_end,
                    "is_bucket": is_before or is_plus,
                    "label": t,
                })
            return meta

        rows = table.find_all("tr")
        best_i, col_meta = None, []
        for ri, tr in enumerate(rows):
            m = _row_meta(tr)
            if sum(1 for x in m if x) > sum(1 for x in col_meta if x):
                best_i, col_meta = ri, m

        if best_i is None or not any(c for c in col_meta):
            stats["no_context"] += 1
            continue

        # ── 数据行：每行一个币种 ───────────────────────────────────
        stats["tables_used"] += 1
        for tr in rows[best_i + 1:]:
            tds = tr.find_all(["td", "th"])
            if len(tds) < 2:
                continue

            # 年份表头行可能比数据行少一列（数据行左侧多一个「貨幣」标签列），
            # 实测 row[1] 表头 11 格 vs 数据行 12 格，需偏移对齐
            offset = len(tds) - len(col_meta)

            currency = "所有"
            if offset >= 1:
                cur = tds[0].get_text(" ", strip=True)
                if cur and "貨幣" not in cur:
                    currency = cur
            if offset < 0:
                continue

            for ci, cm in enumerate(col_meta):
                vi = ci + offset
                if cm is None or vi >= len(tds):
                    continue
                raw_val = tds[vi].get_text(" ", strip=True)
                if not raw_val:
                    continue
                facts.append(make_fact(
                    insurer_code=CODE,
                    insurer_short=SHORT,
                    product_raw=current_product,
                    product_type_raw=current_category,
                    metric=metric,
                    bonus_type=bonus_type,
                    reporting_year=year,
                    inception_year=cm["inception_year"],
                    raw_value=raw_val,
                    source_url=source_url,
                    fetch_date=fetch_date,
                    currency=currency,
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
    facts, stats, _ = parse(p.read_text("utf-8"), URL, p.parent.name)
    print(f"数据点 {len(facts)} 条")
    print(f"表格：扫描 {stats['tables_seen']} / 采用 {stats['tables_used']} / 行 {stats['rows']}"
          f" / 继承产品名 {stats['inherited_product']} / 无上下文 {stats['no_context']}")
    for f in facts[:8]:
        print(f"  {f['metric']:<5} {str(f['bonus_type']):<12} {f['reporting_year']} "
              f"{f['currency']:<4} 生效{f['inception_year']} 第{f['policy_year']}年 "
              f"{str(f['product_raw'])[:20]:<22} {f['raw_value']}")
