#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""国寿海外 China Life Overseas 适配器（静态 + 内联 JS 数据数组通道）。

页面结构（2026-09-05 实测）：
  URL  https://www.chinalife.com.hk/zh-hk/about-us/philosophy （红利及派息理念页）
  GL16 产品级数据不在 HTML 表格里，而是内联在 <script> clio_prd_dividend() 中：
    var policyYears = ["第一個保單年度(2024)", …, "第十個保單年度(2015)",
                       "第十個保單年度+(2014或以前)"];   # 11 列
    var dataSets1 = [[产品名, "保險種類：X", "適用於…保單", 11 个值], …]  → #part1 = 週年紅利
    var dataSets2 = [[…]]                                                   → #part2 = 終期紅利
    var dataSets3 = []                                                      → #part3 = 累積利息（空，且非分红实现率，跳过）
  申报年度：2025 年（页内 h3 明示；policyYears 第 1 列=2024 生效，可交叉验证）。
  同一产品可能有多行（不同货币适用范围行），行 = 产品 × 货币。
  值只有「NNN%」与「不適用」两种。
  无 TCVR 板块。官网另有 9.8MB 扫描版「分红实现率指南」PDF——纯营销亮点节选，不使用。
"""
from __future__ import annotations

import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from schema import fact_id, make_fact

CODE = "CLO"
SHORT = "国寿海外"
URL = "https://www.chinalife.com.hk/zh-hk/about-us/philosophy"
SOURCES = [("zh-hk", URL)]
REPORTING_YEAR = 2025
_GL16_FLOOR = 2010

_CN_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
           "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}
_PY_RE = re.compile(r"第([一二三四五六七八九十]+)個保單年度(\+?)\((\d{4})(?:或以前)?\)")

# dataSets → (bonus_type, 是否使用)
_DATASETS = {"dataSets1": "annual", "dataSets2": "terminal"}


def _extract_var(name: str, html: str) -> list | None:
    """从 <script> 中 bracket-match 提取 var NAME = [...]，转 JSON 解析。"""
    i = html.find("var %s = [" % name)
    if i < 0:
        return None
    j = html.index("[", i)
    depth = 0
    for k in range(j, len(html)):
        c = html[k]
        if c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                raw = html[j:k + 1]
                cleaned = re.sub(r",(\s*[\]\}])", r"\1", raw)  # 去尾逗号
                return json.loads(cleaned)
    return None


def _parse_policy_years(labels: list[str]) -> list[dict]:
    """列头 → [{policy_year, inception_year, inception_year_end, label}]"""
    metas = []
    for lab in labels:
        m = _PY_RE.search(lab)
        if not m:
            continue
        py = _CN_NUM[m.group(1)]
        y0 = int(m.group(3))
        if m.group(2) == "+":  # 混合桶 第十個保單年度+(2014或以前)
            metas.append({"policy_year": py, "inception_year": _GL16_FLOOR,
                          "inception_year_end": y0, "label": lab})
        else:
            metas.append({"policy_year": py, "inception_year": y0,
                          "inception_year_end": None, "label": lab})
    return metas


def _norm_currency(cell: str) -> str:
    m = re.search(r"適用於(.+?)保單", cell)
    if not m:
        return cell or "所有"
    cur = m.group(1)
    return {"所有貨幣種類": "所有"}.get(cur, cur)


def parse(html: str, source_url: str, fetch_date: str):
    facts: list[dict] = []
    stats = {"datasets": {}, "rows": 0}

    py_labels = _extract_var("policyYears", html) or []
    col_meta = _parse_policy_years(py_labels)
    if len(col_meta) < 3:
        return facts, {**stats, "error": "policyYears 解析失败"}, None

    for ds_name, bonus_type in _DATASETS.items():
        data = _extract_var(ds_name, html) or []
        stats["datasets"][ds_name] = len(data)
        for cells in data:
            if len(cells) < 3 + len(col_meta):
                continue
            product_raw = cells[0].strip()
            ptype = cells[1].replace("保險種類：", "").replace("保险种类：", "").strip()
            currency = _norm_currency(cells[2].strip())
            values = cells[3:3 + len(col_meta)]
            for cm, raw_val in zip(col_meta, values):
                facts.append(make_fact(
                    insurer_code=CODE, insurer_short=SHORT,
                    product_raw=product_raw, product_type_raw=ptype,
                    metric="FR", bonus_type=bonus_type,
                    reporting_year=REPORTING_YEAR,
                    inception_year=cm["inception_year"],
                    raw_value=raw_val, source_url=source_url,
                    fetch_date=fetch_date, currency=currency,
                    inception_year_end=cm["inception_year_end"],
                    policy_year_label=cm["label"],
                    policy_year_override=cm["policy_year"] if cm["inception_year_end"] else None,
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
    prods = sorted({f['product_raw'] for f in facts})
    print(f"产品数 {len(prods)}")
    for f in facts[:8]:
        print(f"  {str(f['bonus_type']):<10} {f['reporting_year']} 生效{f['inception_year']} "
              f"第{f['policy_year']}年 {f['product_raw'][:16]:<18} {f['currency']:<4} {f['raw_value']}")
