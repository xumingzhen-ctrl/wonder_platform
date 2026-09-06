#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""宏利 Manulife 适配器（jQuery .load() + POST ajax 通道）。

通道（2026-09-05 实测，Akamai 级反爬）：
  主页  https://www.manulife.com.hk/zh-hk/about-us/regulatory-disclosures/fulfillment-ratio.html
  页面本身不含数据：fulfillment-zh.js 把工具页 HTML 片段 .load() 进 #fulfillment-content，
  产品选定后 cus.js 再 POST：
    FR   https://tools.manulife.com.hk/fulfillment-ratio-2024/html/ajax/ss1.php
    TCVR https://tools.manulife.com.hk/fulfillment-tcv-2024/html/ajax/ss1.php
    form = {selected1: 产品名, selected2: 货币|"", tablabel: "null", lang: "tc"}
  静态 requests / 默认 Playwright Chromium 全部 403；
  必须用 Playwright channel="chrome"（真 Chrome 二进制）建立会话，
  再用同会话 ctx.request.post 调 API（scripts/fetch_manu.py 已归档全部 163 份响应）。

归档结构：
  data/raw/MANU/{date}/api/_index.json       [{file, metric(fr|tcv), product, currency}]
  data/raw/MANU/{date}/api/fr-NNN.html       某产品×货币的 FR 响应（HTML 片段，可含多个红利板块）
  data/raw/MANU/{date}/api/tcv-NNN.html      同上的 TCVR 响应
  data/raw/MANU/{date}/product-list.json     产品清单（61 FR + 38 TCV）

响应结构（每个 .result-grid = 一个红利板块）：
  <h2>{每年|終期|特別}紅利之分紅實現率</h2> 或 <h2>總現金價值比率</h2>
  thead: 產品系列 | 產品種類 | 保單貨幣 | {YYYY}申報年度之…（colspan=11）
  tbody 两行为一组：
    行1: [产品名(rowspan2, 含「(於…生效的保單)」附注), 产品种类(rowspan2), 货币(rowspan2),
          11 个列标签 保單年度N（於YYYY年生效的保單）…保單年度10+（於2010-2014年生效的保單）]
    行2: 11 个值 <span>100%</span> 或 不適用 <span class="superscript">n</span>
  无数据脚注（官方定义）：
    1 = 没有生效的（已终止的）相关保单  → no_policy / no_terminated_policy
    2 = 销售时所示非保证金额为零      → not_applicable
    3 = 尚未推出                      → not_launched
    4 = 已停售                        → discontinued
  16 个响应为「找不到结果」空页（产品×该货币无保单），跳过。

