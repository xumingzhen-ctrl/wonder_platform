#!/usr/bin/env python3
"""
Wonder Platform - 文章自动转换脚本 v2.0
将 articles_inbox/ 中的 Word 文档转换为 wonder-hub 博客系统的 Markdown 格式

改进（v2.0）:
  - 图片：自动提取并保存为 WebP，嵌入 Markdown
  - 表格：使用标准 Markdown 表格语法，支持对齐
  - 颜色对比：去除 Word 中的内联颜色样式，统一使用主题色

使用方法:
  python3 convert_articles.py
  python3 convert_articles.py --file articles_inbox/某文件.docx

分类识别规则（文件名前缀）:
  保险_ / ins_        → 保险理念
  投资_ / inv_        → 投资理念
  通讯_ / newsletter_ → 客户通讯
  无前缀              → 投资理念（默认）
"""

import os
import re
import sys
import json
import base64
import argparse
import datetime
import unicodedata
import mammoth
from html.parser import HTMLParser

# ─── 路径配置 ────────────────────────────────────────────────────────────
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
INBOX_DIR   = os.path.join(SCRIPT_DIR, "articles_inbox")
OUTPUT_DIR  = os.path.join(SCRIPT_DIR, "apps", "wonder-hub", "src", "content", "blog")
PUBLIC_DIR  = os.path.join(SCRIPT_DIR, "apps", "wonder-hub", "public", "article-images")
LOG_FILE    = os.path.join(SCRIPT_DIR, ".antigravity_log.md")

# ─── 分类映射 ─────────────────────────────────────────────────────────────
CATEGORY_MAP = {
    "保险_":        "保险理念",
    "ins_":         "保险理念",
    "投资_":        "投资理念",
    "inv_":         "投资理念",
    "通讯_":        "客户通讯",
    "newsletter_":  "客户通讯",
}
DEFAULT_CATEGORY    = "投资理念"
RESTRICTED_CATEGORY = "客户通讯"


# ─── 图片处理 ─────────────────────────────────────────────────────────────

def save_image(image_data: bytes, mime_type: str, article_slug: str, img_index: int) -> str:
    """
    将图片保存到 public/article-images/<slug>/ 目录，
    返回 Markdown 可用的相对路径 /article-images/<slug>/img-N.xxx
    """
    os.makedirs(os.path.join(PUBLIC_DIR, article_slug), exist_ok=True)

    ext_map = {
        "image/png":  "png",
        "image/jpeg": "jpg",
        "image/gif":  "gif",
        "image/webp": "webp",
        "image/svg+xml": "svg",
        # EMF/WMF（Windows 矢量格式）浏览器不支持，跳过
        "image/x-emf": None,
        "image/x-wmf": None,
    }
    ext = ext_map.get(mime_type)
    if ext is None:
        return ""  # 不支持的格式（EMF/WMF）直接跳过

    filename = f"img-{img_index}.{ext}"
    filepath = os.path.join(PUBLIC_DIR, article_slug, filename)

    # 尝试转为 WebP 以节省空间（需要 Pillow）
    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(image_data))
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGBA")
        else:
            img = img.convert("RGB")
        webp_path = os.path.join(PUBLIC_DIR, article_slug, f"img-{img_index}.webp")
        img.save(webp_path, "WEBP", quality=85)
        return f"/article-images/{article_slug}/img-{img_index}.webp"
    except ImportError:
        pass
    except Exception:
        pass

    # 回退：直接保存原格式
    with open(filepath, "wb") as f:
        f.write(image_data)
    return f"/article-images/{article_slug}/{filename}"


def make_image_converter(article_slug: str):
    """生成 mammoth 图片转换函数（闭包，携带 slug 和计数器）"""
    counter = [0]

    def convert_image(image):
        counter[0] += 1
        try:
            with image.open() as img_bytes:
                image_data = img_bytes.read()
            mime_type  = image.content_type or "image/png"
            img_path   = save_image(image_data, mime_type, article_slug, counter[0])
            if not img_path:
                return {}
            return {"src": img_path}
        except Exception as e:
            print(f"   ⚠️  图片处理失败: {e}")
            return {}

    return mammoth.images.img_element(convert_image)


