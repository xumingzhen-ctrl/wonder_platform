#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""数据质量体检：跑一个适配器并对结果做统计与抽样核对。

用法： python scripts/qc.py PRU
"""
import collections
import pathlib
import sys

BASE = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE / "scripts"))


# 公司代码 → 适配器模块名
MODULES = {
    "PRU": "prudential",
    "SUN": "sunlife",
    "CTF": "ctf",
    "BOC": "boc",
    "HSBC": "hsbc",
    "HANG": "hang",
    "YF": "yf",
    "CLO": "clo",
    "AIA": "aia",
    "AXA": "axa",
    "FWD": "fwd",
    "MANU": "manu",
}


def load(code: str, date: str = "2026-09-05"):
    mod_name = MODULES.get(code, code.lower())
    mod = __import__(f"adapters.{mod_name}", fromlist=["parse"])
    sources = getattr(mod, "SOURCES", [("", None)])
    facts_all, stats_all = [], {}
    for slug, url in sources:
        p = BASE / "data" / "raw" / code / date / (f"{slug}/page.html" if slug else "page.html")
        if not p.exists():
            print(f"[ERR] 快照不存在: {p}")
            sys.exit(1)
        facts, stats, _ = mod.parse(p.read_text("utf-8"), url or mod.URL, date)
        facts_all += facts
        stats_all[slug or "main"] = stats
    # 合并 stats（单页公司保持原有扁平结构）
    if len(sources) == 1:
        stats_all = stats_all[sources[0][0] or "main"]
    else:
        stats_all = {"tables_seen": sum(s.get("tables_seen", 0) for s in stats_all.values()),
                     "tables_used": sum(s.get("tables_used", 0) for s in stats_all.values()),
                     "rows": sum(s.get("rows", 0) for s in stats_all.values())}
    return facts_all, stats_all, None


def main():
    code = sys.argv[1] if len(sys.argv) > 1 else "PRU"
    facts, stats, _ = load(code)

    print(f"===== {code} 数据质量体检 =====")
    print(f"数据点 {len(facts)} 条 | 表格 扫描{stats.get('tables_seen','-')} 采用{stats.get('tables_used','-')} "
          f"行{stats.get('rows','-')}")
    for k in ("inherited_product", "no_context"):
        if k in stats:
            print(f"  {k}: {stats[k]}")
    print()

    print("── 指标 × 红利类型 ──")
    for k, v in sorted(collections.Counter((f["metric"], f["bonus_type"]) for f in facts).items()):
        print(f"  {k[0]:<5} {str(k[1]):<13} {v:>5}")
    print()

    print("── 数据性质 ──")
    for k, v in collections.Counter(f["kind"] for f in facts).most_common():
        print(f"  {k:<10} {v}")
    nd = collections.Counter(f["no_data_reason"] for f in facts if f["kind"] == "no_data")
    if nd:
        print("  无数据原因:", nd.most_common())
    print()

    vals = [f["ratio_pct"] for f in facts if f["kind"] == "value"]
    if vals:
        sv = sorted(vals)
        n = len(sv)
        print(f"── 有效数值 {n} 条 ──")
        print(f"  区间 {min(vals):.0f}% ~ {max(vals):.0f}%")
        print(f"  P25={sv[n//4]:.0f}%  中位={sv[n//2]:.0f}%  P75={sv[3*n//4]:.0f}%")
        susp = [f for f in facts if f["suspicious"] and f["kind"] == "value"]
        print(f"  可疑值 {len(susp)} 条: {[f['raw_value'] for f in susp[:8]]}")
        print()

    print("── 维度分布 ──")
    print(f"  报告年度: {collections.Counter(f['reporting_year'] for f in facts).most_common()}")
    print(f"  币种:     {collections.Counter(f['currency'] for f in facts).most_common(6)}")
    print(f"  产品类型: {collections.Counter(f['product_type'] for f in facts).most_common()}")
    print(f"  产品数:   {len(set(f['product_raw'] for f in facts))}")
    print()

    print("── 对齐抽样：第一个储蓄类产品的各年数值 ──")
    prods = sorted({f["product_raw"] for f in facts
                    if f["product_type"] == "savings" and f["kind"] == "value"})
    if prods:
        p0 = prods[0]
        sub = [f for f in facts if f["product_raw"] == p0 and f["kind"] == "value"]
        by = collections.defaultdict(dict)
        for f in sub:
            by[(f["metric"], f["bonus_type"], f["currency"])][f["inception_year"]] = f["raw_value"]
        print(f"  产品: {p0}")
        for k in sorted(by, key=str)[:5]:
            yrs = sorted(by[k].keys())
            row = " ".join(f"{y}:{by[k][y]}" for y in yrs)
            print(f"    {k[0]:<5} {str(k[1]):<12} {k[2]:<4} {row}")


if __name__ == "__main__":
    main()
