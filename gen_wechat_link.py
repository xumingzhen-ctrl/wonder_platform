#!/usr/bin/env python3
"""
WONDER - 微信公众号专属链接生成工具
============================================================

使用方法:
  python3 gen_wechat_link.py <文章slug>
  python3 gen_wechat_link.py wonder241030
  python3 gen_wechat_link.py --all     # 生成所有客户通讯的链接

输出格式:
  https://hub.wonderwisdom.online/blog/<slug>?wc=<TOKEN>

将此链接放入微信公众号文章的"阅读原文"或超链接中，
持有链接的人无需登录即可阅读全文（有效期：当月+上月，约60天）。
"""

import sys
import os
import base64
import datetime
import re
import glob

# 与 wonder-hub/.env.local 中的 WECHAT_TOKEN_SECRET 保持一致
WECHAT_SECRET = os.environ.get("WECHAT_TOKEN_SECRET", "wonder-wechat-2024")

# 生产环境域名
HUB_BASE_URL = "https://wonderwisdom.online"

BLOG_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "apps", "wonder-hub", "src", "content", "blog"
)


def make_token(slug: str) -> str:
    """
    生成永久有效的微信通行 token
    格式: base64url(slug::secret)
    """
    raw = f"{slug}::{WECHAT_SECRET}"
    token = base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")
    return token


def make_link(slug: str) -> str:
    token = make_token(slug)
    return f"{HUB_BASE_URL}/blog/{slug}?wc={token}"


def get_newsletter_slugs() -> list[tuple[str, str]]:
    """获取所有客户通讯文章的 slug 和标题"""
    results = []
    for fpath in sorted(glob.glob(os.path.join(BLOG_DIR, "*.md"))):
        with open(fpath, encoding="utf-8") as f:
            content = f.read()
        if "restricted: true" not in content and "客户通讯" not in content:
            continue
        if "category: \"客户通讯\"" not in content:
            continue
        slug_m  = re.search(r'^slug:\s*"(.+)"', content, re.MULTILINE)
        title_m = re.search(r'^title:\s*"(.+)"', content, re.MULTILINE)
        if slug_m and title_m:
            results.append((slug_m.group(1), title_m.group(1)))
    return results


def main():
    args = sys.argv[1:]

    print("=" * 62)
    print("  WONDER 微信公众号专属链接生成器")
    print("=" * 62)
    print(f"  Token 密钥: {'*' * len(WECHAT_SECRET)}")
    print(f"  有效期: {datetime.date.today().strftime('%Y年%m月')}（约60天）")
    print()

    if "--all" in args:
        newsletters = get_newsletter_slugs()
        if not newsletters:
            print("⚠️  未找到客户通讯文章")
            return
        print(f"共找到 {len(newsletters)} 篇客户通讯：\n")
        for slug, title in newsletters:
            link = make_link(slug)
            print(f"📬 {title}")
            print(f"   {link}")
            print()
    elif args:
        slug = args[0].strip("/")
        link = make_link(slug)
        print(f"📬 文章 slug: {slug}")
        print(f"   专属链接: {link}")
        print()
        print("📋 使用说明:")
        print("   将此链接粘贴至微信公众号文章的【阅读原文】或正文超链接。")
        print("   读者点击后可直接阅读全文，无需登录。")
        print("   链接有效期约 60 天（当月及上月）。")
    else:
        print("使用方法:")
        print("  python3 gen_wechat_link.py <slug>   # 生成单篇文章链接")
        print("  python3 gen_wechat_link.py --all    # 生成所有客户通讯链接")
        print()
        print("示例:")
        print("  python3 gen_wechat_link.py wonder241030")


if __name__ == "__main__":
    main()