# ─── HTML → Markdown 转换 ─────────────────────────────────────────────────

def html_table_to_markdown(table_html: str) -> str:
    """将 HTML 表格转换为标准 Markdown 表格"""

    class TableParser(HTMLParser):
        def __init__(self):
            super().__init__()
            self.rows = []
            self.current_row = []
            self.current_cell = []
            self.in_cell = False
            self.header_row_done = False
            self.is_header = False

        def handle_starttag(self, tag, attrs):
            if tag in ("tr",):
                self.current_row = []
                self.is_header = False
            elif tag in ("th",):
                self.current_cell = []
                self.in_cell = True
                self.is_header = True
            elif tag in ("td",):
                self.current_cell = []
                self.in_cell = True
            elif tag == "strong" and self.in_cell:
                pass  # 保持 bold

        def handle_endtag(self, tag):
            if tag in ("th", "td"):
                cell_text = "".join(self.current_cell).strip()
                cell_text = re.sub(r"\s+", " ", cell_text)
                self.current_row.append(cell_text)
                self.in_cell = False
            elif tag == "tr":
                if self.current_row:
                    self.rows.append((self.is_header, self.current_row))

        def handle_data(self, data):
            if self.in_cell:
                self.current_cell.append(data)

    parser = TableParser()
    parser.feed(table_html)
    rows = parser.rows

    if not rows:
        return ""

    # 找最大列数
    max_cols = max(len(r[1]) for r in rows)

    # 统一列数
    normalized = []
    for is_header, cells in rows:
        while len(cells) < max_cols:
            cells.append("")
        normalized.append((is_header, cells[:max_cols]))

    # 计算列宽
    col_widths = [0] * max_cols
    for _, cells in normalized:
        for i, c in enumerate(cells):
            col_widths[i] = max(col_widths[i], len(c), 3)

    def fmt_row(cells):
        parts = [f" {c.ljust(col_widths[i])} " for i, c in enumerate(cells)]
        return "|" + "|".join(parts) + "|"

    def sep_row():
        parts = ["-" * (col_widths[i] + 2) for i in range(max_cols)]
        return "|" + "|".join(parts) + "|"

    lines = []
    header_inserted = False
    for is_header, cells in normalized:
        lines.append(fmt_row(cells))
        if is_header and not header_inserted:
            lines.append(sep_row())
            header_inserted = True

    # 如果没有 th 行（全是 td），把第一行当作表头
    if not header_inserted and lines:
        lines.insert(1, sep_row())

    return "\n" + "\n".join(lines) + "\n"


