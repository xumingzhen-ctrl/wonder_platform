#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""合并各公司归一化结果 → 统一数据集 + 统计引擎。

产出：
  data/facts.json   全部数据点
  data/facts.csv    便于 Excel 透视
  data/stats.json   统计结果

统计口径（刻意避开简单平均）：
  1. 只统计 kind=='value' 的格子，no_data 一律不参与（不当 0）
  2. 默认只用最新报告年度，避免跨年度混算
  3. 按【产品类型】分层——储蓄/终身/危疾/年金/医疗绝不混算
  4. 主用中位数 + P25/P75，均值仅作参考并标注
  5. 达标率（≥100%、≥90%）比均值稳健
  6. 稳定性用「离差中位数」= median(|比率−100%|)，越小越稳
  7. 区间宽度 P75−P25 衡量离散度
"""
from __future__ import annotations

import csv
import json
import pathlib
import statistics as st
from collections import defaultdict

BASE = pathlib.Path(__file__).resolve().parent.parent
NORM = BASE / "data" / "normalized"
OUT = BASE / "data"

PT_ZH = {"savings": "储蓄人寿", "wholelife": "终身人寿", "annuity": "年金",
         "ci": "危疾", "medical": "医疗", "other": "其他"}
BT_ZH = {"annual": "周年红利", "reversionary": "归原红利",
         "terminal": "终期红利", "tcvr": "总现金价值比率"}
METRIC_ZH = {"FR": "分红实现率", "TCVR": "总现金价值比率"}


def pct(sorted_vals, q):
    if not sorted_vals:
        return None
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    i = q * (len(sorted_vals) - 1)
    lo, hi = int(i), min(int(i) + 1, len(sorted_vals) - 1)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (i - lo)


def describe(vals: list[float]) -> dict:
    """一组比率的统计量。"""
    if not vals:
        return {"n": 0}
    sv = sorted(vals)
    n = len(sv)
    dev = sorted(abs(v - 100) for v in vals)
    return {
        "n": n,
        "min": round(sv[0], 1),
        "p25": round(pct(sv, .25), 1),
        "median": round(pct(sv, .50), 1),
        "p75": round(pct(sv, .75), 1),
        "max": round(sv[-1], 1),
        "mean": round(sum(vals) / n, 1),
        "iqr": round(pct(sv, .75) - pct(sv, .25), 1),
        "dev_median": round(pct(dev, .50), 1),
        "ge100": round(100 * sum(1 for v in vals if v >= 100) / n, 1),
        "ge90": round(100 * sum(1 for v in vals if v >= 90) / n, 1),
        "lt70": round(100 * sum(1 for v in vals if v < 70) / n, 1),
    }


def load_facts():
    facts, meta = [], {}
    for p in sorted(NORM.glob("*.json")):
        d = json.loads(p.read_text("utf-8"))
        code = d["insurer_code"]
        meta[code] = {k: v for k, v in d.items() if k != "facts"}
        facts += d["facts"]
    return facts, meta


def main():
    facts, meta = load_facts()
    if not facts:
        print("没有归一化数据，请先跑 scripts/run.py")
        return

    valid = [f for f in facts if f["kind"] == "value"]
    latest_year = max(f["reporting_year"] for f in facts)
    cur = [f for f in valid if f["reporting_year"] == latest_year]

    print(f"合并 {len(meta)} 家：数据点 {len(facts)} 条，有效值 {len(valid)} 条")
    print(f"最新报告年度 {latest_year}，当期有效值 {len(cur)} 条")

    def g(items, key):
        d = defaultdict(list)
        for f in items:
            d[key(f)].append(f["ratio_pct"])
        return {k: describe(v) for k, v in d.items()}

    # ── 0. 公司 × 指标分列（P3：FR 与 TCVR 绝不可混算）────────────
    # FR 只看非保证部分，GL16 强制披露，是跨公司对比的唯一可比口径；
    # TCVR 把保证现金价值计入分子分母，数字天然偏高，且属自愿披露。
    overall_by_company_metric = {}
    for c in meta:
        for metric in ("FR", "TCVR"):
            vals = [f["ratio_pct"] for f in cur
                    if f["insurer_code"] == c and f["metric"] == metric]
            overall_by_company_metric.setdefault(c, {})[metric] = describe(vals)
    overall_by_metric = {
        m: describe([f["ratio_pct"] for f in cur if f["metric"] == m])
        for m in ("FR", "TCVR")
    }

    # ── 1. 公司 × 产品类型 ─────────────────────────────────────────
    by_company_type = defaultdict(dict)
    for (code, ptype), vals in _group(cur, lambda f: (f["insurer_code"], f["product_type"])):
        by_company_type[code][ptype] = describe(vals)

    # ── 2. 公司 × 红利类型 ─────────────────────────────────────────
    by_company_bonus = defaultdict(dict)
    for (code, metric, bt), vals in _group(
            cur, lambda f: (f["insurer_code"], f["metric"], f["bonus_type"])):
        by_company_bonus[code].setdefault(metric, {})[bt] = describe(vals)

    # ── 3. 生效年份批次趋势 ────────────────────────────────────────
    by_cohort = defaultdict(dict)
    for (code, iy), vals in _group(cur, lambda f: (f["insurer_code"], f["inception_year"])):
        if iy and isinstance(iy, int):
            by_cohort[code][iy] = describe(vals)

    # ── 4. 产品级明细 ──────────────────────────────────────────────
    products = []
    pmap = defaultdict(lambda: defaultdict(list))
    for f in cur:
        iy = f.get("inception_year")
        if not iy:
            continue
        ie = f.get("inception_year_end")
        pmap[(f["insurer_code"], f["product_raw"], f["metric"])][(iy, ie)].append(f)
        
    for (code, pname, metric), byyear in pmap.items():
        allv = [f["ratio_pct"] for ys in byyear.values() for f in ys]
        ptype = next((f["product_type"] for ys in byyear.values() for f in ys), "other")
        
        series = {}
        for (iy, ie), fs in sorted(byyear.items()):
            if ie and ie > iy:
                label = f"≤{ie}"
            else:
                label = str(iy)
            series[label] = round(sum(f["ratio_pct"] for f in fs) / len(fs), 1)
            
        products.append({
            "insurer_code": code, "product": pname, "metric": metric,
            "product_type": ptype, "stats": describe(allv), "series": series,
        })
    products.sort(key=lambda x: (x["insurer_code"], -x["stats"]["n"]))

    stats = {
        "generated_at": _now(),
        "latest_reporting_year": latest_year,
        "totals": {
            "companies": len(meta),
            "facts": len(facts),
            "valid": len(valid),
            "current_valid": len(cur),
            "products": len(set((f["insurer_code"], f["product_raw"]) for f in facts)),
        },
        "companies": {c: {"short_zh": m["insurer_short"], "channel": m["channel"],
                          "source_url": m["source_url"], "fetch_date": m["fetch_date"]}
                      for c, m in meta.items()},
        "overall_by_company": {c: describe([f["ratio_pct"] for f in cur
                                            if f["insurer_code"] == c]) for c in meta},
        "overall_by_company_metric": overall_by_company_metric,
        "overall_by_metric": overall_by_metric,
        "by_company_product_type": {c: dict(v) for c, v in by_company_type.items()},
        "by_company_bonus": {c: dict(v) for c, v in by_company_bonus.items()},
        "by_cohort": {c: {str(y): s for y, s in sorted(v.items())}
                      for c, v in by_cohort.items()},
        "products": products,
        "labels": {"product_type": PT_ZH, "bonus_type": BT_ZH, "metric": METRIC_ZH},
    }

    OUT.mkdir(exist_ok=True)
    (OUT / "facts.json").write_text(json.dumps(
        {"generated_at": _now(), "facts": facts}, ensure_ascii=False), "utf-8")
    (OUT / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1), "utf-8")

    cols = ["insurer_code", "insurer_short", "product_raw", "product_type",
            "product_type_raw", "currency", "metric", "bonus_type",
            "reporting_year", "inception_year", "inception_year_end",
            "policy_year", "raw_value", "kind", "ratio_pct",
            "no_data_reason", "suspicious", "source_url", "fetch_date"]
    with open(OUT / "facts.csv", "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(facts)

    print(f"\n已写出 facts.json / facts.csv / stats.json → {OUT}")
    _report(stats)


def _group(items, key):
    d = defaultdict(list)
    for f in items:
        d[key(f)].append(f["ratio_pct"])
    return d.items()


def _now():
    import datetime as dt
    return dt.datetime.now().isoformat(timespec="seconds")


def _report(s):
    print("\n===== 全市场概览（最新报告年度，仅有效值）=====")
    hdr = f"{'公司':<8}{'有效值':>7}{'中位':>7}{'P25':>7}{'P75':>7}{'≥100%':>8}{'≥90%':>7}{'<70%':>7}{'离差中位':>9}"
    print(hdr)
    for c, stt in s["overall_by_company"].items():
        if not stt.get("n"):
            continue
        print(f"{s['companies'][c]['short_zh']:<8}{stt['n']:>7}{stt['median']:>7.0f}"
              f"{stt['p25']:>7.0f}{stt['p75']:>7.0f}{stt['ge100']:>7.0f}%"
              f"{stt['ge90']:>6.0f}%{stt['lt70']:>6.0f}%{stt['dev_median']:>9.0f}")

    print("\n===== FR / TCVR 分列（跨公司对比只看 FR 列）=====")
    hdr2 = f"{'公司':<8}{'FR有效值':>9}{'FR中位':>8}{'FR≥90%':>8}{'TCVR有效值':>11}{'TCVR中位':>9}{'TCVR≥90%':>9}"
    print(hdr2)
    for c, mm in s["overall_by_company_metric"].items():
        fr, tv = mm.get("FR") or {}, mm.get("TCVR") or {}
        print(f"{s['companies'][c]['short_zh']:<8}"
              f"{fr.get('n', 0):>9}{('%.0f%%' % fr['median']) if fr.get('n') else '-':>8}"
              f"{('%.0f%%' % fr['ge90']) if fr.get('n') else '-':>8}"
              f"{tv.get('n', 0):>11}{('%.0f%%' % tv['median']) if tv.get('n') else '-':>9}"
              f"{('%.0f%%' % tv['ge90']) if tv.get('n') else '-':>9}")

    print("\n===== 分产品类型（这是关键：储蓄险不能和危疾混算）=====")
    for c, types in s["by_company_product_type"].items():
        name = s["companies"][c]["short_zh"]
        print(f"  [{name}]")
        for pt in ["savings", "wholelife", "annuity", "ci", "medical", "other"]:
            if pt not in types or not types[pt].get("n"):
                continue
            t = types[pt]
            print(f"    {s['labels']['product_type'][pt]:<6} n={t['n']:<4} "
                  f"中位 {t['median']:>5.0f}%  P25-P75 {t['p25']:>5.0f}~{t['p75']:>5.0f}%  "
                  f"≥90% {t['ge90']:>5.0f}%  离差中位 {t['dev_median']:>4.0f}")


if __name__ == "__main__":
    main()
