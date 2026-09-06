#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""流水线：抓取 → 解析 → 归一化落库。

用法：
    python scripts/run.py SUN            # 抓 + 解析 + 存
    python scripts/run.py PRU --reparse  # 用已有快照重解析，不重新抓
    python scripts/run.py all --reparse
产出：data/normalized/{CODE}.json
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib
import json
import pathlib
import sys

BASE = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE / "scripts"))

from fetch_base import Fetcher  # noqa: E402

MODULES = {"PRU": "prudential", "SUN": "sunlife", "CTF": "ctf", "BOC": "boc",
           "HSBC": "hsbc", "HANG": "hang", "YF": "yf", "CLO": "clo",
           "AIA": "aia", "AXA": "axa", "FWD": "fwd", "MANU": "manu"}


def run_one(code: str, date: str, reparse: bool) -> dict:
    mod_name = MODULES.get(code, code.lower())
    try:
        mod = importlib.import_module(f"adapters.{mod_name}")
    except ModuleNotFoundError:
        return {"code": code, "ok": False, "err": f"无适配器 adapters/{mod_name}.py"}

    cfg = json.loads((BASE / "config" / "insurers.json").read_text("utf-8")).get(code)
    if not cfg:
        return {"code": code, "ok": False, "err": "config/insurers.json 中无此公司"}
    url = cfg["legal_entities"][0]["urls"]["zh_cn"] or mod.URL

    # 一家公司可能拆成多个页面（如保诚 FR / TCVR 各一页）
    sources = getattr(mod, "SOURCES", [("main", getattr(mod, "URL", url))])
    f = Fetcher(code, date)

    facts: list[dict] = []
    stats_all: dict = {}
    channels: list[str] = []

    for slug, target in sources:
        snap_path = BASE / "data" / "raw" / code / date / slug / "page.html"
        if reparse and snap_path.exists():
            html = snap_path.read_text("utf-8")
            channel = "reparse"
            print(f"  [{code}/{slug}] 复用快照")
        else:
            ch = cfg.get("channel_hint", "static")
            if ch == "browser":
                print(f"  [{code}/{slug}] 浏览器渲染 {target}")
                snap = f.get_rendered(target, note=f"{code}/{slug}", slug=slug)
            else:
                print(f"  [{code}/{slug}] 静态直取 {target}")
                snap = f.get_static(target, note=f"{code}/{slug}", slug=slug)
            if not snap or snap.status != 200 or not snap.bytes:
                print(f"         抓取失败 status={getattr(snap,'status',None)} "
                      f"{getattr(snap,'note','')}")
                continue
            html = (snap.dir / "page.html").read_text("utf-8")
            channel = snap.channel
            print(f"         HTTP {snap.status} · {snap.bytes:,} bytes · {snap.elapsed_s}s")
        channels.append(channel)

        # 适配器若支持 use_archive（如 YF 的 API 归档），reparse 时透传
        import inspect
        kwargs = {}
        if "use_archive" in inspect.signature(mod.parse).parameters:
            kwargs["use_archive"] = reparse
        sub_facts, sub_stats, _ = mod.parse(html, target, date, **kwargs)
        facts += sub_facts
        stats_all[slug] = sub_stats
        print(f"         {len(sub_facts)} 条（有效值 "
              f"{sum(1 for x in sub_facts if x['kind']=='value')}）")

    if not facts:
        return {"code": code, "ok": False, "err": "所有页面源均未取到数据"}

    # 跨页面去重
    from schema import fact_id
    seen, uniq = set(), []
    for x in facts:
        k = fact_id(x) + f"|{x['currency']}"
        if k in seen:
            continue
        seen.add(k)
        uniq.append(x)
    facts = uniq

    stats = {"sources": stats_all, "total": len(facts)}
    channel = "+".join(sorted(set(channels)))

    out = BASE / "data" / "normalized" / f"{code}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "insurer_code": code,
        "insurer_short": cfg["short_zh"],
        "channel": channel,
        "source_url": getattr(mod, "URL", url),
        "fetch_date": date,
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "stats": stats,
        "facts": facts,
    }, ensure_ascii=False, indent=1), "utf-8")

    vals = [f for f in facts if f["kind"] == "value"]
    print(f"         {len(facts)} 条数据点（有效值 {len(vals)}）→ {out.relative_to(BASE)}")
    return {"code": code, "ok": True, "facts": len(facts), "values": len(vals),
            "stats": stats}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("codes", nargs="+", help="公司代码，或 all")
    ap.add_argument("--date", default=dt.date.today().isoformat())
    ap.add_argument("--reparse", action="store_true", help="复用已归档快照，不重新抓取")
    a = ap.parse_args()

    if "all" in a.codes:
        cfg = json.loads((BASE / "config" / "insurers.json").read_text("utf-8"))
        codes = [c for c in cfg if c in MODULES]
    else:
        codes = [c.upper() for c in a.codes]

    print(f"===== 分红实现率抓取 · {a.date} · {len(codes)} 家 =====")
    results = [run_one(c, a.date, a.reparse) for c in codes]

    print("\n===== 汇总 =====")
    ok = [r for r in results if r["ok"]]
    for r in results:
        mark = "OK " if r["ok"] else "FAIL"
        extra = f"{r['facts']} 条 / 有效值 {r['values']}" if r["ok"] else r["err"]
        print(f"  [{mark}] {r['code']:<5} {extra}")
    print(f"\n成功 {len(ok)}/{len(results)}")


if __name__ == "__main__":
    main()
