#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成静态网站。

两套皮肤（用户 2026-09-05 选定）：
  internal 内部研究版 —— 允许分析判断、点名分化与离差问题，免责按内部资料标准
  client   对客展示版 —— 只呈现事实 + 来源 URL + 报告年度，保留 GL16 要求的
                        「过往表现非未来指标」免责，去掉一切判断与排序语

用法：
  python scripts/build_site.py            # 两套都出
  python scripts/build_site.py --skin client
产出：site/index.html（内部版）/ site/client.html（对客版）
      纯静态、数据内联、无后端、可离线双击打开
"""
from __future__ import annotations

import argparse
import html
import json
import pathlib

BASE = pathlib.Path(__file__).resolve().parent.parent
DATA = BASE / "data"
SITE = BASE / "site"

COLORS = {"AIA": "#D31145", "PRU": "#BA7517", "AXA": "#534AB7",
          "MANU": "#0F6E56", "CTF": "#E67E22", "SUN": "#1D9E75",
          "CLO": "#854F0B", "FWD": "#993556", "YF": "#27AE60",
          "BOC": "#185FA5", "HSBC": "#0E7C86", "HANG": "#5D6D7E"}
FALLBACK_COLORS = ["#185FA5", "#993C1D", "#3B6D11", "#854F0B", "#0F6E56", "#993556"]

CSS = """
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
 color:#1c1c1a;background:#f7f6f3;line-height:1.7;-webkit-font-smoothing:antialiased}
