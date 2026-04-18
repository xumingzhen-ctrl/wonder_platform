import Link from "next/link";
import { getAllSlugs, getPostBySlug } from "@/lib/blog";
import { MDXRemote } from "next-mdx-remote/rsc";
import { notFound } from "next/navigation";

// 用于 Next.js 静态导出：预生成所有文章路径
export async function generateStaticParams() {
  const slugs = getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

// 动态页面 metadata
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: "文章未找到 | WONDER" };
  return {
    title: `${post.title} | WONDER`,
    description: post.summary,
  };
}

// MDX 自定义组件映射（精美排版覆盖默认样式）
const mdxComponents = {
  // 大标题 h2 - 章节分隔
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2
      className="text-3xl font-semibold text-card-foreground mt-16 mb-6 pb-4 border-b border-border/60"
      {...props}
    />
  ),
  // 三级标题
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3
      className="text-2xl font-semibold text-card-foreground mt-10 mb-4"
      {...props}
    />
  ),
  // 高亮引用块 - 对应"WONDER 策略观点"
  blockquote: (props: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="my-8 pl-6 border-l-4 border-primary bg-primary/5 rounded-r-2xl py-5 pr-6 text-foreground/80 italic"
      {...props}
    />
  ),
  // 表格
  table: (props: React.HTMLAttributes<HTMLTableElement>) => (
    <div className="my-8 overflow-x-auto rounded-2xl border border-border">
      <table
        className="w-full text-sm border-collapse"
        {...props}
      />
    </div>
  ),
  th: (props: React.HTMLAttributes<HTMLTableCellElement>) => (
    <th
      className="bg-card/80 px-6 py-3 text-left font-semibold text-card-foreground border-b border-border text-base"
      {...props}
    />
  ),
  td: (props: React.HTMLAttributes<HTMLTableCellElement>) => (
    <td
      className="px-6 py-3 border-b border-border/50 text-foreground/80 text-base"
      {...props}
    />
  ),
  // 段落
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p
      className="text-lg leading-[1.9] text-foreground/85 mb-6"
      {...props}
    />
  ),
  // 列表
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul
      className="my-6 space-y-3 pl-6"
      {...props}
    />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => (
    <li
      className="text-lg text-foreground/80 leading-relaxed list-disc marker:text-primary"
      {...props}
    />
  ),
  // 强调
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold text-card-foreground" {...props} />
  ),
  // 水平分割线
  hr: () => (
    <hr className="my-14 border-border/50" />
  ),
};

export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Sticky top navigation bar */}
      <div className="border-b border-border bg-card/70 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href="/blog"
            className="text-primary hover:text-primary/70 transition-colors text-base font-medium flex items-center gap-2"
          >
            <span>←</span>
            <span>返回研究列表</span>
          </Link>
          <Link
            href="/"
            className="text-foreground/50 hover:text-foreground transition-colors text-sm font-medium"
          >
            WONDER
          </Link>
        </div>
      </div>

      <article className="max-w-4xl mx-auto px-6 pt-16 pb-32">
        {/* Article Header */}
        <header className="mb-16">
          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-8">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="text-sm font-medium px-3 py-1.5 rounded-full bg-primary/10 text-primary"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Title */}
          <h1 className="text-4xl md:text-5xl font-semibold text-card-foreground leading-tight mb-10">
            {post.title}
          </h1>

          {/* Summary */}
          <p className="text-xl text-foreground/70 font-light leading-relaxed mb-10 border-l-4 border-primary/30 pl-6">
            {post.summary}
          </p>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 py-6 border-t border-b border-border text-sm font-mono text-foreground/50">
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block" />
              {post.author}
            </span>
            <span>{post.date.replace(/-/g, " · ")}</span>
            <span>预计阅读 {post.readingTime} 分钟</span>
          </div>
        </header>

        {/* Article Body */}
        <div className="article-body">
          <MDXRemote source={post.content} components={mdxComponents} />
        </div>

        {/* Footer Navigation */}
        <footer className="mt-24 pt-10 border-t border-border flex items-center justify-between">
          <Link
            href="/blog"
            className="flex items-center gap-3 text-primary hover:text-primary/70 text-base font-medium transition-colors"
          >
            <span>←</span>
            <span>返回研究列表</span>
          </Link>
          <Link
            href="/assessment"
            className="flex items-center gap-3 text-foreground/60 hover:text-primary text-base font-medium transition-colors"
          >
            <span>开启财务诊断</span>
            <span>→</span>
          </Link>
        </footer>
      </article>
    </main>
  );
}
