"""
Wonder Hub 文章管理 API
- 仅 admin 角色可以增删改
- 直接操作 wonder-hub/src/content/blog/*.md 文件
"""
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from services.auth import get_current_user

router = APIRouter(prefix="/api/articles", tags=["Articles"])

# 文章目录（相对于项目根目录）
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
BLOG_DIR = PROJECT_ROOT / "apps" / "wonder-hub" / "src" / "content" / "blog"
IMAGE_DIR = PROJECT_ROOT / "apps" / "wonder-hub" / "public" / "article-images"


# ── 模型 ──────────────────────────────────────────────────────

class ArticleMeta(BaseModel):
    slug: str
    title: str
    date: str
    category: str
    summary: str
    tags: list[str]
    author: str
    restricted: bool
    filename: str


class ArticleDetail(ArticleMeta):
    content: str  # markdown 正文（不含 frontmatter）


class ArticleCreate(BaseModel):
    title: str
    category: str = "投资理念"
    summary: str = ""
    tags: list[str] = []
    content: str
    slug: Optional[str] = None


class ArticleUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    summary: Optional[str] = None
    tags: Optional[list[str]] = None
    content: Optional[str] = None


# ── 工具函数 ──────────────────────────────────────────────────

def require_admin(user=Depends(get_current_user)):
    """仅允许 admin 角色"""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可操作文章")
    return user


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """解析 --- frontmatter --- 和正文"""
    fm_match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)", text, re.DOTALL)
    if not fm_match:
        return {}, text

    fm_raw = fm_match.group(1)
    content = fm_match.group(2)

    data = {}
    for line in fm_raw.split("\n"):
        if ":" in line:
            key, _, val = line.partition(":")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key == "tags":
                # 解析 [tag1, tag2] 格式
                tags_match = re.findall(r'"([^"]+)"', val)
                data[key] = tags_match
            elif key == "restricted":
                data[key] = val.lower() == "true"
            else:
                data[key] = val
    return data, content


def build_frontmatter(meta: dict) -> str:
    """构建 frontmatter 字符串"""
    lines = ["---"]
    lines.append(f'title: "{meta.get("title", "")}"')
    lines.append(f'slug: "{meta.get("slug", "")}"')
    lines.append(f'date: "{meta.get("date", "")}"')
    lines.append(f'category: "{meta.get("category", "")}"')
    lines.append(f'summary: "{meta.get("summary", "")}"')
    tags_str = ", ".join(f'"{t}"' for t in meta.get("tags", []))
    lines.append(f"tags: [{tags_str}]")
    lines.append(f'author: "{meta.get("author", "WONDER 研究团队")}"')
    if meta.get("restricted"):
        lines.append("restricted: true")
    lines.append("---")
    return "\n".join(lines)


def to_slug(text: str) -> str:
    """生成 URL-safe slug"""
    import unicodedata
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^\w\s-]", "", text).strip().lower()
    text = re.sub(r"[\s_-]+", "-", text)
    if not text:
        text = f"article-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:4]}"
    return text[:80]


# ── 路由 ──────────────────────────────────────────────────────

@router.get("/", response_model=list[ArticleMeta])
async def list_articles(user=Depends(get_current_user)):
    """获取所有文章列表（需登录）"""
    if not BLOG_DIR.exists():
        return []

    articles = []
    for f in sorted(BLOG_DIR.glob("*.md")):
        raw = f.read_text(encoding="utf-8")
        data, _ = parse_frontmatter(raw)
        category = data.get("category", "未分类")
        articles.append(ArticleMeta(
            slug=data.get("slug", f.stem),
            title=data.get("title", "无标题"),
            date=data.get("date", ""),
            category=category,
            summary=data.get("summary", ""),
            tags=data.get("tags", []),
            author=data.get("author", "WONDER 研究团队"),
            restricted=data.get("restricted", False) or category == "客户通讯",
            filename=f.name,
        ))

    articles.sort(key=lambda a: a.date, reverse=True)
    return articles


