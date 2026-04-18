import fs from "fs";
import path from "path";
import matter from "gray-matter";

// 文章目录位置
const BLOG_DIR = path.join(process.cwd(), "src/content/blog");

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  summary: string;
  tags: string[];
  author: string;
  readingTime: number;
  content: string;
}

export interface BlogPostMeta extends Omit<BlogPost, "content"> {}

/**
 * 计算大概的阅读时间（按每分钟 300 中文字计算）
 */
function calcReadingTime(content: string): number {
  const charCount = content.replace(/\s/g, "").length;
  return Math.max(1, Math.ceil(charCount / 300));
}

/**
 * 从文件内容中提取 slug：
 * 优先使用 frontmatter 中的 slug 字段，其次使用纯ASCII文件名
 * 如果文件名含中文，则使用 frontmatter 中的 slug，或者用文件索引
 */
function extractSlug(filename: string, frontmatterSlug?: string): string {
  if (frontmatterSlug && /^[a-z0-9-_]+$/i.test(frontmatterSlug)) {
    return frontmatterSlug;
  }
  const nameWithoutExt = filename.replace(/\.(mdx?)$/g, "");
  // 如果文件名是纯 ASCII（英文），直接用
  if (/^[\x00-\x7F]+$/.test(nameWithoutExt)) {
    return nameWithoutExt;
  }
  // 中文文件名：用 frontmatterSlug 或生成一个基于文件名的稳定 slug
  if (frontmatterSlug) return frontmatterSlug;
  // 最后降级：用 URL 安全的完整文件名（含中文）
  return nameWithoutExt;
}

/**
 * 建立文件名与 slug 的完整映射关系
 */
function buildSlugMap(): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(BLOG_DIR)) return map;

  const files = fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".md") || f.endsWith(".mdx"));

  for (const filename of files) {
    const raw = fs.readFileSync(path.join(BLOG_DIR, filename), "utf-8");
    const { data } = matter(raw);
    const slug = extractSlug(filename, data.slug);
    map.set(slug, filename);
  }
  return map;
}

/**
 * 获取所有文章的元数据（不含正文内容），用于文章列表页
 */
export function getAllPostsMeta(): BlogPostMeta[] {
  if (!fs.existsSync(BLOG_DIR)) return [];

  const files = fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".md") || f.endsWith(".mdx"));

  const posts = files.map((filename) => {
    const raw = fs.readFileSync(path.join(BLOG_DIR, filename), "utf-8");
    const { data, content } = matter(raw);
    const slug = extractSlug(filename, data.slug);

    return {
      slug,
      title: data.title || "无标题",
      date: data.date || "2026-01-01",
      summary: data.summary || content.slice(0, 120) + "...",
      tags: data.tags || [],
      author: data.author || "WONDER 研究团队",
      readingTime: calcReadingTime(content),
    } as BlogPostMeta;
  });

  return posts.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * 根据 slug 获取单篇文章的完整内容
 */
export function getPostBySlug(slug: string): BlogPost | null {
  const decodedSlug = decodeURIComponent(slug);
  const slugMap = buildSlugMap();

  // 优先通过 slug map 查找对应文件名
  const filename = slugMap.get(decodedSlug) || slugMap.get(slug);

  if (!filename) return null;

  const filePath = path.join(BLOG_DIR, filename);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);

  return {
    slug: decodedSlug,
    title: data.title || "无标题",
    date: data.date || "2026-01-01",
    summary: data.summary || content.slice(0, 120) + "...",
    tags: data.tags || [],
    author: data.author || "WONDER 研究团队",
    readingTime: calcReadingTime(content),
    content,
  };
}

/**
 * 获取所有 slug，用于 Next.js generateStaticParams
 */
export function getAllSlugs(): string[] {
  if (!fs.existsSync(BLOG_DIR)) return [];

  const files = fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".md") || f.endsWith(".mdx"));

  return files.map((filename) => {
    const raw = fs.readFileSync(path.join(BLOG_DIR, filename), "utf-8");
    const { data } = matter(raw);
    return extractSlug(filename, data.slug);
  });
}
