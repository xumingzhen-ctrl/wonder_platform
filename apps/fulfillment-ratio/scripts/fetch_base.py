#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""抓取基类：HTTP 直取 / 浏览器渲染，并强制归档原始快照。

快照归档是合规底线——每个数字都要能回溯到某一时刻的官方页面。
目录：data/raw/{insurer_code}/{fetch_date}/
      page.html + meta.json（源 URL、抓取时间、HTTP 状态、通道）
"""
from __future__ import annotations

import json
import pathlib
import time
from dataclasses import dataclass, field

import requests

BASE = pathlib.Path(__file__).resolve().parent.parent
RAW = BASE / "data" / "raw"

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")


@dataclass
class Snapshot:
    insurer_code: str
    fetch_date: str
    url: str
    channel: str
    slug: str = "main"
    status: int = 0
    bytes: int = 0
    elapsed_s: float = 0.0
    note: str = ""
    extra: dict = field(default_factory=dict)


    @property
    def dir(self) -> pathlib.Path:
        # 一家公司可能拆多个页面源（如保诚 FR / TCVR 各一页），用 slug 分目录
        return RAW / self.insurer_code / self.fetch_date / (self.slug or "main")

    def save(self, html: str) -> pathlib.Path:
        self.dir.mkdir(parents=True, exist_ok=True)
        (self.dir / "page.html").write_text(html, "utf-8")
        self.bytes = len(html.encode("utf-8"))
        (self.dir / "meta.json").write_text(
            json.dumps(self.__dict__, ensure_ascii=False, indent=2), "utf-8")
        return self.dir / "page.html"


class Fetcher:
    """静态直取 + 浏览器渲染两条通道。"""

    def __init__(self, insurer_code: str, fetch_date: str):
        self.code = insurer_code
        self.date = fetch_date

    # ── 通道一：requests 直取 ──────────────────────────────────────
    def get_static(self, url: str, note: str = "", retries: int = 2,
                    slug: str = "main") -> Snapshot | None:
        snap = Snapshot(self.code, self.date, url, "static", note=note, slug=slug)
        t0 = time.time()
        for attempt in range(retries + 1):
            try:
                r = requests.get(
                    url,
                    headers={"User-Agent": UA,
                             "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                             "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"},
                    timeout=45,
                )
                snap.status = r.status_code
                snap.elapsed_s = round(time.time() - t0, 2)
                if r.status_code == 200:
                    # 无 charset 头时 requests 默认 ISO-8859-1 会毁中文——用嗅探编码
                    if not r.encoding or r.encoding.lower() in ("iso-8859-1", "ascii"):
                        r.encoding = r.apparent_encoding or "utf-8"
                    snap.save(r.text)
                    return snap
                if attempt == retries:
                    return snap
            except Exception as e:
                snap.note = f"{note} err={type(e).__name__}: {e}"[:200]
                snap.elapsed_s = round(time.time() - t0, 2)
                if attempt == retries:
                    return snap
            time.sleep(1.5 * (attempt + 1))
        return snap

    # ── 通道二：Playwright 渲染 ────────────────────────────────────
    def get_rendered(self, url: str, note: str = "",
                     wait_selector: str | None = None,
                     wait_ms: int = 3500,
                     click_texts: list[str] | None = None,
                     slug: str = "main") -> Snapshot | None:
        from playwright.sync_api import sync_playwright

        snap = Snapshot(self.code, self.date, url, "browser", note=note, slug=slug)
        t0 = time.time()
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(
                    headless=True,
                    args=["--disable-blink-features=AutomationControlled",
                          "--no-sandbox"],
                )
                ctx = browser.new_context(
                    user_agent=UA,
                    locale="zh-CN",
                    viewport={"width": 1440, "height": 900},
                )
                page = ctx.new_page()
                resp = page.goto(url, timeout=60000, wait_until="domcontentloaded")
                snap.status = resp.status if resp else 0

                # 展开可能需要点击的标签/折叠区
                for txt in (click_texts or []):
                    try:
                        page.get_by_text(txt, exact=False).first.click(timeout=4000)
                        page.wait_for_timeout(800)
                    except Exception:
                        pass

                if wait_selector:
                    try:
                        page.wait_for_selector(wait_selector, timeout=15000)
                    except Exception:
                        pass
                page.wait_for_timeout(wait_ms)
                # 滚动到底，触发懒加载
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                page.wait_for_timeout(1200)
                html = page.content()
                browser.close()
                snap.elapsed_s = round(time.time() - t0, 2)
                snap.save(html)
                return snap
        except Exception as e:
            snap.note = f"{note} err={type(e).__name__}: {e}"[:200]
            snap.elapsed_s = round(time.time() - t0, 2)
            return snap
