#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""周大福人寿 CTF Life 适配器（静态通道）。

页面结构（2026-09-05 实测）：
  URL  https://www.ctflife.com.hk/sc/support/important-information/fulfillment-ratios-dividends
  顶层 tab：保单持有人红利理念 / 投资理念 / 【红利/分红的分红实现率】/【总现金价值比率】/ 过往派息率…
  .tab-container__content-pane 按 tab 顺序一一对应，用文本特征识别 FR / TCVR 板块。

  FR/TCVR 板块内：
    .tableStyleRatio__container.fund   每个产品（或产品组）一个容器
      p.text-center.fzBold             产品名 + 类别，如「传承宝」/「源源不绝」/「富天」（已停售） - 分红人寿保险
      table                            表头 类别 | 保单货币 | 2025年度分红实现率 → 1(2024)…11+(2014或之前)
                                       数据行 = 红利类型 × 货币
"""
from __future__ import annotations

import pathlib
import re
import sys

from bs4 import BeautifulSoup

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from schema import (clean_product_name, fact_id, make_fact, norm_bonus_type,
                    split_product_names)

CODE = "CTF"
SHORT = "周大福"
URL = "https://www.ctflife.com.hk/sc/support/important-information/fulfillment-ratios-dividends"

# 列头：1(2024) … 11+(2014或之前)
_COL_RE = re.compile(r"^(\d+)\s*(\+?)\s*[（(]\s*(\d{4})\s*(?:或之前|之前)?\s*[)）]$")
_YEAR_RE = re.compile(r"(\d{4})\s*年度分红实现率|(\d{4})\s*年度总现金价值比率")
_GL16_FLOOR = 2010


def _pane_metric(pane) -> str | None:
    txt = re.sub(r"\s+", "", pane.get_text(" ", strip=True)[:300])
    if txt.startswith("总现金价值比率") or "总现金价值比率以下" in txt:
        return "TCVR"
    if "分红实现率" in txt:
        return "FR"
    return None


def _parse_fund(container, metric, source_url, fetch_date, stats):
    """解析一个产品容器，返回 facts。"""
    facts = []
    title_el = container.select_one("p.text-center.fzBold") or container.find("p")
    if not title_el:
        stats["no_title"] = stats.get("no_title", 0) + 1
        return facts
    title = title_el.get_text(" ", strip=True)
    # 「产品名 - 类别」拆分；产品名可能是「A」/「B」/「C」组合
    if " - " in title:
        names_part, ptype_raw = title.rsplit(" - ", 1)
    else:
        names_part, ptype_raw = title, ""
    # 去掉类别后的补充说明，如（已停售）- 附有可支取现金
    ptype_raw = re.sub(r"[（(].*?[)）]", "", ptype_raw).strip(" -")
    products = split_product_names(names_part) or [clean_product_name(names_part)]
    # 状态标记不属于产品名（已停售/已停售）
    products = [re.sub(r"[（(]\s*已?停售\s*[)）]", "", p).strip() for p in products]
    products = [p for p in products if p]
    if not products:
        return facts

    for table in container.find_all("table"):
        stats["tables_seen"] += 1
        rows = table.find_all("tr")
        if len(rows) < 3:
            continue

        # 报告年度：第一行「YYYY年度分红实现率 / YYYY年度总现金价值比率」
        head_txt = table.get_text(" ", strip=True)
        m_year = _YEAR_RE.search(re.sub(r"\s+", "", head_txt))
        if not m_year:
            continue
        reporting_year = int(m_year.group(1) or m_year.group(2))

        # 列头行：含 1(2024) 的那一行
        col_meta: list[dict | None] = []
        hdr_row = None
        for tr in rows:
            cells = tr.find_all(["th", "td"])
            hits = [_COL_RE.match(re.sub(r"\s+", "", c.get_text(" ", strip=True))) for c in cells]
            if sum(1 for h in hits if h) >= 3:
                hdr_row = tr
                for c, h in zip(cells, hits):
                    raw = re.sub(r"\s+", "", c.get_text(" ", strip=True))
                    if not h:
                        col_meta.append(None)
                        continue
                    py = int(h.group(1))
                    plus = bool(h.group(2))
                    yr = int(h.group(3))
                    if plus:  # 11+(2014或之前)：混合桶
                        col_meta.append({"policy_year": py, "inception_year": _GL16_FLOOR,
                                         "inception_year_end": yr, "label": raw})
                    else:
                        col_meta.append({"policy_year": py, "inception_year": yr,
                                         "inception_year_end": None, "label": raw})
                break
        if hdr_row is None:
            continue

        # 数据行：类别 + 货币 + 各年比率
        stats["tables_used"] += 1
        seen_hdr = False
        for tr in rows:
            if tr is hdr_row:
                seen_hdr = True
                continue
            if not seen_hdr:
                continue
            tds = tr.find_all(["td", "th"])
            if len(tds) < 3:
                continue
            bonus_raw = tds[0].get_text(" ", strip=True)
            currency = tds[1].get_text(" ", strip=True) or "所有"
            bonus_type = norm_bonus_type(bonus_raw)
            if metric == "TCVR":
                bonus_type = "tcvr"
            elif bonus_type is None:
                # 「保单价值」等非标准类别行：不计入，但记下来
                stats["rows_skipped_unknown_bonus"] = stats.get("rows_skipped_unknown_bonus", 0) + 1
                continue

            # 对齐：数据行前两格是 类别/货币，列头行前两格是 类别/保单货币
            offset = len(tds) - sum(1 for c in col_meta if c is not None)
            data_cells = tds[offset:]
            metas = [c for c in col_meta if c is not None]
            for cm, td in zip(metas, data_cells):
                raw_val = td.get_text(" ", strip=True)
                for pname in products:
                    facts.append(make_fact(
                        insurer_code=CODE, insurer_short=SHORT,
                        product_raw=pname, product_type_raw=ptype_raw,
                        metric=metric, bonus_type=bonus_type,
                        reporting_year=reporting_year,
                        inception_year=cm["inception_year"],
                        raw_value=raw_val, source_url=source_url,
                        fetch_date=fetch_date, currency=currency,
                        inception_year_end=cm["inception_year_end"],
                        policy_year_label=cm["label"],
                        policy_year_override=cm["policy_year"],
                    ))
                    stats["rows"] += 1
    return facts


def parse(html: str, source_url: str, fetch_date: str):
    soup = BeautifulSoup(html, "lxml")
    facts: list[dict] = []
    stats = {"tables_seen": 0, "tables_used": 0, "rows": 0}

    for pane in soup.select(".tab-container__content-pane"):
        metric = _pane_metric(pane)
        if metric is None:
            continue
        for container in pane.select(".tableStyleRatio__container.fund"):
            facts += _parse_fund(container, metric, source_url, fetch_date, stats)

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
        print(f"  {f['metric']:<5} {str(f['bonus_type']):<12} {f['reporting_year']} "
              f"生效{f['inception_year']} 第{f['policy_year']}年 "
              f"{f['product_raw'][:16]:<18} {f['currency']:<4} {f['raw_value']}")
