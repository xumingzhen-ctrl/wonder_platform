#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""安盛 AXA 香港适配器（汇总页渲染 + 产品页静态通道）。

背景（2026-09-05 实测）：
  真正的汇总页是 https://www.axa.com.hk/zh/fulfilment-ratios-and-total-value-ratios
  （保监局索引里的 /zh/article/fulfilment-ratios-and-total-value-ratios 只是营销壳）。
  汇总页渲染后内嵌产品清单 JSON：
    {"category":"人壽保障及儲蓄 - 儲蓄為主","product":"摯匯儲蓄計劃",
     "target":{"href":"/zh/fulfilment-ratios-total-value-ratios-fortunextra-savings-plan"}}
  → 50 个产品，每个产品一个独立页，静态直取即可拿到全部表格。

  产品页表格（桌面/移动重复渲染，fact_id 去重兜底）：
    表头  第1個保單年度(2024年) … 第10個保單年度(2015年) 第10個保單年度+(2014年或之前)
    数据行结构：['', '标签'] 小节行 + ['标签', 值…] 数据行
    标签 = 「港元保單貨幣 – 終期紅利」「非港元保單貨幣 – 總價值」
      → 總價值 = TCVR；其余红利名 = FR（norm_bonus_type）
    值带脚注「不適用 (a)」剥掉 → not_applicable
  报告年度 2025（表头第 1 年=2024 生效交叉验证）。
  产品页归档 data/raw/AXA/{date}/products/{slug}.html。
"""
from __future__ import annotations

import pathlib
import re
import sys
import time

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from schema import fact_id, make_fact, norm_bonus_type

CODE = "AXA"
SHORT = "安盛"
URL = "https://www.axa.com.hk/zh/fulfilment-ratios-and-total-value-ratios"
SOURCES = [("zh-hub-render", URL)]
BASE = pathlib.Path(__file__).resolve().parent.parent.parent

_HEADERS_REQ = {"User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                               "AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36")}
_PROD_RE = re.compile(
    r'\{"category":"([^"]*)","product":"([^"]*)",'
    r'"target":\{"href":"(/zh/fulfilment-ratios-total-value-ratios-[^"]+)"\}')
_HDR_RE = re.compile(r"第\s*(\d+)\s*個\s*保單年度\s*(\+?)\s*[（(]\s*(\d{4})\s*年(?:或之前)?[)）]")
_LABEL_RE = re.compile(r"(港元|非港元)保單貨幣\s*[–—-]\s*(.+)")
_FOOT_RE = re.compile(r"\s*[（(][a-z0-9]+[)）]\s*$", re.I)
_GL16_FLOOR = 2010


def _hub_products(html: str) -> list[dict]:
    seen, out = set(), []
    for cat, prod, href in _PROD_RE.findall(html):
        if href in seen:
            continue
        seen.add(href)
        out.append({"category": cat, "product": prod, "href": href})
    return out


def _fetch_product(href: str, fetch_date: str, use_archive: bool) -> str | None:
    slug = href.strip("/").split("/")[-1]
    fpath = BASE / "data" / "raw" / CODE / fetch_date / "products" / (slug + ".html")
    if use_archive and fpath.exists():
        return fpath.read_text("utf-8", errors="replace")
    r = requests.get("https://www.axa.com.hk" + href, headers=_HEADERS_REQ, timeout=60)
    if r.status_code != 200:
        return None
    fpath.parent.mkdir(parents=True, exist_ok=True)
    fpath.write_bytes(r.content)
    if not r.encoding or r.encoding.lower() in ("iso-8859-1", "ascii"):
        r.encoding = r.apparent_encoding or "utf-8"
    time.sleep(0.3)
    return r.text


def _parse_product(html: str, product_raw: str, category: str, href: str,
                   fetch_date: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    facts = []
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue
        hdr_cells = rows[0].find_all(["th", "td"])
        col_meta = []
        for c in hdr_cells:
            t = re.sub(r"\s+", " ", c.get_text(" ", strip=True))
            m = _HDR_RE.search(t)
            if m:
                py, plus, y0 = int(m.group(1)), m.group(2), int(m.group(3))
                col_meta.append({"policy_year": py,
                                 "inception_year": _GL16_FLOOR if plus else y0,
                                 "inception_year_end": y0 if plus else None,
                                 "label": t})
            else:
                col_meta.append(None)
        metas = [c for c in col_meta if c]
        if len(metas) < 3:
            continue  # 公式/示例表
        reporting_year = None
        for cm in metas:
            if cm["policy_year"] == 1:
                reporting_year = cm["inception_year"] + 1
                break
        for tr in rows[1:]:
            cells = [re.sub(r"\s+", " ", c.get_text(" ", strip=True))
                     for c in tr.find_all(["th", "td"])]
            if not cells or not cells[0]:
                continue  # 小节标题行
            lm = _LABEL_RE.match(cells[0])
            if not lm:
                continue
            currency = lm.group(1)
            kind_raw = lm.group(2).strip()
            if kind_raw == "總價值":
                metric, bonus_type = "TCVR", "tcvr"
            else:
                metric, bonus_type = "FR", norm_bonus_type(kind_raw)
            values = cells[1:1 + len(metas)]
            for cm, raw in zip(metas, values):
                facts.append(make_fact(
                    insurer_code=CODE, insurer_short=SHORT,
                    product_raw=product_raw, product_type_raw=category,
                    metric=metric, bonus_type=bonus_type,
                    reporting_year=reporting_year,
                    inception_year=cm["inception_year"],
                    raw_value=_FOOT_RE.sub("", raw).strip(),
                    source_url="https://www.axa.com.hk" + href,
                    fetch_date=fetch_date, currency=currency,
                    inception_year_end=cm["inception_year_end"],
                    policy_year_label=cm["label"],
                    policy_year_override=cm["policy_year"] if cm["inception_year_end"] else None,
                ))
    return facts


def parse(html: str, source_url: str, fetch_date: str, use_archive: bool = False):
    products = _hub_products(html)
    facts: list[dict] = []
    stats = {"hub_products": len(products), "fetched": 0, "failed": [], "rows": 0}

    for p in products:
        ph = _fetch_product(p["href"], fetch_date, use_archive)
        if not ph:
            stats["failed"].append(p["href"])
            continue
        stats["fetched"] += 1
        sub = _parse_product(ph, p["product"], p["category"], p["href"], fetch_date)
        facts += sub
        stats["rows"] += len(sub)

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
    facts, stats, _ = parse(p.read_text("utf-8", errors="replace"), URL,
                            p.parent.parent.name, use_archive="--archive" in sys.argv)
    print(f"数据点 {len(facts)} 条（有效值 {sum(1 for f in facts if f['kind']=='value')}）")
    print("stats:", {k: v for k, v in stats.items() if k != "failed"}, "failed:", len(stats["failed"]))