已知限制：同一产品可能有多个「生效時期」分页（getProductDetails(period)），
归档只覆盖默认（最新）时期，旧时期数据未取（后续可用 tablabel 参数补抓）。
"""
from __future__ import annotations

import json
import pathlib
import re
import sys

from bs4 import BeautifulSoup

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from schema import BASE, fact_id, make_fact, norm_bonus_type

CODE = "MANU"
SHORT = "宏利"
URL = "https://www.manulife.com.hk/zh-hk/about-us/regulatory-disclosures/fulfillment-ratio.html"
SOURCES = [("zh-hk", URL)]
REPORTING_YEAR = 2025
_GL16_FLOOR = 2010

_COL_RE = re.compile(r"保單年度\s*(\d+)\s*(\+?)\s*（於\s*(\d{4})(?:-(\d{4}))?年生效的保單）")
_RPT_RE = re.compile(r"(\d{4})\s*申報年度")
_PERIOD_RE = re.compile(r"\s*[（(]於[^）)]*生效的保單[）)]\s*$")

# 「不適用 n」脚注 → schema 无数据 token（NO_DATA_TOKENS 已收录）
_NODATA_BY_FOOTNOTE = {
    "2": "不適用",
    "3": "尚未推出",
    "4": "已停售",
}


def _product_name(td) -> str:
    """产品名 td：取第一个 span 文本；兜底剥掉 (於…生效的保單) 附注。"""
    sp = td.find("span")
    if sp and sp.get_text(strip=True):
        return sp.get_text(strip=True)
    return _PERIOD_RE.sub("", td.get_text(" ", strip=True))


def _col_metas(label_cells) -> list[dict]:
    metas = []
    for c in label_cells:
        m = _COL_RE.search(c.get_text(" ", strip=True))
        if not m:
            continue
        py = int(m.group(1))
        y0 = int(m.group(3))
        if m.group(2) == "+":  # 混合桶 保單年度10+（於2010-2014年生效的保單）
            metas.append({"policy_year": py, "inception_year": y0,
                          "inception_year_end": int(m.group(4)) if m.group(4) else y0,
                          "label": c.get_text(" ", strip=True)})
        else:
            metas.append({"policy_year": py, "inception_year": y0,
                          "inception_year_end": None,
                          "label": c.get_text(" ", strip=True)})
    return metas


def _value_raw(td, bonus_type: str) -> str:
    """值 td → 原始字符串。剥离上标脚注，按脚注号映射无数据原因。"""
    sup = td.find("span", class_="superscript")
    foot = sup.get_text(strip=True) if sup else None
    txt = td.get_text(" ", strip=True)
    if foot:
        txt = txt.replace(foot, "").strip()
    if "不適用" in txt or "不适用" in txt:
        if foot == "1":
            # 每年紅利：沒有生效的相關保單；終期/TCVR：沒有已終止的相關保單
            return "沒有保單" if bonus_type == "annual" else "沒有保單終結"
        return _NODATA_BY_FOOTNOTE.get(foot, "不適用")
    return txt


def _parse_fragment(html: str, metric_hint: str, meta: dict,
                    source_url: str, fetch_date: str):
    """解析一份 API 响应，返回 (facts, stats)。"""
    facts: list[dict] = []
    stats = {"grids": 0, "blocks": 0, "empty": False}
    soup = BeautifulSoup(html, "lxml")
    grids = [g for g in soup.select(".result-grid") if g.find("h2")]
    if not grids:
        stats["empty"] = True
        return facts, stats

    for grid in grids:
        h2 = grid.find("h2").get_text(strip=True)
        bonus_type = norm_bonus_type(h2)
        if bonus_type is None:
            continue
        metric = "TCVR" if bonus_type == "tcvr" else "FR"
        stats["grids"] += 1

        for tbl in grid.find_all("table"):
            thead_txt = tbl.find("thead").get_text(" ", strip=True) if tbl.find("thead") else ""
            m = _RPT_RE.search(thead_txt)
            rpt_year = int(m.group(1)) if m else REPORTING_YEAR

            rows = tbl.find_all("tr")
            i = 0
            while i < len(rows):
                cells = rows[i].find_all(["td", "th"], recursive=False)
                # 块首行：≥3 个元信息格 + ≥3 个保單年度列标签
                if len(cells) >= 6 and sum(1 for c in cells if _COL_RE.search(
                        c.get_text(" ", strip=True))) >= 3:
                    label_idx = [j for j, c in enumerate(cells)
                                 if _COL_RE.search(c.get_text(" ", strip=True))]
                    meta_cells = cells[:label_idx[0]]
                    col_meta = _col_metas([cells[j] for j in label_idx])
                    if len(meta_cells) >= 3 and col_meta and i + 1 < len(rows):
                        product = _product_name(meta_cells[0])
                        ptype = meta_cells[1].get_text(" ", strip=True)
                        currency = meta_cells[2].get_text(" ", strip=True) or meta.get("currency") or "所有"
                        val_cells = rows[i + 1].find_all("td", recursive=False)
                        for cm, vtd in zip(col_meta, val_cells):
                            facts.append(make_fact(
                                insurer_code=CODE, insurer_short=SHORT,
                                product_raw=product, product_type_raw=ptype,
                                metric=metric, bonus_type=bonus_type,
                                reporting_year=rpt_year,
                                inception_year=cm["inception_year"],
                                raw_value=_value_raw(vtd, bonus_type),
                                source_url=source_url, fetch_date=fetch_date,
                                currency=currency,
                                inception_year_end=cm["inception_year_end"],
                                policy_year_label=cm["label"],
                                policy_year_override=cm["policy_year"]
                                if cm["inception_year_end"] else None,
                            ))
                        stats["blocks"] += 1
                    i += 2
                else:
                    i += 1
    return facts, stats


def parse(html: str, source_url: str, fetch_date: str, use_archive: bool = False):
    """入口。page.html 只是外壳，数据全在已归档的 API 响应里。"""
    api_dir = BASE / "data" / "raw" / CODE / fetch_date / "api"
    idx_path = api_dir / "_index.json"
    if not idx_path.exists():
        return [], {"error": "缺少 API 归档，请先运行 scripts/fetch_manu.py"}, None

    index = json.loads(idx_path.read_text("utf-8"))
    facts: list[dict] = []
    stats = {"api_files": len(index), "empty_files": 0, "grids": 0,
             "blocks": 0, "files_ok": 0}

    for meta in index:
        fp = api_dir / meta["file"]
        if not fp.exists():
            continue
        sub_facts, sub_stats = _parse_fragment(
            fp.read_text("utf-8"), meta["metric"], meta, source_url, fetch_date)
        if sub_stats["empty"]:
            stats["empty_files"] += 1
        else:
            stats["files_ok"] += 1
        stats["grids"] += sub_stats["grids"]
        stats["blocks"] += sub_stats["blocks"]
        facts += sub_facts

    seen, uniq = set(), []
    for f in facts:
        k = fact_id(f) + f"|{f['currency']}"
        if k in seen:
            continue
        seen.add(k)
        uniq.append(f)

    stats["facts"] = len(uniq)
    stats["products"] = len({f["product_raw"] for f in uniq})
    return uniq, stats, None


if __name__ == "__main__":
    date = sys.argv[1] if len(sys.argv) > 1 else "2026-09-05"
    facts, stats, _ = parse("", URL, date)
    vals = sum(1 for f in facts if f["kind"] == "value")
    print(f"数据点 {len(facts)} 条（有效值 {vals}，产品 {stats.get('products')}）")
    print("stats:", stats)
    if facts:
        vals_pct = [f["ratio_pct"] for f in facts if f["kind"] == "value"]
        if vals_pct:
            print(f"比率区间 {min(vals_pct)}–{max(vals_pct)}，"
                  f"中位 {sorted(vals_pct)[len(vals_pct)//2]}")
        from collections import Counter
        print("metric:", Counter(f["metric"] for f in facts))
        print("bonus:", Counter(f["bonus_type"] for f in facts))
