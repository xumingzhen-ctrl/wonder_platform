#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从保监局官方索引派生目标保险公司配置。

数据源：config/ia_official_index.json
  来源 https://www.ia.org.hk/js/data/fulfillment_ratio.json （保监局 GL16 披露页清单）
本脚本只做筛选与打标，不改动官方字段，保证可追溯。
"""
import json
import pathlib
import re

BASE = pathlib.Path(__file__).resolve().parent.parent

# 目标 12 家主流（用户 2026-09-05 选定：先主流 12 家）
# key = 内部代码, value = (中文简称, 匹配官方 insurer[2] 简体名的正则)
TARGETS = {
    "AIA":  ("友邦",     r"^友邦保险\(国际\)有限公司"),
    "PRU":  ("保诚",     r"^保诚保险有限公司"),
    "AXA":  ("安盛",     r"^安盛金融"),
    "MANU": ("宏利",     r"^宏利人寿保险（国际）有限公司"),
    "SUN":  ("永明",     r"^香港永明金融有限公司"),
    "CLO":  ("国寿海外", r"^中国人寿保险（海外）股份有限公司"),
    "FWD":  ("富卫",     r"^富卫人寿"),
    "CTF":  ("周大福",   r"^周大福人寿保险有限公司"),
    "YF":   ("万通",     r"^万通保险国际有限公司"),
    "BOC":  ("中银人寿", r"^中银集团人寿保险有限公司"),
    "HSBC": ("汇丰人寿", r"^汇丰人寿保险（国际）有限公司"),
    "HANG": ("恒生保险", r"^恒生保险有限公司"),
}

# 抓取通道预判（依据 2026-09-05 实测）
#   static     = requests 直接拿到含数据的 HTML
#   browser    = 需 Playwright 渲染
#   pdf        = 官方给 PDF
#   mixed      = 多法人 / 混合形态，需定制
CHANNEL_HINT = {
    "SUN":  "static",
    "HSBC": "static",
    "AIA":  "browser",
    "AXA":  "browser",
    "PRU":  "browser",
    "MANU": "browser",
    "CTF":  "static",
    "YF":   "static",
    "BOC":  "static",
    "HANG": "static",
    "CLO":  "static",
    "FWD":  "mixed",
}


def main():
    official = json.loads((BASE / "config" / "ia_official_index.json").read_text("utf-8"))
    entries = official["fulfillment_ratio"]

    out = {}
    unmatched = []
    for code, (short, pattern) in TARGETS.items():
        hits = [e for e in entries if re.match(pattern, e["insurer"][2].strip())]
        if not hits:
            unmatched.append(code)
            continue
        # 同一集团可能多个法人（安盛 2 个、富卫 3 个），全部保留
        legal_entities = []
        for h in hits:
            legal_entities.append({
                "legal_name_zh": h["insurer"][2].strip(),
                "legal_name_en": h["insurer"][0].strip(),
                "urls": {
                    "zh_cn": h["webpages"][2][0].strip() if len(h["webpages"]) > 2 else h["webpages"][0][0].strip(),
                    "zh_hk": h["webpages"][1][0].strip() if len(h["webpages"]) > 1 else h["webpages"][0][0].strip(),
                    "en":    h["webpages"][0][0].strip(),
                },
                "update_frequency_zh": h["update_frequency"][2].strip() if len(h["update_frequency"]) > 2 else "",
            })
        out[code] = {
            "code": code,
            "short_zh": short,
            "channel_hint": CHANNEL_HINT.get(code, "static"),
            "legal_entities": legal_entities,
        }

    if unmatched:
        print(f"[WARN] 官方索引中未匹配到：{unmatched}")

    dest = BASE / "config" / "insurers.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=2), "utf-8")

    print(f"已写入 {dest}")
    print(f"目标公司 {len(out)} 家 / 法人主体 {sum(len(v['legal_entities']) for v in out.values())} 个\n")
    for code, v in out.items():
        ch = v["channel_hint"]
        print(f"  {code:<5} {v['short_zh']:<8} [{ch:<7}] {len(v['legal_entities'])} 个法人")
        for le in v["legal_entities"]:
            print(f"          - {le['legal_name_zh']}")


if __name__ == "__main__":
    main()