@router.get("/{slug}", response_model=ArticleDetail)
async def get_article(slug: str, user=Depends(get_current_user)):
    """获取单篇文章详情（需登录）"""
    article_file = _find_article_file(slug)
    if not article_file:
        raise HTTPException(status_code=404, detail="文章不存在")

    raw = article_file.read_text(encoding="utf-8")
    data, content = parse_frontmatter(raw)
    category = data.get("category", "未分类")

    return ArticleDetail(
        slug=data.get("slug", article_file.stem),
        title=data.get("title", "无标题"),
        date=data.get("date", ""),
        category=category,
        summary=data.get("summary", ""),
        tags=data.get("tags", []),
        author=data.get("author", "WONDER 研究团队"),
        restricted=data.get("restricted", False) or category == "客户通讯",
        filename=article_file.name,
        content=content,
    )


@router.post("/", response_model=ArticleMeta)
async def create_article(body: ArticleCreate, user=Depends(require_admin)):
    """新建文章（仅管理员）"""
    slug = body.slug or to_slug(body.title)
    date_str = datetime.now().strftime("%Y-%m-%d")
    restricted = body.category == "客户通讯"

    meta = {
        "title": body.title,
        "slug": slug,
        "date": date_str,
        "category": body.category,
        "summary": body.summary,
        "tags": body.tags,
        "author": "WONDER 研究团队",
        "restricted": restricted,
    }

    fm = build_frontmatter(meta)
    full_content = f"{fm}\n\n{body.content}\n"

    BLOG_DIR.mkdir(parents=True, exist_ok=True)
    filepath = BLOG_DIR / f"{slug}.md"
    if filepath.exists():
        raise HTTPException(status_code=409, detail=f"slug '{slug}' 已存在")

    filepath.write_text(full_content, encoding="utf-8")

    return ArticleMeta(
        slug=slug,
        title=body.title,
        date=date_str,
        category=body.category,
        summary=body.summary,
        tags=body.tags,
        author="WONDER 研究团队",
        restricted=restricted,
        filename=filepath.name,
    )


@router.put("/{slug}", response_model=ArticleMeta)
async def update_article(slug: str, body: ArticleUpdate, user=Depends(require_admin)):
    """修改文章（仅管理员）"""
    article_file = _find_article_file(slug)
    if not article_file:
        raise HTTPException(status_code=404, detail="文章不存在")

    raw = article_file.read_text(encoding="utf-8")
    data, content = parse_frontmatter(raw)

    # 更新字段
    if body.title is not None:
        data["title"] = body.title
    if body.category is not None:
        data["category"] = body.category
    if body.summary is not None:
        data["summary"] = body.summary
    if body.tags is not None:
        data["tags"] = body.tags
    if body.content is not None:
        content = body.content

    data["restricted"] = data.get("category", "") == "客户通讯"
    data.setdefault("slug", slug)
    data.setdefault("author", "WONDER 研究团队")

    fm = build_frontmatter(data)
    full = f"{fm}\n\n{content}\n"
    article_file.write_text(full, encoding="utf-8")

    category = data.get("category", "未分类")
    return ArticleMeta(
        slug=data.get("slug", slug),
        title=data.get("title", ""),
        date=data.get("date", ""),
        category=category,
        summary=data.get("summary", ""),
        tags=data.get("tags", []),
        author=data.get("author", "WONDER 研究团队"),
        restricted=data.get("restricted", False),
        filename=article_file.name,
    )


@router.delete("/{slug}")
async def delete_article(slug: str, user=Depends(require_admin)):
    """删除文章（仅管理员）"""
    article_file = _find_article_file(slug)
    if not article_file:
        raise HTTPException(status_code=404, detail="文章不存在")

    article_file.unlink()

    # 清理关联图片目录
    img_dir = IMAGE_DIR / slug
    if img_dir.exists():
        import shutil
        shutil.rmtree(img_dir, ignore_errors=True)

    return {"message": f"文章 '{slug}' 已删除", "slug": slug}


# ── 内部工具 ──────────────────────────────────────────────────

def _find_article_file(slug: str) -> Optional[Path]:
    """根据 slug 查找对应的 .md 文件"""
    if not BLOG_DIR.exists():
        return None

    # 1. 直接匹配文件名
    direct = BLOG_DIR / f"{slug}.md"
    if direct.exists():
        return direct

    # 2. 遍历所有文件，匹配 frontmatter slug
    for f in BLOG_DIR.glob("*.md"):
        raw = f.read_text(encoding="utf-8")
        data, _ = parse_frontmatter(raw)
        if data.get("slug") == slug:
            return f

    return None
