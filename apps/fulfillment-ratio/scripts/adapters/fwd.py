#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""富卫 FWD 香港适配器（Next.js 内联 JSON 通道，双来源）。

来源 1 — fwd.com.hk（富卫人寿保险（百慕达）等，2026-09-05 实测）：
  汇总页 https://www.fwd.com.hk/regulatory-disclosures/fulfillment-ratios/
  是 Next.js 站，页面内 <script application/json> 的
  props.pageProps.data.data.layout[*].dataComponent.table[0].sections[*].rows[*].columns[*].content
  含产品链接清单（69 个 /regulatory-disclosures/fulfillment-ratios/{slug}/）。
  每个产品页同样是 Next.js 内联 JSON，CSTableContent 块：
    headers  非保證類别 | 保單貨幣 | 保單年度1(2024年發出的保單) … 保單年度10+(2010-2014年發出的保單)
    sections[].rows[].columns[]  (红利类型, 货币, 11 个值)；红利类型格带 row_span 但 JSON 会重复内容
  产品页静态直取即可（无需渲染）。产品页归档 data/raw/FWD/{date}/products/{slug}.html。

来源 2 — fwdlife.hk（富卫人寿（百慕达），英文 PDF 通道）：
  https://www.fwdlife.hk/pdf/regulatory-disclosures/Fulfillment-Ratios.pdf
  8 页文本型 PDF，pdfplumber 抽表：行 = [产品名(跨行None), 红利类型, 11 列 N/A/NN%]。
  归档 data/raw/FWD/{date}/fwdlife-pdf/Fulfillment-Ratios.pdf。

值口径：「不適用 (4)」类脚注剥掉 → not_applicable；报告年度 2025。
"""
from __future__ import annotations

import json
import pathlib
import re
import sys
import time

import requests

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from schema import fact_id, make_fact, norm_bonus_type

CODE = "FWD"
SHORT = "富卫"
URL = "https://www.fwd.com.hk/regulatory-disclosures/fulfillment-ratios/"
SOURCES = [("fwd-tc", URL)]
BASE = pathlib.Path(__file__).resolve().parent.parent.parent

_HEADERS_REQ = {"User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                               "AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36")}
_JSON_RE = re.compile(r'<script[^>]*application/json[^>]*>(.*?)</script>', re.S)
_TAG_RE = re.compile(r"<[^>]+>")
_LINK_RE = re.compile(r'href="(/regulatory-disclosures/fulfillment-ratios/[a-z0-9-]+/)"')
_HDR_PY_RE = re.compile(r"保單年度(\d+)(\+?)\((\d{4})(?:-(\d{4}))?年發出的保單\)")
_FOOT_RE = re.compile(r"\s*[（(]\d+[)）]\s*$")
_GL16_FLOOR = 2010
REPORTING_YEAR = 2025


def _page_json(html: str) -> dict:
    m = _JSON_RE.search(html)
    return json.loads(m.group(1))


def _layout(html: str) -> list:
    return _page_json(html)["props"]["pageProps"]["data"]["data"]["layout"]


def _strip(html_frag: str) -> str:
    return re.sub(r"\s+", " ", _TAG_RE.sub("", html_frag)).strip()


def _hub_products(html: str) -> dict[str, str]:
    """汇总页 → {slug: 产品中文名}"""
    out = {}
    for blk in _layout(html):
        dc = blk.get("dataComponent") or {}
        for tbl in dc.get("table") or []:
            for sec in tbl.get("sections") or []:
                for row in sec.get("rows") or []:
                    for col in row.get("columns") or []:
                        frag = col.get("content") or ""
                        m = _LINK_RE.search(frag)
                        if m:
                            out[m.group(1)] = _strip(frag)
    return out


def _fetch_product(slug: str, fetch_date: str, use_archive: bool) -> str | None:
    fpath = BASE / "data" / "raw" / CODE / fetch_date / "products" / (slug.strip("/").split("/")[-1] + ".html")
    if use_archive and fpath.exists():
        return fpath.read_text("utf-8", errors="replace")
    r = requests.get("https://www.fwd.com.hk" + slug, headers=_HEADERS_REQ, timeout=60)
    if r.status_code != 200:
        return None
    fpath.parent.mkdir(parents=True, exist_ok=True)
    fpath.write_bytes(r.content)
    if not r.encoding or r.encoding.lower() in ("iso-8859-1", "ascii"):
        r.encoding = r.apparent_encoding or "utf-8"
    time.sleep(0.3)
    return r.text


def _parse_product(html: str, product_raw: str, slug: str, fetch_date: str) -> list[dict]:
    facts = []
    for blk in _layout(html):
        if blk.get("nameComponent") != "CSTableContent":
            continue
        for tbl in (blk.get("dataComponent") or {}).get("table") or []:
            headers = [_strip(h.get("content") or "") for h in tbl.get("headers") or []]
            col_meta = []
            for h in headers:
                m = _HDR_PY_RE.search(h)
                if m:
                    py, plus, y0, y1 = int(m.group(1)), m.group(2), int(m.group(3)), m.group(4)
                    col_meta.append({"policy_year": py,
                                     "inception_year": _GL16_FLOOR if plus else y0,
                                     "inception_year_end": int(y1) if y1 else None,
                                     "label": h})
                else:
                    col_meta.append(None)
            data_cols = [c for c in col_meta if c]
            for sec in tbl.get("sections") or []:
                for row in sec.get("rows") or []:
                    cells = [_strip(c.get("content") or "") for c in row.get("columns") or []]
                    if len(cells) < 2 + len(data_cols):
                        continue
                    bonus_raw, currency = cells[0], cells[1]
                    bonus_type = norm_bonus_type(bonus_raw)
                    values = cells[2:2 + len(data_cols)]
                    for cm, raw in zip(data_cols, values):
                        facts.append(make_fact(
                            insurer_code=CODE, insurer_short=SHORT,
                            product_raw=product_raw, product_type_raw="",
                            metric="FR", bonus_type=bonus_type,
                            reporting_year=REPORTING_YEAR,
                            inception_year=cm["inception_year"],
                            raw_value=_FOOT_RE.sub("", raw).strip(),
                            source_url="https://www.fwd.com.hk" + slug,
                            fetch_date=fetch_date, currency=currency or "所有",
                            inception_year_end=cm["inception_year_end"],
                            policy_year_label=cm["label"],
                            policy_year_override=cm["policy_year"] if cm["inception_year_end"] else None,
                        ))
    return facts


def parse(html: str, source_url: str, fetch_date: str, use_archive: bool = False):
    products = _hub_products(html)
    facts: list[dict] = []
    stats = {"hub_products": len(products), "fetched": 0, "failed": [], "rows": 0}

    for slug, name in sorted(products.items()):
        ph = _fetch_product(slug, fetch_date, use_archive)
        if not ph:
            stats["failed"].append(slug)
            continue
        stats["fetched"] += 1
        sub = _parse_product(ph, name or slug, slug, fetch_date)
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