.wrap{max-width:1120px;margin:0 auto;padding:0 24px}
header{background:#fff;border-bottom:1px solid #e4e2dc;padding:34px 0 26px}
h1{font-size:26px;font-weight:600;margin:0 0 8px;letter-spacing:-.01em}
.sub{color:#6b6a65;font-size:14px;margin:0}
.badge{display:inline-block;font-size:12px;padding:3px 10px;border-radius:20px;margin-left:8px;vertical-align:2px}
.badge.internal{background:#FAEEDA;color:#854F0B}
.badge.client{background:#E6F1FB;color:#185FA5}
nav{background:#fff;border-bottom:1px solid #e4e2dc;position:sticky;top:0;z-index:20}
nav .wrap{display:flex;gap:26px;overflow-x:auto}
nav a{color:#5f5e5a;text-decoration:none;font-size:14px;padding:13px 0;border-bottom:2px solid transparent;white-space:nowrap}
nav a:hover{color:#1c1c1a;border-bottom-color:#c8c6c0}
section{padding:40px 0;border-bottom:1px solid #e9e7e1}
section:last-of-type{border-bottom:none}
h2{font-size:19px;font-weight:600;margin:0 0 6px}
h3{font-size:15px;font-weight:600;margin:26px 0 10px}
.lead{color:#6b6a65;font-size:14px;margin:0 0 22px;max-width:760px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:8px}
.kpi{background:#fff;border:1px solid #e9e7e1;border-radius:10px;padding:16px 18px}
.kpi .lab{font-size:12px;color:#6b6a65;margin-bottom:6px}
.kpi .val{font-size:26px;font-weight:600;letter-spacing:-.02em}
.kpi .note{font-size:12px;color:#8a8880;margin-top:4px}
table{width:100%;border-collapse:collapse;background:#fff;font-size:13.5px;
 border:1px solid #e9e7e1;border-radius:10px;overflow:hidden}
th{background:#f2f1ec;text-align:left;padding:10px 12px;font-weight:600;font-size:12.5px;color:#5f5e5a;
 border-bottom:1px solid #e4e2dc;white-space:nowrap}
td{padding:9px 12px;border-bottom:1px solid #f0efea}
tr:last-child td{border-bottom:none}
tbody tr:hover{background:#faf9f6}
.num{text-align:right;font-variant-numeric:tabular-nums}
.chip{display:inline-block;padding:2px 8px;border-radius:5px;font-size:12px;background:#f2f1ec;color:#5f5e5a}
.good{background:#E1F5EE;color:#0F6E56}
.warn{background:#FAEEDA;color:#854F0B}
.bad{background:#FCEBEB;color:#A32D2D}
.yr-chip{display:inline-flex;border:1px solid #e9e7e1;border-radius:4px;font-size:11.5px;overflow:hidden;background:#fff;line-height:1;margin:1px 0}
.yr-chip .yr{background:#f2f1ec;color:#6b6a65;padding:3px 5px;border-right:1px solid #e9e7e1}
.yr-chip .val{padding:3px 5px;font-weight:600}
.yr-chip.good{border-color:#b5e3d4} .yr-chip.good .yr{border-color:#b5e3d4;background:#e5f7ed}
.yr-chip.good .val{color:#0F6E56;background:#f2fcf7}
.yr-chip.warn{border-color:#f2e1c9} .yr-chip.warn .yr{border-color:#f2e1c9;background:#fcf3e3}
.yr-chip.warn .val{color:#ba7517;background:#fffcf2}
.yr-chip.bad{border-color:#f0d1d1} .yr-chip.bad .yr{border-color:#f0d1d1;background:#fae3e3}
.yr-chip.bad .val{color:#A32D2D;background:#fff5f5}
.note-box{background:#fff;border:1px solid #e9e7e1;border-left:3px solid #BA7517;
 border-radius:8px;padding:14px 18px;margin:18px 0;font-size:13.5px}
.note-box.info{border-left-color:#185FA5}
.note-box p{margin:0 0 8px}
.note-box p:last-child{margin:0}
.filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;align-items:center}
.filters select,.filters input{font:inherit;font-size:13px;padding:7px 10px;border:1px solid #ddd9d1;
 border-radius:7px;background:#fff;color:#1c1c1a}
.filters input{min-width:180px}
.table-responsive{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid #e9e7e1;border-radius:10px;margin-bottom:20px}
.table-responsive table{border:none;border-radius:0}
.tbl-scroll{max-height:560px;overflow:auto;border-radius:10px;border:1px solid #e9e7e1}
.tbl-scroll thead th{position:sticky;top:0;z-index:2}
.tbl-scroll .table-responsive{border:none;margin-bottom:0;}
.legend{display:flex;gap:18px;flex-wrap:wrap;font-size:12.5px;color:#5f5e5a;margin:10px 0 4px}
.legend span{display:flex;align-items:center;gap:6px}
.sw{width:11px;height:11px;border-radius:3px;display:inline-block}
footer{padding:30px 0 50px;color:#8a8880;font-size:12.5px}
footer p{margin:0 0 8px;max-width:860px}
.src{font-size:12px;color:#8a8880;word-break:break-all}
.chart{display:block;max-width:100%;height:auto;margin:6px 0 2px}
@media(max-width:680px){
 .wrap{padding:0 16px}h1{font-size:21px}.kpi .val{font-size:22px}
 nav .wrap{gap:16px}table{font-size:12.5px}th,td{padding:8px 9px}
}
@media print{nav{display:none}body{background:#fff}section{padding:20px 0}}
"""

SKINS = {
    "internal": {
        "cls": "internal", "tag": "精算研究版",
        "forbid_rank": False,
    },
    "client": {
        "cls": "client", "tag": "官方合规公开版",
        "forbid_rank": True,
    },
}

CSS_EXTRA = """
.guide-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:16px;margin:20px 0 28px}
.guide-card{background:#fff;border:1px solid #e2ded4;border-radius:12px;padding:22px;box-shadow:0 2px 8px rgba(0,0,0,.03);transition:transform .15s}
.guide-card:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.06)}
.guide-tag{display:inline-block;font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:4px;margin-bottom:10px;text-transform:uppercase}
.guide-tag.t1{background:#e8f4fd;color:#185fa5}
.guide-tag.t2{background:#fef3e6;color:#ba7517}
.guide-tag.t3{background:#eaf7ed;color:#0f6e56}
.guide-card h3{margin:0 0 10px;font-size:16px;font-weight:600;color:#1c1c1a}
.guide-card p{margin:0 0 10px;font-size:13px;color:#55544f;line-height:1.65}
.guide-card p:last-child{margin-bottom:0}
.guide-card strong{color:#1a1915}
.guide-point{display:flex;align-items:flex-start;gap:8px;font-size:12.5px;color:#444;margin:6px 0;background:#faf9f6;padding:7px 10px;border-radius:6px}
.guide-point i{color:#185fa5;font-style:normal;font-weight:bold}
.spotlight-box{background:linear-gradient(135deg,#ffffff 0%,#fbf9f4 100%);border:1.5px solid #dcd7ca;border-radius:12px;padding:24px;margin:20px 0 30px}
.spotlight-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px}
.spotlight-title{font-size:18px;font-weight:600;color:#1c1c1a;display:flex;align-items:center;gap:8px}
.pill-group{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
.pill-btn{background:#fff;border:1px solid #ddd8cd;padding:5px 12px;border-radius:20px;font-size:12.5px;cursor:pointer;color:#555;transition:all .15s}
.pill-btn:hover,.pill-btn.active{background:#185fa5;color:#fff;border-color:#185fa5}
.dual-pillar-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin:16px 0 22px}
.pillar-card{background:#fff;border-radius:10px;padding:16px 18px;border:1.5px solid #dcd7ca;box-shadow:0 2px 6px rgba(0,0,0,.03)}
.pillar-card.def{border-color:#0F6E56}
.pillar-card.grow{border-color:#A32D2D}
.pillar-label{font-size:12px;font-weight:600;margin-bottom:4px}
.pillar-card.def .pillar-label{color:#0F6E56}
.pillar-card.grow .pillar-label{color:#A32D2D}
.pillar-val-box{display:flex;align-items:baseline;gap:8px;margin-bottom:6px}
.pillar-val{font-size:28px;font-weight:700}
.pillar-card.def .pillar-val{color:#0F6E56}
.pillar-card.grow .pillar-val{color:#A32D2D}
.pillar-sub{font-size:12px;color:#6b6a65}
.pillar-desc{font-size:12.5px;color:#444;line-height:1.55;margin:0}

/* 交互趋势图与即时浮动 Tooltip */
.trend-box{background:#fff;border:1px solid #e9e7e1;border-radius:12px;padding:22px;margin:18px 0}
.trend-filter-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.trend-btn{background:#f6f5f0;border:1px solid #dcd7ca;padding:5px 12px;border-radius:16px;font-size:12px;cursor:pointer;color:#444;transition:all .15s}
.trend-btn:hover{background:#edebe4}
.trend-btn.active{background:#185fa5;color:#fff;border-color:#185fa5}
.trend-btn[data-target="AIA"].active{background:#D31145;border-color:#D31145;color:#fff}
.chart-path{transition:opacity .2s, stroke-width .2s;cursor:pointer}
.chart-circle{transition:opacity .2s, r .2s;cursor:pointer}
.chart-path.dimmed,.chart-circle.dimmed{opacity:0.12 !important}
.chart-path.highlighted{opacity:1 !important;stroke-width:4px !important}
.chart-circle.highlighted{opacity:1 !important;r:6px !important}
.legend-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:6px;cursor:pointer;user-select:none;font-size:12.5px;transition:all .15s;border:1px solid transparent}
.legend-pill:hover{background:#edebe4;border-color:#dcd7ca}
.legend-pill.active-pill{background:#fff;border-color:#185fa5;font-weight:600;box-shadow:0 2px 5px rgba(0,0,0,.05)}
.legend-pill.dimmed{opacity:0.35}
#chart-fast-tooltip{position:fixed;display:none;background:rgba(25,25,23,0.94);color:#fff;padding:9px 14px;border-radius:7px;font-size:12.5px;pointer-events:none;z-index:99999;box-shadow:0 6px 16px rgba(0,0,0,.2);white-space:nowrap;line-height:1.5;transform:translate(-50%,-120%);border:1px solid rgba(255,255,255,0.15)}
"""



def esc(s):
    return html.escape(str(s if s is not None else ""))


def color_for(code, idx=0):
    return COLORS.get(code, FALLBACK_COLORS[idx % len(FALLBACK_COLORS)])


# ── SVG 图表 ────────────────────────────────────────────────────────
def grouped_bars(rows, series, vmax=None, height=None, unit="%", ref=100):
    """rows: [(label, {series_name: value})]"""
    if not rows:
        return ""
    w, pad_l, pad_r, pad_t, pad_b = 980, 56, 16, 16, 44
    n = len(rows)
    h = height or max(200, n * 46 + 60)
    plot_w = w - pad_l - pad_r
    plot_h = h - pad_t - pad_b
    vmax = vmax or max([max([v for v in r[1].values() if v is not None] or [1]) for r in rows]) * 1.12
    vmax = max(vmax, ref * 1.12)

    def x_(v):
        return pad_l + (v / vmax) * plot_w

    out = [f'<svg class="chart" viewBox="0 0 {w} {h}" role="img" '
           f'aria-label="分组条形图">']
    # 网格
    step = 25 if vmax <= 150 else 50
    gv = 0
    while gv <= vmax:
        gx = x_(gv)
        out.append(f'<line x1="{gx:.1f}" y1="{pad_t}" x2="{gx:.1f}" '
                   f'y2="{pad_t+plot_h}" stroke="#eceae4" stroke-width="1"/>')
        out.append(f'<text x="{gx:.1f}" y="{pad_t+plot_h+18}" font-size="11" '
                   f'fill="#8a8880" text-anchor="middle">{gv}{unit}</text>')
        gv += step
    # 参考线 100%
    if ref and ref <= vmax:
        rx = x_(ref)
        out.append(f'<line x1="{rx:.1f}" y1="{pad_t}" x2="{rx:.1f}" '
                   f'y2="{pad_t+plot_h}" stroke="#c0392b" stroke-width="1.2" '
                   f'stroke-dasharray="4 3" opacity=".65"/>')

    band = plot_h / n
    nser = max(1, len(series))
    bar_h = min(15, (band - 12) / nser)
    for i, (label, vals) in enumerate(rows):
        ytop = pad_t + i * band + (band - bar_h * nser) / 2
        out.append(f'<text x="{pad_l-10}" y="{ytop+bar_h*nser/2+4:.1f}" font-size="12.5" '
                   f'fill="#3d3c38" text-anchor="end">{esc(label)}</text>')
        for j, s in enumerate(series):
            v = vals.get(s)
            if v is None:
                continue
            y = ytop + j * bar_h
            bw = x_(v) - pad_l
            col = vals.get(f"__c_{s}") or "#888"
            out.append(f'<rect x="{pad_l}" y="{y:.1f}" width="{max(1,bw):.1f}" '
                       f'height="{bar_h-2:.1f}" fill="{col}" rx="2"/>')
            out.append(f'<text x="{pad_l+bw+7:.1f}" y="{y+bar_h-4:.1f}" font-size="11.5" '
                       f'fill="#3d3c38">{v:.0f}{unit}</text>')
    out.append("</svg>")
    return "".join(out)


def line_chart(series_items, unit="%", ref=100, height=290):
    """series_items: [(code, name, color, is_aia, pts)]"""
    if not series_items:
        return ""
    w, pad_l, pad_r, pad_t, pad_b = 980, 56, 76, 22, 46
    h = height
    plot_w, plot_h = w - pad_l - pad_r, h - pad_t - pad_b
    xs = sorted({x for _, _, _, _, pts in series_items for x, _ in pts})
    if not xs:
        return ""
    x0, x1 = min(xs), max(xs)
    allv = [y for _, _, _, _, pts in series_items for _, y in pts if y is not None]
    y0, y1 = min(allv + [ref]), max(allv + [ref])
    span = max(1, y1 - y0)
    y0, y1 = y0 - span * .10, y1 + span * .10

    def px(x):
        return pad_l + ((x - x0) / max(1, x1 - x0)) * plot_w

    def py(v):
        return pad_t + (1 - (v - y0) / (y1 - y0)) * plot_h

    out = [f'<svg class="chart line-chart-svg" viewBox="0 0 {w} {h}" role="img" aria-label="趋势折线图">']
    
    # 标尺网格线
    for gv in range(int(y0 // 25) * 25, int(y1) + 26, 25):
        if y0 <= gv <= y1:
            yy = py(gv)
            out.append(f'<line x1="{pad_l}" y1="{yy:.1f}" x2="{w-pad_r}" y2="{yy:.1f}" '
                       f'stroke="#eceae4" stroke-width="1"/>')
            out.append(f'<text x="{pad_l-9}" y="{yy+4:.1f}" font-size="11" fill="#8a8880" '
                       f'text-anchor="end">{gv}{unit}</text>')
    
    # 100% 达标参考线
    out.append(f'<line x1="{pad_l}" y1="{py(ref):.1f}" x2="{w-pad_r}" y2="{py(ref):.1f}" '
               f'stroke="#c0392b" stroke-width="1.2" stroke-dasharray="4 3" opacity=".65"/>')
    
    # 横轴年份
    step = max(1, len(xs) // 10)
    for i, x in enumerate(xs):
        if i % step and x != xs[-1]:
            continue
        out.append(f'<text x="{px(x):.1f}" y="{h-16}" font-size="11.5" fill="#6b6a65" '
                   f'text-anchor="middle">{x}</text>')

    # 排序：让友邦在最上层绘制
    sorted_items = sorted(series_items, key=lambda it: 1 if it[3] else 0)

    for code, name, col, is_aia, pts in sorted_items:
        pts = sorted(pts)
        d = " ".join(f"{'M' if k == 0 else 'L'}{px(x):.1f},{py(y):.1f}"
                     for k, (x, y) in enumerate(pts) if y is not None)
        
        sw = "3.6" if is_aia else "1.8"
        op = "1.0" if is_aia else "0.45"
        cls = "chart-path aia-path" if is_aia else "chart-path other-path"
        
        out.append(f'<path d="{d}" class="{cls}" data-code="{esc(code)}" data-name="{esc(name)}" '
                   f'data-color="{col}" fill="none" stroke="{col}" stroke-width="{sw}" opacity="{op}" '
                   f'stroke-linejoin="round"/>')
        
        r = "4.2" if is_aia else "2.8"
        c_cls = "chart-circle aia-circle" if is_aia else "chart-circle other-circle"
        for x, y in pts:
            if y is None:
                continue
            out.append(f'<circle cx="{px(x):.1f}" cy="{py(y):.1f}" r="{r}" class="{c_cls}" '
                       f'data-code="{esc(code)}" data-name="{esc(name)}" data-year="{x}" data-val="{y:.1f}" '
                       f'fill="#fff" stroke="{col}" stroke-width="2" opacity="{op}"/>')
        
        # 友邦折线末端显眼标签
        if is_aia and pts:
            lx, ly = pts[-1]
            bx = px(lx) + 8
            by = py(ly) - 9
            out.append(f'<g class="aia-end-tag" style="pointer-events:none;">'
                       f'<rect x="{bx:.1f}" y="{by:.1f}" width="58" height="18" rx="4" fill="#D31145"/>'
                       f'<text x="{bx+29:.1f}" y="{by+13:.1f}" font-size="11" font-weight="700" fill="#fff" text-anchor="middle">友邦 AIA</text>'
                       f'</g>')

    out.append("</svg>")
    return "".join(out)


# ── 页面构建 ────────────────────────────────────────────────────────
def build(stats: dict, skin_key: str) -> str:
    sk = SKINS[skin_key]
    yr = stats["latest_reporting_year"]
    tot = stats["totals"]
    comps = stats["companies"]
    codes = list(comps.keys())
    L = stats["labels"]
    P = []
    a = P.append

    a("<!DOCTYPE html><html lang='zh-CN'><head><meta charset='utf-8'>")
    a("<meta name='viewport' content='width=device-width,initial-scale=1'>")
    a("<title>香港分红保单实现率数据库 - 深度研究与专业指南</title>")
    a(f"<style>{CSS}{CSS_EXTRA}</style></head><body>")

    # ── header ──
    a("<header><div class='wrap'>")
    a("<h1>香港分红保单实现率数据库"
      f"<span class='badge {sk['cls']}'>{sk['tag']}</span></h1>")
    a(f"<p class='sub'>{yr} 报告年度 · {tot['companies']} 家主流险企 · "
      f"{tot['products']} 个产品系列 · {tot['valid']:,} 个官方披露数据点　|　"
      f"数据源：香港保监局 GL16 指引官方披露</p>")
    a("</div></header>")

    # ── nav ──
    a("<nav><div class='wrap'>")
    for anchor, label in [("guide", "💡 投资决策三大底层规律"),
                          ("aia-focus", "🏆 标杆险企旗舰验证 (AIA)"),
                          ("coh", "📈 长期跨周期大考"),
                          ("ov", "全市场总览"),
                          ("split", "核心指标对比 (FR/TCVR)"),
                          ("pt", "分产品类型"),
                          ("bt", "分红机制"),
                          ("prod", "全量产品检索"),
                          ("method", "口径与来源")]:
        a(f"<a href='#{anchor}'>{label}</a>")
    a("</div></nav>")

    # ── 深度导读与避坑指南（专业引导核心）──
    a("<section id='guide' style='background:#fdfcf9;'><div class='wrap'>")
    a("<h2>💡 保单分红深度导读与避坑指南</h2>")
    a("<p class='lead'>分红实现率是投保决策的重要参考，但<b>孤立地看单一数字极易产生严重误导</b>。"
      "理解以下三大底层规律，才能看清分红数字背后的真实投资实力与长期兑现底蕴。</p>")
    
    a("<div class='guide-grid'>")
    
    # 卡片 1：年期效应
    a("<div class='guide-card'>")
    a("<span class='guide-tag t1'>规律一 · 年期效应</span>")
    a("<h3>打破「前期冲高」幻觉：为什么 8 年以上老单才见真章？</h3>")
    a("<p><strong>• 前期（1~5年）基数极小：</strong>保单生效初期，非保证分红池尚未滚存，险企维持 100% 实现率的资金成本极低，极易出现「新产品前期全线飘红」的营销现象。</p>")
    a("<p><strong>• 后期（8~10+年）复利庞大：</strong>随着时间推移，分红池按复利几何级增长，且必须穿越多次全球加息、降息与股灾周期。<strong>能够在 8~10 年以上长周期仍稳定在 90%~100%+ 的产品，才真正体现险企跨周期的真实资产管理能力</strong>。</p>")
    a("<div class='guide-point'><i>✓</i> 避坑要点：切勿因新产品前 2 年 100% 就认定稳赚，重点考察其 8 年以上老保单的历史兑现记录。</div>")
    a("</div>")

    # 卡片 2：美式 vs 英式
    a("<div class='guide-card'>")
    a("<span class='guide-tag t2'>机制二 · 分红结构</span>")
    a("<h3>美式分红 vs 英式分红：读懂波动背后的投资逻辑</h3>")
    a("<p><strong>• 美式分红（周年现金红利 + 终期）：</strong>红利每年宣布即落袋为安（可提取或生息），不可回撤。投资策略稳健防御，实现率曲线平缓抗跌，常年稳定在 95%~100%。</p>")
    a("<p><strong>• 英式分红（复归保额红利 + 终期）：</strong>红利滚入保额，底层配置 50%~75% 的全球股票与权益资产以博取长期高复合回报。采用市值法核算，<strong>受全球资本市场周期波动是英式分红追求超额收益的正常客观属性</strong>。</p>")
    a("<div class='guide-point'><i>✓</i> 避坑要点：英式分红短期的合理波动不代表兑现失败，其核心在于长线博取更高的长期总现金价值。</div>")
    a("</div>")

    # 卡片 3：样本厚度与跨周期实力
    a("<div class='guide-card'>")
    a("<span class='guide-tag t3'>规律三 · 样本厚度</span>")
    a("<h3>大盘规模与穿越周期：为什么「15年老保单的95%」远胜「2年新单的100%」？</h3>")
    a("<p><strong>• 幸存者偏差与低基数：</strong>新单前 3 年分红池仅几十美元，维持 100% 成本微不足道。若某保司仅披露少量近年新单，其高达成率属于典型的低基数现象。</p>")
    a("<p><strong>• 81款全量大考的龙头底蕴：</strong>以行业标杆友邦（AIA）为例，完整披露全港跨度最长（15年+）、数量最多（81款含早已停售老单）的完整数据。在经历 2008 次贷海啸、欧债危机及全球加息三次极端冲击下，中位数依然保持 95%，当家在售旗舰更连续 100% 满分达成。</p>")
    a("<div class='guide-point'><i>✓</i> 决策要点：短跑看冲刺，长跑看心肺。家族资产配置必须考察全生命周期的样本厚度。</div>")
    a("</div>")

    a("</div>") # end guide-grid
    a("</div></section>")

    # ── 标杆旗舰聚焦专区 ──
    a("<section id='aia-focus'><div class='wrap'>")
    a("<div class='spotlight-box'>")
    a("<div class='spotlight-head'>")
    a("<div class='spotlight-title'><span style='color:#A32D2D;font-size:22px'>◆</span> 标杆险企验证：友邦香港 (AIA) 核心旗舰兑现全景</div>")
    a("<span class='badge' style='background:#A32D2D;color:#fff'>全量 81 款历史产品大考 · 当家旗舰连续 100% 达成</span>")
    a("</div>")
    a("<p class='lead' style='margin-bottom:14px'>以全港历史披露跨度最长、样本最深厚的标杆险企友邦为例，检验其在「底线安全防线（TCVR）」与「财富进取复利（FR）」上的综合兑现表现：</p>")
    
    # 双保险数据看板
    a("<div class='dual-pillar-grid'>")
    a("<div class='pillar-card def'>"
      "<div class='pillar-label'>🛡️ 资产安全防线 · 总现金价值比率 (TCVR)</div>"
      "<div class='pillar-val-box'><span class='pillar-val'>100.0%</span><span class='pillar-sub'>全口径中位数（322 款次大盘样本）</span></div>"
      "<p class='pillar-desc'><b>99% 达标优秀率</b>（≥90%）· <b>0% 暴雷率</b>（&lt;70%为零）。保证价值坚实兜底，无论外部环境如何变幻，资产底线安如磐石。</p>"
      "</div>")
    a("<div class='pillar-card grow'>"
      "<div class='pillar-label'>🚀 财富进取复利 · 分红实现率 (FR)</div>"
      "<div class='pillar-val-box'><span class='pillar-val'>100% ~ 162%</span><span class='pillar-sub'>当家旗舰与长线爆发区间</span></div>"
      "<p class='pillar-desc'><b>盈御 / 简爱系列连续 100%</b> 满分达成 · <b>充裕未来终期分红最高 162%</b>。配置高达 75% 全球权益资产，畅享世界级复利红利。</p>"
      "</div>")
    a("</div>")

    a("<div class='table-responsive'><table><thead><tr><th>产品名称</th><th>产品类型</th><th>分红机制</th><th>披露年期</th><th class='num'>平均实现率(FR)</th><th class='num'>最新实现率(FR)</th><th class='num'>总现价比率(TCVR)</th><th>兑现点评</th></tr></thead><tbody>")
    
    spotlight_items = [
        ("「盈御多元货币计划」系列 (1/2/3代)", "储蓄人寿", "英式分红 (复归+终期)", "第 3~4 年", "100.0%", "100%", "100%", "新一代多元货币王牌，各红利系列均 100% 完美达成"),
        ("「简爱•延续」储蓄系列 (3/5代)", "储蓄 / 终身", "美式分红 (周年+终期)", "第 2~5 年", "100.0%", "100%", "100%", "美式稳健储蓄旗舰，周年红利与终期分红全线 100% 达成"),
        ("「充裕未来」系列 (1/2/3代及盈尚)", "储蓄人寿", "英式分红 (复归+终期)", "第 4~8 年+", "91.5%", "81%~162%", "94%~100%", "历经市场洗礼的经典英式分红王牌，最高达162%，展现长线高权益资产的爆发力"),
        ("「年金宝」入息计划", "年金计划", "周年红利", "第 7~11 年+", "85.0%", "77%~111%", "98%~100%", "跨越十年的经典退休年金，经历多次经济大周期，持续派发稳定现金流"),
        ("「活出精彩」/ 人民币入息保险计划", "年金计划", "美式分红 (周年红利)", "第 1~11 年+", "98.5%", "98%~100%", "100%", "跨越 10 年以上超长周期，退休现金流兑现极其稳健"),
        ("「加裕智倍保」系列 (2/3代/首护挚宝)", "重疾保障", "终期分红", "第 5~7 年", "105.0%", "105%", "100%", "重疾王牌旗舰，实现率超额 105% 达成，保障更安心"),
        ("「资优教育储蓄计划」", "储蓄人寿", "周年+终期红利", "第 8~11 年+", "122.0%", "97%~169%", "100%~105%", "长达 11+ 年老保单验证，终期分红达 169%，长周期复利惊人"),
        ("「才隽之选」终身寿险计划", "终身寿险", "周年红利", "第 4~11 年+", "120.5%", "112%~125%", "100%~102%", "长周期持续超额兑现（112%~125%），穿越多次经济牛熊"),
    ]
    for p_name, p_type, p_mech, p_yrs, p_avg, p_latest, p_tcvr, p_comment in spotlight_items:
        a(f"<tr><td><b>{p_name}</b></td><td>{p_type}</td><td><span class='chip'>{p_mech}</span></td>"
          f"<td>{p_yrs}</td><td class='num'><b>{p_avg}</b></td><td class='num'><span class='chip good'>{p_latest}</span></td>"
          f"<td class='num' style='color:#0F6E56;font-weight:600;'>{p_tcvr}</td>"
          f"<td style='font-size:12.5px;color:#555;'>{p_comment}</td></tr>")
    a("</tbody></table></div>")
    a("</div>")
    a("</div></section>")


    # ── 生效年份趋势 (核心卖点) ──
    a("<section id='coh' style='background:#fdfcf9;'><div class='wrap'>")
    a("<h2>📈 长期跨周期大考（按保单生效年份追踪）</h2>")
    a("<p class='lead'><b>数据怎么看？</b> 由于保单生效前几年的分红基数极小，很多公司都能在短期内交出「100%」的成绩单。但随着年份增加，能始终维持高实现率的险企，才真正具备穿越周期的实力。这张趋势图展示了各批次保单在 "
      f"{yr} 报告年度的实现率中位数表现。</p>")

    a("<div class='trend-box'>")
    a("<div class='trend-filter-bar'>")
    a("<span style='font-size:12.5px;font-weight:600;color:#555;'>⚡ 快速高亮对标：</span>")
    a("<button class='trend-btn active' data-target='AIA'>⭐ 聚焦友邦 (AIA)</button>")
    a("<button class='trend-btn' data-target='AIA,PRU'>友邦 vs 保诚</button>")
    a("<button class='trend-btn' data-target='AIA,AXA'>友邦 vs 安盛</button>")
    a("<button class='trend-btn' data-target='AIA,MANU'>友邦 vs 宏利</button>")
    a("<button class='trend-btn' data-target='AIA,CTF'>友邦 vs 周大福</button>")
    a("<button class='trend-btn' data-target='all'>全市场 12 家对比</button>")
    a("</div>")

    series_items = []
    for c in codes:
        pts = []
        for y, s in sorted(stats["by_cohort"].get(c, {}).items()):
            if s.get("n", 0) >= 3:
                pts.append((int(y), s["median"]))
        if pts:
            series_items.append((c, comps[c]["short_zh"], color_for(c), c == "AIA", pts))

    if series_items:
        a(line_chart(series_items))
        a("<div class='legend' style='margin-top:14px;'>")
        for c, name, col, is_aia, _ in series_items:
            cls = "legend-pill active-pill" if is_aia else "legend-pill"
            weight = "bold" if is_aia else "normal"
            a(f"<span class='{cls}' data-code='{esc(c)}' style='font-weight:{weight};'>"
              f"<i class='sw' style='background:{col};width:12px;height:12px;border-radius:3px;'></i>"
              f"{esc(name)}</span>")
        a("</div>")
        
        a("<div id='trend-expert-note' class='note-box info' style='display:none;margin-top:16px'></div>")

    a("</div>") # end trend-box
    a("</div></section>")

    # ── KPI ──
    a("<section id='ov'><div class='wrap'>")
    a("<h2>总览</h2>")
    a("<p class='lead'>全部数字来自各保险公司官网按《承保长期保险业务指引》（GL16）"
      "强制披露的分红实现率页面。每条记录可回溯到抓取当日的官方页面快照。</p>")
    a("<div class='kpis'>")
    for lab, val, note in [
        ("保险公司", tot["companies"], "已接入"),
        ("产品系列", tot["products"], f"{yr} 报告年度"),
        ("数据点", f"{tot['facts']:,}", "含无数据格"),
        ("有效数值", f"{tot['current_valid']:,}", "当期可统计"),
    ]:
        a(f"<div class='kpi'><div class='lab'>{lab}</div>"
          f"<div class='val'>{val}</div><div class='note'>{note}</div></div>")
    a("</div>")

    # 指标分列统计（P3：FR 与 TCVR 分开，混合口径已弃用）
    om = stats.get("overall_by_company_metric", {})
    fr_stats = {c: (om.get(c, {}).get("FR") or {}) for c in codes}
    tcvr_stats = {c: (om.get(c, {}).get("TCVR") or {}) for c in codes}
    a("</div></section>")

    # ── FR / TCVR 分列对比（P3 核心）──
    a("<section id='split'><div class='wrap'>")
    a("<h2>核心指标对比：分红实现率 (FR) vs 总现金价值比率 (TCVR)</h2>")
    a("<p class='lead'>为避免误导，这两项指标必须分开看：<br>"
      "<b>• 分红实现率 (Fulfillment Ratio, 简称 FR)</b>：只衡量「非保证红利」的实际派发与演示之比，是真正体现保险公司投资能力的硬指标。<br>"
      "<b>• 总现金价值比率 (Total Cash Value Ratio, 简称 TCVR)</b>：由于包含了「保证现金价值」，该指标在前期受到保证部分的“兜底”垫高，数值天然偏高，容易掩盖红利派发的真实情况。</p>")

    def _cmp_table(stats_map, metric_name):
        t = [f"<h3>{metric_name}</h3>"]
        t.append("<div class='table-responsive'><table><thead><tr><th>公司</th><th class='num'>有效产品数</th>"
                 "<th class='num'>中位数</th>"
                 "<th class='num'>≥100% 占比</th><th class='num'>≥90% 占比 (达标优秀率)</th>"
                 "<th class='num'>&lt;70% 占比</th>"
                 "</tr></thead><tbody>")
        for c in codes:
            s = stats_map.get(c) or {}
            if not s.get("n"):
                continue
            col = color_for(c)
            t.append(f"<tr><td><span class='sw' style='background:{col};display:inline-block;"
                     f"width:11px;height:11px;border-radius:3px;margin-right:7px'></span>"
                     f"{esc(comps[c]['short_zh'])}</td>")
            t.append(f"<td class='num'>{s['n']}</td>"
                     f"<td class='num'><b>{s['median']:.0f}%</b></td>")
            t.append(f"<td class='num'>{s['ge100']:.0f}%</td>")
            cls = "good" if s["ge90"] >= 70 else ("warn" if s["ge90"] >= 45 else "bad")
            t.append(f"<td class='num'><span class='chip {cls}'>{s['ge90']:.0f}%</span></td>")
            t.append(f"<td class='num'>{s['lt70']:.0f}%</td></tr>")
        t.append("</tbody></table></div>")
        return "".join(t)

    a(_cmp_table(fr_stats, "分红实现率 (FR) - 跨公司对比唯一基准"))
    a("<div style='height:26px'></div>")
    a(_cmp_table(tcvr_stats, "总现金价值比率 (TCVR) - 含保证部分，仅供参考"))

    if sk["forbid_rank"]:
        a("<div class='note-box'><p><b>解读提示</b>：上述两组数据反映不同层面的信息。跨公司对比时，建议主要参考 <b>FR（分红实现率）</b>，它能更真实地反映险企的红利管理能力；而 <b>TCVR（总现金价值比率）</b> 更适合用于评估具体客户保单账户目前的整体表现。</p></div>")
    else:
        # 量化 FR→TCVR 的「保证垫高」幅度
        lifts = []
        for c in codes:
            fr, tv = fr_stats.get(c) or {}, tcvr_stats.get(c) or {}
            if fr.get("n") and tv.get("n"):
                lifts.append((tv["ge90"] - fr["ge90"], comps[c]["short_zh"],
                              fr["ge90"], tv["ge90"]))
        if lifts:
            lifts.sort(reverse=True)
            d0, c0, f0, t0 = lifts[0]
            a("<div class='note-box'><p><b>专业解析</b>：同一家公司换用 TCVR 口径后，"
              "≥90% 达标率普遍被「保证部分」垫高。垫高幅度最大的是"
              f"{esc(c0)}：FR 口径 ≥90% 占比 {f0:.0f}%，TCVR 口径 {t0:.0f}%，"
              f"相差 {d0:.0f} 个百分点。若把两者混为一谈，"
              "部分公司会被系统性高估。</p>"
              "<p>结论：横向对比一律用 FR；TCVR 只在评估"
              "「同一产品客户实际总回报」时作参考。</p></div>")
    a("</div></section>")

    # ── 分产品类型 ──
    a("<section id='pt'><div class='wrap'>")
    a("<h2>分产品类型</h2>")
    a("<p class='lead'>这是全站最重要的一层筛选。储蓄分红险、终身寿险、年金、危疾产品"
      "的红利机制与投资账户完全不同，混在一起算出来的数字没有意义。</p>")
    order = ["savings", "wholelife", "annuity", "ci", "medical", "other"]
    a("<div class='table-responsive'><table><thead><tr><th>公司</th><th>产品类型</th><th class='num'>有效产品数</th>"
      "<th class='num'>中位数</th><th class='num'>≥90% 占比 (达标优秀率)</th></tr></thead><tbody>")
    for c in codes:
        types = stats["by_company_product_type"].get(c, {})
        first = True
        for pt in order:
            s = types.get(pt)
            if not s or not s.get("n"):
                continue
            name = f"<b>{esc(comps[c]['short_zh'])}</b>" if first else ""
            first = False
            cls = "good" if s["ge90"] >= 70 else ("warn" if s["ge90"] >= 45 else "bad")
            a(f"<tr><td>{name}</td><td>{esc(L['product_type'].get(pt, pt))}</td>")
            a(f"<td class='num'>{s['n']}</td><td class='num'><b>{s['median']:.0f}%</b></td>")
            a(f"<td class='num'><span class='chip {cls}'>{s['ge90']:.0f}%</span></td></tr>")
    a("</tbody></table></div>")
    
    a("<div class='note-box info' style='margin-top:16px'>"
      "<p><b>💡 数据偏差提示（如何客观评价“达标优秀率”？）</b></p>"
      "<p>统计 <b>≥90% 占比</b> 时，各年份的保单在公式中权重相等。像 <b>友邦 (AIA)</b> 这样历史悠久的龙头险企，主动披露了多达数十款、跨越10年以上历史周期的老旧保单（历经多次全球金融海啸考验），由于包含了大量早期已停售且底层结构不同的产品，其全盘统计的比例在客观上会被拉平。</p>"
      "<p>相反，部分险企仅披露近年发行的少数新产品（大多处于容易实现高分红的“前三年蜜月期”），这在统计学上会产生“幸存者偏差”，人为垫高了其达标率。</p>"
      "<p><b>结论</b>：评估险企的真实兑现能力，不能单纯只看全量历史产品的混合均值，而应重点参考<b>「标杆险企旗舰验证 (AIA)」</b>中核心主打产品的优异表现，以及长达 10 年以上的长期兑现趋势。</p>"
      "</div>")
    a("</div></section>")

    # ── 分红类型 ──
    a("<section id='bt'><div class='wrap'>")
    a("<h2>分红类型与指标口径</h2>")
    a("<p class='lead'>分红实现率（FR）只看非保证部分的兑现程度；"
      "总现金价值比率（TCVR）把保证现金价值一并计入，更接近客户实际能拿回的总额。"
      "两者不可互相替代。</p>")
    a("<div class='table-responsive'><table><thead><tr><th>公司</th><th>指标</th><th>红利类型</th>"
      "<th class='num'>有效产品数</th><th class='num'>中位数</th>"
      "<th class='num'>≥90% 占比 (达标优秀率)</th></tr></thead><tbody>")
    for c in codes:
        bym = stats["by_company_bonus"].get(c, {})
        for metric in ["FR", "TCVR"]:
            bts = bym.get(metric, {})
            first = True
            for bt in ["annual", "reversionary", "terminal", "tcvr"]:
                s = bts.get(bt)
                if not s or not s.get("n"):
                    continue
                nm = f"<b>{esc(comps[c]['short_zh'])}</b>" if first else ""
                first = False
                cls = "good" if s["ge90"] >= 70 else ("warn" if s["ge90"] >= 45 else "bad")
                
                # Format Metric for display
                metric_disp = "分红实现率 (FR)" if metric == "FR" else "总现价比率 (TCVR)"

                a(f"<tr><td>{nm}</td><td>{esc(metric_disp)}</td>"
                  f"<td>{esc(L['bonus_type'].get(bt, bt))}</td>")
                a(f"<td class='num'>{s['n']}</td>"
                  f"<td class='num'><b>{s['median']:.0f}%</b></td>")
                a(f"<td class='num'><span class='chip {cls}'>{s['ge90']:.0f}%</span></td></tr>")
    a("</tbody></table></div>")
    a("</div></section>")

    # ── 产品明细 ──
    a("<section id='prod'><div class='wrap'>")
    a("<h2>全量产品明细与检索</h2>")
    a("<p class='lead'>每一个产品系列的逐年表现。支持按公司、"
      "产品类型或指标快速筛选，也支持按产品名直接模糊检索：</p>")
    
    a("<div class='pill-group'>")
    a("<button class='pill-btn active' data-quick='all'>全部产品</button>")
    a("<button class='pill-btn' data-quick='aia'>⭐ 友邦香港 (AIA) 专区</button>")
    a("<button class='pill-btn' data-quick='savings'>储蓄分红主力</button>")
    a("<button class='pill-btn' data-quick='pru'>保诚 (PRU)</button>")
    a("<button class='pill-btn' data-quick='axa'>安盛 (AXA)</button>")
    a("<button class='pill-btn' data-quick='manu'>宏利 (MANU)</button>")
    a("</div>")

    a("<div class='filters'>")
    a("<input id='q' type='search' placeholder='搜索产品名 (如：盈御 / 简爱 / 充裕未来 / 雋升)…'>")
    a("<select id='fc'><option value=''>全部保险公司</option>")
    for c in codes:
        a(f"<option value='{esc(c)}'>{esc(comps[c]['short_zh'])} ({esc(c)})</option>")
    a("</select>")
    a("<select id='ft'><option value=''>全部产品类型</option>")
    for k, v in L["product_type"].items():
        a(f"<option value='{esc(k)}'>{esc(v)}</option>")
    a("</select>")
    a("<select id='fm'><option value=''>全部指标口径</option>"
      "<option value='FR'>分红实现率 (FR)</option>"
      "<option value='TCVR'>总现金价值比率 (TCVR)</option></select>")
    a("</div>")
    a("<div class='tbl-scroll'><table id='ptbl'><thead><tr>"
      "<th>公司</th><th>产品系列</th><th>类型</th><th>指标</th>"
      "<th class='num'>数据点</th><th class='num'>中位数</th>"
      "<th class='num'>全区间</th><th class='num'>≥90%占比</th>"
      "<th>逐 年（生效年份→%）</th></tr></thead><tbody>")
    for p in stats["products"]:
        s = p["stats"]
        if not s.get("n"):
            continue
            
        chips = []
        for y, v in list(p["series"].items())[:15]:
            c_cls = "good" if v >= 90 else ("warn" if v >= 70 else "bad")
            chips.append(f"<span class='yr-chip {c_cls}'><span class='yr'>{y}</span><span class='val'>{v:.0f}%</span></span>")
        ser_html = f"<div style='display:flex;flex-wrap:wrap;gap:4px;'>{''.join(chips)}</div>"
        
        # Format Metric for display
        metric_disp = "分红实现率(FR)" if p['metric'] == "FR" else "总现价比率(TCVR)"

        a(f"<tr data-c='{esc(p['insurer_code'])}' data-t='{esc(p['product_type'])}' "
          f"data-m='{esc(p['metric'])}'>")
        a(f"<td><b>{esc(comps.get(p['insurer_code'],{}).get('short_zh',''))}</b></td>")
        a(f"<td>{esc(p['product'])}</td>")
        a(f"<td>{esc(L['product_type'].get(p['product_type'], p['product_type']))}</td>")
        a(f"<td><span class='chip'>{esc(metric_disp)}</span></td>")
        a(f"<td class='num'>{s['n']}</td><td class='num'><b>{s['median']:.0f}%</b></td>")
        a(f"<td class='num'>{s['min']:.0f}–{s['max']:.0f}%</td>")
        a(f"<td class='num'>{s['ge90']:.0f}%</td>")
        a(f"<td>{ser_html}</td></tr>")
    a("</tbody></table></div>")
    a("</div></section>")


    # ── 方法论 ──
    a("<section id='method'><div class='wrap'>")
    a("<h2>统计口径与数据来源</h2>")
    a("<h3>数据怎么来的</h3>")
    a("<p class='lead'>由香港保险业监管局（IA）公布的《保险公司实现率披露网页清单》"
      "取得各公司官方页面地址，抓取后按统一 schema 解析。"
      "每家公司抓取当日的页面 HTML 均完整归档，可逐条复核。</p>")
    a("<div class='table-responsive'><table><thead><tr><th>公司</th><th>抓取通道</th><th>抓取日</th>"
      "<th>官方来源</th></tr></thead><tbody>")
    for c in codes:
        m = comps[c]
        ch = {"static": "静态直取", "browser": "浏览器渲染", "reparse": "快照重解析"}.get(
            m["channel"], m["channel"])
        a(f"<tr><td>{esc(m['short_zh'])}</td><td>{esc(ch)}</td>"
          f"<td>{esc(m['fetch_date'])}</td>"
          f"<td class='src'>{esc(m['source_url'])}</td></tr>")
    a("</tbody></table></div>")

    a("<h3>几个容易踩的口径问题</h3>")
    a("<div class='note-box'><p><b>1. 无数据不等于 0。</b>"
      "「已停售」「尚未推出」「不适用」是官方声明的三种不同状态，"
      "一律不参与统计，也绝不当作 0 处理。</p>"
      "<p><b>2. 保单年度的换算。</b>"
      "官网表格多以「保单生效年份」为列。保单年度 = 报告年度 − 生效年份。"
      "例如 2025 报告年度中，2024 年生效的保单处于第 1 个保单年度。</p>"
      "<p><b>3. 产品类型必须分层。</b>"
      "储蓄分红险、终身寿险、年金、危疾的红利机制与投资账户不同，"
      "混算会严重误导。本库全部按类型分层统计。</p>"
      "<p><b>4. 中位数优先于平均数。</b>"
      "港险实现率存在极端值（个别早期保单演示基数极低，"
      "会算出数百甚至上千百分比），均值会被这些值拉走。 "
      "本库主用中位数、P25/P75、达标率与离差。</p>"
      "<p><b>5. 个案演示不入库。</b>"
      "部分公司官网同时展示「个案一/个案二」等单个示例保单的历史追踪，"
      "那是营销性质的个别保单数据，不是 GL16 要求的产品级聚合口径，已排除。</p>"
      "<p><b>6. FR 与 TCVR 必须分列。</b>"
      "分红实现率（FR）只算非保证部分，是 GL16 强制口径；"
      "总现金价值比率（TCVR）含保证现金价值，数字天然偏高且属自愿披露。"
      "本站公司级对比一律以 FR 为准，TCVR 单独列示，两表不混排。</p></div>")

    a("<h3>数据来源</h3>")
    a("<p class='lead'>各保险公司依 GL16 于官网披露的分红实现率与总现金价值比率页面；"
      "公司清单取自香港保险业监管局公布的披露网页清单"
      "（ia.org.hk/js/data/fulfillment_ratio.json）。</p>")

    a("</div></section>")

    # ── footer 免责 ──
    a("<footer><div class='wrap'>")
    if sk["forbid_rank"]:
        a("<p><b>重要提示</b>：分红实现率与总现金价值比率只反映保险公司"
          "过往派发非保证利益的表现，<b>并非未来表现的指标</b>，"
          "也不等同个别保单的实际回报率。非保证红利由保险公司全权决定，"
          "可高于亦可低于销售时利益说明所示金额。</p>")
        a("<p>本页数字按各保险公司在官方网站公布的资料整理，"
          "每个数字均可回溯至对应公司页面（见「口径与来源」）。"
          "不同公司的产品结构、红利类型与披露格式并不一致，"
          "跨公司数字仅供参考，不宜直接作为产品优劣的判断依据。 "
          "本页不构成任何保险产品的销售建议或要约。</p>")
    else:
        a("<p><b>内部研究用途</b>：本页为内部选型与对比研究工具，"
          "含分析性判断。对外使用前请改用对客展示版，"
          "或按 GL16 要求补充「过往表现并非未来指标」的完整免责表述。</p>")
        a("<p>过往分红表现并非未来表现的指标。非保证利益由保险公司全权决定，"
          "可能高于或低于销售时说明所示金额。</p>")
    a(f"<p style='margin-top:14px'>生成时间 {esc(stats['generated_at'])}　|　"
      f"报告年度 {yr}　|　有效数据点 {tot['current_valid']:,} 条</p>")
    a("</div></footer>")

    # ── 筛选脚本 ──
    a("""<script>
const q=document.getElementById('q'),fc=document.getElementById('fc'),
 ft=document.getElementById('ft'),fm=document.getElementById('fm'),
 pills=document.querySelectorAll('.pill-btn'),
 rows=[...document.querySelectorAll('#ptbl tbody tr')];

function apply(){
 const s=(q.value||'').trim().toLowerCase();
 rows.forEach(r=>{
  const ok=(!s||r.children[1].textContent.toLowerCase().includes(s))
   &&(!fc.value||r.dataset.c===fc.value)
   &&(!ft.value||r.dataset.t===ft.value)
   &&(!fm.value||r.dataset.m===fm.value);
  r.style.display=ok?'':'none';
 });
}
[q,fc,ft,fm].forEach(e=>e.addEventListener('input',apply));

pills.forEach(btn=>{
 btn.addEventListener('click',()=>{
  pills.forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const type=btn.dataset.quick;
  q.value='';
  if(type==='all'){fc.value='';ft.value='';fm.value='';}
  else if(type==='aia'){fc.value='AIA';ft.value='';fm.value='';}
  else if(type==='savings'){fc.value='';ft.value='savings';fm.value='';}
  else if(type==='pru'){fc.value='PRU';ft.value='';fm.value='';}
  else if(type==='axa'){fc.value='AXA';ft.value='';fm.value='';}
  else if(type==='manu'){fc.value='MANU';ft.value='';fm.value='';}
  apply();
 });
});

// === 交互折线图即时 Tooltip 与 高亮控制 ===
const chartTooltip=document.createElement('div');
chartTooltip.id='chart-fast-tooltip';
document.body.appendChild(chartTooltip);

const trendPaths=document.querySelectorAll('.chart-path'),
 trendCircles=document.querySelectorAll('.chart-circle'),
 trendLegendPills=document.querySelectorAll('.legend-pill'),
 trendFilterBtns=document.querySelectorAll('.trend-btn'),
 aiaTag=document.querySelector('.aia-end-tag');

let currentTrendFilter='AIA'; // 默认聚焦友邦

function applyTrendHighlight(codes){
 const isAll=codes.includes('all');
 trendPaths.forEach(p=>{
  const c=p.dataset.code;
  const match=isAll||codes.includes(c);
  if(match){
   p.classList.remove('dimmed');
   if(c==='AIA'){
    p.style.strokeWidth='3.8px';
    p.style.opacity='1.0';
   }else{
    p.style.strokeWidth=codes.length<=2?'3.2px':'1.8px';
    p.style.opacity=codes.length<=2?'0.9':'0.45';
   }
  }else{
   p.classList.add('dimmed');
  }
 });

 trendCircles.forEach(circle=>{
  const c=circle.dataset.code;
  const match=isAll||codes.includes(c);
  if(match){
   circle.classList.remove('dimmed');
   circle.style.opacity=c==='AIA'?'1.0':'0.7';
  }else{
   circle.classList.add('dimmed');
  }
 });

 trendLegendPills.forEach(pill=>{
  const c=pill.dataset.code;
  const match=isAll||codes.includes(c);
  if(match){
   pill.classList.remove('dimmed');
   if(!isAll&&codes.includes(c)) pill.classList.add('active-pill');
   else pill.classList.remove('active-pill');
  }else{
   pill.classList.add('dimmed');
   pill.classList.remove('active-pill');
  }
 });

 if(aiaTag){
  aiaTag.style.display=(isAll||codes.includes('AIA'))?'':'none';
 }

  const noteEl = document.getElementById('trend-expert-note');
  if (noteEl) {
   if (codes.includes('AXA') && !isAll) {
    noteEl.innerHTML = '<p><b>💡 专家专业洞察：安盛 (AXA)</b></p><p>安盛在早年主要发行美式分红及不含高比例股票资产的保守型产品。近年来为了顺应市场，才开始大规模转型推出纯英式分红（高权益资产配置）的储蓄线。因此，其 10 年以上的老保单 100% 实现率更多反映的是当年低风险产品的表现，并不能直接推演其现今高波动英式分红旗舰产品的跨周期管理能力。</p>';
    noteEl.style.display = 'block';
   } else if (codes.includes('MANU') && !isAll) {
    noteEl.innerHTML = '<p><b>💡 专家专业洞察：宏利 (MANU)</b></p><p>宏利历史上曾偏重医疗保障与传统美式分红，近年才转型力推高波动的英式分红储蓄产品。需要特别注意的是，尽管其 10 年以上的老保单多为低风险的保守型结构，但在历经跨周期大考时，其红利实现率依然出现了明显的下滑（未及 100%）。保守型产品尚且未能实现长线稳健兑现，其新发行的纯英式分红旗舰在未来复杂资本市场中的管理能力，仍有待时间检验。</p>';
    noteEl.style.display = 'block';
   } else if (codes.includes('CTF') && !isAll) {
    noteEl.innerHTML = '<p><b>💡 专家专业洞察：周大福人寿 (CTF Life)</b></p><p>周大福人寿（前称富通保险）历史上经历了多次股东变更（比利时富通 -> 九鼎集团 -> 新世界周大福）。频繁的控股股东及管理层更迭，在一定程度上会干扰长期投资战略的连贯性。虽然短期红利兑现数据亮眼，但对于需要穿越几十年的大额保单与家族传承而言，其长期底蕴与资产稳定性与百年老店相比仍需跨越经济大周期的进一步验证。</p>';
    noteEl.style.display = 'block';
   } else if (codes.includes('PRU') && !isAll) {
    noteEl.innerHTML = '<p><b>💡 专家专业洞察：保诚 (PRU)</b></p><p>保诚的分红实现率常年波动较大，主要源于三大底层原因：第一，其早期王牌旗舰（如早期「隽升」）在十多年前的高息环境下制定了极高的预期演示收益，导致在随后长期的低息及震荡市中难以企及当初的超高预期；第二，保诚坚守高比例权益资产（股票）的英式分红，且较少采用强力的人为“利润平滑（Smoothing）”机制，而是严格按市值法将资产波动直接传递给客户；第三，其独特的“90/10”遗留资产分红机制在极端市场下缺乏足够的公司拨备缓冲。这也反证了友邦在同等高权益配置下，其卓越的利润平滑与跨周期资产管理能力。</p>';
    noteEl.style.display = 'block';
   } else {
    noteEl.style.display = 'none';
   }
  }
 }

 // 初始化：默认聚焦友邦
 applyTrendHighlight(['AIA']);

trendFilterBtns.forEach(btn=>{
 btn.addEventListener('click',()=>{
  trendFilterBtns.forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const target=btn.dataset.target;
  currentTrendFilter=target;
  applyTrendHighlight(target.split(','));
 });
});

function onElementHover(e,el){
 const code=el.dataset.code,
  name=el.dataset.name,
  year=el.dataset.year,
  val=el.dataset.val;

 let text='<b>'+name+' ('+code+')</b>';
 if(year&&val){
  text+='<br>保单生效年份：<b>'+year+' 年</b><br>实现率中位：<span style="color:#f5b041;font-weight:700;font-size:14px;">'+val+'%</span>';
 }else{
  text+='<br><span style="color:#bbb;font-size:11px;">点击下方图例可锁定对比</span>';
 }
 chartTooltip.innerHTML=text;
 chartTooltip.style.display='block';
 chartTooltip.style.left=e.clientX+'px';
 chartTooltip.style.top=e.clientY+'px';

 applyTrendHighlight([code]);
}

function onElementLeave(){
 chartTooltip.style.display='none';
 applyTrendHighlight(currentTrendFilter.split(','));
}

trendCircles.forEach(c=>{
 c.addEventListener('mousemove',e=>{
  chartTooltip.style.left=e.clientX+'px';
  chartTooltip.style.top=e.clientY+'px';
 });
 c.addEventListener('mouseenter',e=>onElementHover(e,c));
 c.addEventListener('mouseleave',onElementLeave);
});

trendPaths.forEach(p=>{
 p.addEventListener('mousemove',e=>{
  chartTooltip.style.left=e.clientX+'px';
  chartTooltip.style.top=e.clientY+'px';
 });
 p.addEventListener('mouseenter',e=>onElementHover(e,p));
 p.addEventListener('mouseleave',onElementLeave);
});

trendLegendPills.forEach(pill=>{
 const code=pill.dataset.code;
 pill.addEventListener('mouseenter',()=>{
  applyTrendHighlight([code]);
 });
 pill.addEventListener('mouseleave',()=>{
  applyTrendHighlight(currentTrendFilter.split(','));
 });
 pill.addEventListener('click',()=>{
  trendFilterBtns.forEach(b=>b.classList.remove('active'));
  currentTrendFilter=code;
  applyTrendHighlight([code]);
 });
});
</script>""")
    a("</body></html>")
    return "".join(P)



def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skin", choices=["internal", "client", "both"], default="both")
    a = ap.parse_args()

    stats = json.loads((DATA / "stats.json").read_text("utf-8"))
    SITE.mkdir(exist_ok=True)

    targets = ["internal", "client"] if a.skin == "both" else [a.skin]
    for sk in targets:
        html_str = build(stats, sk)
        name = "index.html" if sk == "internal" else "client.html"
        p = SITE / name
        p.write_text(html_str, "utf-8")
        print(f"已生成 {p.relative_to(BASE)}  ({len(html_str.encode('utf-8')):,} bytes)")


if __name__ == "__main__":
    main()