def html_to_markdown(html: str) -> str:
    """将 mammoth 输出的 HTML 转换为高质量 Markdown"""

    # ── 1. 表格（优先处理，防止内部标签被破坏）──────────────────────
    def replace_table(m):
        return html_table_to_markdown(m.group(0))

    html = re.sub(
        r"<table[\s\S]*?</table>",
        replace_table,
        html,
        flags=re.DOTALL | re.IGNORECASE
    )

    # ── 2. 图片（img 标签 → Markdown）────────────────────────────────
    def replace_img(m):
        attrs = m.group(0)
        src_m  = re.search(r'src="([^"]+)"', attrs)
        alt_m  = re.search(r'alt="([^"]*)"', attrs)
        src = src_m.group(1) if src_m else ""
        alt = alt_m.group(1) if alt_m else "图片"
        if not src:
            return ""
        return f"\n\n![{alt}]({src})\n\n"

    html = re.sub(r"<img[^>]+/?>", replace_img, html, flags=re.IGNORECASE)

    # ── 3. 标题 ───────────────────────────────────────────────────────
    html = re.sub(r"<h1[^>]*>(.*?)</h1>", r"# \1", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<h2[^>]*>(.*?)</h2>", r"\n## \1\n", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<h3[^>]*>(.*?)</h3>", r"\n### \1\n", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<h4[^>]*>(.*?)</h4>", r"\n#### \1\n", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<h5[^>]*>(.*?)</h5>", r"\n##### \1\n", html, flags=re.DOTALL | re.IGNORECASE)

    # ── 4. 强调 ───────────────────────────────────────────────────────
    html = re.sub(r"<strong[^>]*>(.*?)</strong>", r"**\1**", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<b[^>]*>(.*?)</b>", r"**\1**", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<em[^>]*>(.*?)</em>", r"*\1*", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<i[^>]*>(.*?)</i>", r"*\1*", html, flags=re.DOTALL | re.IGNORECASE)

    # ── 5. 引用块 ─────────────────────────────────────────────────────
    def replace_blockquote(m):
        inner = re.sub(r"<[^>]+>", "", m.group(1)).strip()
        lines = inner.split("\n")
        return "\n" + "\n".join(f"> {l}" for l in lines if l.strip()) + "\n"

    html = re.sub(
        r"<blockquote[^>]*>(.*?)</blockquote>",
        replace_blockquote,
        html,
        flags=re.DOTALL | re.IGNORECASE,
    )

    # ── 6. 列表 ───────────────────────────────────────────────────────
    html = re.sub(r"<li[^>]*>(.*?)</li>", r"\n- \1", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<[ou]l[^>]*>", "\n", html, flags=re.IGNORECASE)
    html = re.sub(r"</[ou]l>", "\n", html, flags=re.IGNORECASE)

    # ── 7. 链接 ───────────────────────────────────────────────────────
    html = re.sub(r'<a\s+href="([^"]+)"[^>]*>(.*?)</a>', r"[\2](\1)", html, flags=re.DOTALL | re.IGNORECASE)

    # ── 8. 分割线 ─────────────────────────────────────────────────────
    html = re.sub(r"<hr\s*/?>", "\n\n---\n\n", html, flags=re.IGNORECASE)

    # ── 9. 换行 ───────────────────────────────────────────────────────
    html = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)

    # ── 10. 段落 ──────────────────────────────────────────────────────
    html = re.sub(r"<p[^>]*>(.*?)</p>", r"\1\n\n", html, flags=re.DOTALL | re.IGNORECASE)

    # ── 11. 清除残余 HTML 标签（保留内容）────────────────────────────
    html = re.sub(r"<[^>]+>", "", html)

    # ── 12. HTML 实体解码 ─────────────────────────────────────────────
    html = html.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    html = html.replace("&nbsp;", " ").replace("&#160;", " ")
    html = html.replace("&ldquo;", "\u201c").replace("&rdquo;", "\u201d")
    html = html.replace("&lsquo;", "\u2018").replace("&rsquo;", "\u2019")

    # ── 13. 规范化空白 ────────────────────────────────────────────────
    html = re.sub(r" {2,}", " ", html)             # 多余空格
    html = re.sub(r"\n{3,}", "\n\n", html)          # 多余空行
    html = re.sub(r"^\s+", "", html, flags=re.MULTILINE)  # 行首空格

    # ── 14. GFM 表格修复（关键！） ─────────────────────────────────
    html = fix_markdown_tables(html)

    return html.strip()


def fix_markdown_tables(text: str) -> str:
    """
    修复 Markdown 中的 GFM 表格问题：
    1. 如果表格行 (| xxx |) 前面有 '- ' 前缀（嵌套在列表里），移除前缀
    2. 确保表格块前后有空行
    3. 合并被拆断的分隔行 |---|---|
    """
    lines = text.split("\n")
    result: list[str] = []
    i = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # 检测表格行：以 | 开头并以 | 结尾（不算纯分隔行以外）
        is_table_row = (
            stripped.startswith("|") and stripped.endswith("|") and len(stripped) > 2
        )

        # 如果前面是 "- | xxx |" 形式（列表里嵌入的表格行）
        if not is_table_row and re.match(r"^-\s*\|", stripped):
            stripped = stripped.lstrip("- ").strip()
            is_table_row = stripped.startswith("|") and stripped.endswith("|")
            if is_table_row:
                line = stripped

        if is_table_row:
            # 收集整个表格块
            table_lines = []

            # 如果前一行是注释/标题行紧挨着表格，保持分离
            while i < len(lines):
                cur = lines[i].strip()
                # 去掉列表前缀
                if re.match(r"^-\s*\|", cur):
                    cur = cur.lstrip("- ").strip()

                if cur.startswith("|") and cur.endswith("|"):
                    table_lines.append(cur)
                    i += 1
                elif re.match(r"^\|[-|: ]+\|$", cur):
                    # 纯分隔行
                    table_lines.append(cur)
                    i += 1
                else:
                    break

            # 确保表格前有空行
            if result and result[-1].strip() != "":
                result.append("")

            result.extend(table_lines)

            # 确保表格后有空行
            result.append("")
        else:
            result.append(line)
            i += 1

    return "\n".join(result)


# ─── 工具函数 ─────────────────────────────────────────────────────────────

def detect_category(filename: str) -> tuple[str, str]:
    basename = os.path.splitext(os.path.basename(filename))[0]
    # 1. 明确前缀匹配（最高优先级）
    for prefix, category in CATEGORY_MAP.items():
        if basename.lower().startswith(prefix.lower()):
            return category, basename[len(prefix):]
    # 2. 文件名含"通讯"/"月报"/"季报" → 客户通讯
    newsletter_keywords = ["通讯", "月报", "季报", "客户月报", "客户季报"]
    for kw in newsletter_keywords:
        if kw in basename:
            return "客户通讯", basename
    # 3. 默认
    return DEFAULT_CATEGORY, basename


def to_slug(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text)
    ascii_text = ascii_text.encode("ascii", "ignore").decode("ascii")
    ascii_text = re.sub(r"[^\w\s-]", "", ascii_text).strip().lower()
    ascii_text = re.sub(r"[\s_-]+", "-", ascii_text)
    if not ascii_text:
        date_str = datetime.date.today().strftime("%Y%m%d")
        safe = re.sub(r"[^\u4e00-\u9fff\w]", "", text)[:8]
        return f"article-{date_str}-{abs(hash(safe)) % 10000}"
    return ascii_text[:80]


def extract_newsletter_performance(content: str) -> str:
    """
    从客户通讯正文中提取组合业绩数据作为摘要
    优先提取: 组合净值增长 / 累计增长 / 年内增长 等关键数字
    """
    perf_patterns = [
        r"(组合[^\n，。|]{0,20}?)(净值增长|累计增长|年内增长|累积收益|累计回报)[^\n%|]*?([-\d.]+%)",
        r"(ILI[^\n，|]{0,25}?)(累计|增长|回报)[^\n%|]*?([-\d.]+%)",
        r"累计增长\s*([-\d.]+%)",
        r"(净值|组合)[^\n|]{0,20}?(增长|收益|回报)[^\n%|]*?([-\d.]+%)",
    ]
    findings = []
    for pattern in perf_patterns:
        matches = re.findall(pattern, content, re.IGNORECASE)
        for m in matches:
            if isinstance(m, tuple):
                pct = m[-1]
                label = "".join(m[:-1]).strip()
                label = re.sub(r"[|*\[\]！\s]+", " ", label).strip()[:16]
                findings.append(f"{label}：{pct}")
            else:
                findings.append(m)
        if findings:
            break
    if findings:
        return "本期参考组合表现：" + " / ".join(findings[:3])
    return extract_summary(content)


def extract_summary(content: str, max_len: int = 120) -> str:
    lines = [l.strip() for l in content.split("\n")
             if l.strip() and not l.startswith("#") and not l.startswith("![") and not l.startswith("|")
             and not re.match(r'^[-=]{3,}', l)]
    text = " ".join(lines)
    text = re.sub(r"\*\*?(.*?)\*\*?", r"\1", text)
    text = re.sub(r"`.*?`", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = text[:max_len]
    return text + ("..." if len(text) == max_len else "")


def extract_tags_from_content(content: str, category: str) -> list[str]:
    base_tags = {
        "保险理念": ["保险规划", "风险管理"],
        "投资理念": ["资产配置", "投资策略"],
        "客户通讯": ["季报", "市场观察"],
    }
    tags = list(base_tags.get(category, []))
    keyword_map = {
        "美联储": "美联储", "降息": "利率", "黄金": "黄金",
        "ETF": "ETF", "港股": "港股", "A股": "A股",
        "美元": "美元", "日本": "日本市场", "通胀": "通胀",
        "债券": "固定收益", "股票": "权益资产", "基金": "基金",
        "保险": "保险", "年金": "年金", "储蓄": "储蓄规划",
        "复利": "复利", "现金流": "现金流规划", "遗产": "财富传承",
        "季报": "季报", "月报": "月报", "年报": "年度展望",
        "REITs": "REITs", "REIT": "REITs", "房地产": "房地产",
    }
    for keyword, tag in keyword_map.items():
        if keyword in content and tag not in tags:
            tags.append(tag)
    return tags[:5]


def build_frontmatter(title, slug, category, summary, tags, restricted=False):
    today = datetime.date.today().isoformat()
    # summary 中不能有双引号
    summary_safe = summary.replace('"', '\\"')
    title_safe   = title.replace('"', '\\"')
    fm = [
        "---",
        f'title: "{title_safe}"',
        f'slug: "{slug}"',
        f'date: "{today}"',
        f'category: "{category}"',
        f'summary: "{summary_safe}"',
        f"tags: {json.dumps(tags, ensure_ascii=False)}",
        f'author: "WONDER 研究团队"',
    ]
    if restricted:
        fm.append("restricted: true")
    fm.append("---")
    return "\n".join(fm)


# ─── 主转换逻辑 ───────────────────────────────────────────────────────────

def convert_docx(filepath: str) -> dict:
    filename = os.path.basename(filepath)
    category, raw_title = detect_category(filename)
    restricted = (category == RESTRICTED_CATEGORY)

    print(f"\n📄 正在处理: {filename}")
    print(f"   → 分类: {category}")

    # 先用文件名生成临时 slug（用于图片目录）
    temp_slug = to_slug(raw_title)

    # mammoth 转换：支持图片提取
    image_converter = make_image_converter(temp_slug)
    style_map = """
        p[style-name='Heading 1'] => h1:fresh
        p[style-name='Heading 2'] => h2:fresh
        p[style-name='Heading 3'] => h3:fresh
        p[style-name='Heading 4'] => h4:fresh
        p[style-name='标题 1'] => h1:fresh
        p[style-name='标题 2'] => h2:fresh
        p[style-name='标题 3'] => h3:fresh
        p[style-name='标题 4'] => h4:fresh
        r[style-name='Strong'] => strong
        r[style-name='Emphasis'] => em
    """

    with open(filepath, "rb") as f:
        result = mammoth.convert_to_html(
            f,
            convert_image=image_converter,
            style_map=style_map,
        )
        html = result.value
        warn_count = sum(1 for m in result.messages if m.type == "warning"
                         and "image" not in m.message.lower())
        if warn_count:
            print(f"   ℹ️  转换提示: {warn_count} 条样式警告（不影响内容）")

    # HTML → Markdown
    md_content = html_to_markdown(html)

    # 提取标题（优先 frontmatter 中的 h1）
    h1_match = re.search(r"^# (.+)$", md_content, re.MULTILINE)
    if h1_match:
        title = h1_match.group(1).strip()
        md_content = md_content.replace(h1_match.group(0), "", 1).strip()
    else:
        title = raw_title

    # 重新用真实标题生成 slug，并重命名图片目录
    real_slug = to_slug(title) or to_slug(raw_title)
    if real_slug != temp_slug:
        old_dir = os.path.join(PUBLIC_DIR, temp_slug)
        new_dir = os.path.join(PUBLIC_DIR, real_slug)
        if os.path.isdir(old_dir):
            os.rename(old_dir, new_dir)
        # 更新正文中的图片路径
        md_content = md_content.replace(
            f"/article-images/{temp_slug}/",
            f"/article-images/{real_slug}/"
        )

    # 统计图片数
    img_count = md_content.count("![")
    if img_count:
        print(f"   🖼️  提取图片: {img_count} 张")

    # 客户通讯：优先提取组合业绩数字作为摘要
    summary = (extract_newsletter_performance(md_content)
               if category == RESTRICTED_CATEGORY
               else extract_summary(md_content))

    tags    = extract_tags_from_content(md_content, category)

    frontmatter = build_frontmatter(title, real_slug, category, summary, tags, restricted)
    full_content = (
        f"{frontmatter}\n\n"
        f"{md_content}\n\n"
        f"---\n\n"
        f"*WONDER 研究团队 · {datetime.date.today().strftime('%Y年%m月')}*\n"
    )

    # 输出文件名
    output_filename = f"{real_slug}.md"
    output_path = os.path.join(OUTPUT_DIR, output_filename)
    if os.path.exists(output_path):
        ts = datetime.datetime.now().strftime("%m%d%H%M")
        output_filename = f"{real_slug}-{ts}.md"
        output_path = os.path.join(OUTPUT_DIR, output_filename)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(full_content)

    print(f"   ✅ 已输出: src/content/blog/{output_filename}")
    return {
        "input": filename,
        "output": output_filename,
        "title": title,
        "category": category,
        "restricted": restricted,
        "slug": real_slug,
        "images": img_count,
    }


def update_log(results: list[dict]):
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    entries = "\n".join(
        f"  - [{r['category']}] {r['title']} → `{r['output']}`"
        f"{'  🖼️ ' + str(r['images']) + '张图片' if r.get('images') else ''}"
        f"{'  🔒' if r['restricted'] else ''}"
        for r in results
    )
    log_entry = f"""
---
## [{now}] 文章批量转换 v2.0

**[Status]** 已完成

**[Change Log]**
{entries}

**[Logic Reason]**
使用 convert_articles.py v2.0 转换，新增图片提取（保存至 public/article-images/）
和标准 Markdown 表格支持。

**[Pending/TODO]**
- 检查图片是否正确显示
- 确认表格对齐是否正确
"""
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(log_entry)
    print(f"\n📝 日志已更新")


def main():
    parser = argparse.ArgumentParser(description="Wonder 文章转换脚本 v2.0")
    parser.add_argument("--file", help="只转换指定的单个文件")
    args = parser.parse_args()

    print("=" * 60)
    print("  WONDER 文章转换工具  v2.0  (图片+表格增强版)")
    print("=" * 60)

    if args.file:
        files = [args.file]
    else:
        if not os.path.isdir(INBOX_DIR):
            print(f"❌ 找不到投稿文件夹: {INBOX_DIR}")
            sys.exit(1)
        files = sorted([
            os.path.join(INBOX_DIR, f)
            for f in os.listdir(INBOX_DIR)
            if f.lower().endswith(".docx") and not f.startswith("~")
        ])

    if not files:
        print(f"\n📭 articles_inbox/ 文件夹中暂无 .docx 文件。")
        return

    print(f"\n📂 发现 {len(files)} 个文档待处理...")
    results, errors = [], []

    for filepath in files:
        try:
            results.append(convert_docx(filepath))
        except Exception as e:
            import traceback
            print(f"   ❌ 失败: {e}")
            traceback.print_exc()
            errors.append({"file": filepath, "error": str(e)})

    print("\n" + "=" * 60)
    print(f"  完成！成功 {len(results)} 篇，失败 {len(errors)} 篇")
    print("=" * 60)

    if results:
        print("\n已转换文章:")
        for r in results:
            lock = " 🔒" if r["restricted"] else ""
            imgs = f" 🖼️ {r['images']}图" if r.get("images") else ""
            print(f"  [{r['category']}] {r['title']}{imgs}{lock}")
        print(f"\n📌 刷新 http://localhost:3000/blog 查看新文章")
        update_log(results)

    if errors:
        print("\n❌ 失败文件:")
        for e in errors:
            print(f"  {os.path.basename(e['file'])}: {e['error']}")


if __name__ == "__main__":
    main()
