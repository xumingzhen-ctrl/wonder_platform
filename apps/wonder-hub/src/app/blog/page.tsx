import Link from "next/link";
import { getAllPostsMeta } from "@/lib/blog";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "专业洞察 | WONDER",
  description: "WONDER 团队精选的宏观经济、资产配置与财务规划深度研究报告。",
};

export default function BlogIndex() {
  const posts = getAllPostsMeta();

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="text-primary hover:text-primary/70 transition-colors text-base font-medium flex items-center gap-2"
          >
            <span>←</span>
            <span>WONDER</span>
          </Link>
          <span className="text-border">|</span>
          <span className="text-foreground/60 text-base">专业研究</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-20">
        {/* Page Title */}
        <header className="mb-20">
          <p className="text-sm font-mono text-primary mb-4 tracking-widest uppercase">
            Research & Insights
          </p>
          <h1 className="text-5xl md:text-6xl font-semibold tracking-tight mb-6 text-card-foreground">
            专业洞察
          </h1>
          <p className="text-xl text-foreground/70 font-light max-w-2xl leading-relaxed">
            WONDER 团队深度研究报告，涵盖宏观经济走势、全球资产配置逻辑与家庭财富规划实践。
          </p>
        </header>

        {/* Article List */}
        {posts.length === 0 ? (
          <div className="text-center py-24 text-foreground/40">
            <p className="text-2xl mb-2">暂无研报</p>
            <p className="text-base">请将 .md 文件放入 src/content/blog/ 目录</p>
          </div>
        ) : (
          <div className="space-y-6">
            {posts.map((post, idx) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group block p-10 rounded-[2rem] border border-border bg-card/30 hover:bg-card hover:shadow-xl transition-all duration-500 relative overflow-hidden"
              >
                {/* Hover indicator */}
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary scale-y-0 group-hover:scale-y-100 transition-transform duration-300 origin-center rounded-l-full" />

                <div className="flex flex-col md:flex-row md:items-start gap-6">
                  {/* Index Number */}
                  <span className="hidden md:block text-4xl font-light text-foreground/10 font-mono flex-shrink-0 w-16 mt-1">
                    {String(idx + 1).padStart(2, "0")}
                  </span>

                  <div className="flex-1">
                    {/* Tags */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {post.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    {/* Title */}
                    <h2 className="text-2xl md:text-3xl font-semibold text-card-foreground mb-4 group-hover:text-primary transition-colors leading-snug">
                      {post.title}
                    </h2>

                    {/* Summary */}
                    <p className="text-base md:text-lg text-foreground/70 font-light mb-6 leading-relaxed line-clamp-2">
                      {post.summary}
                    </p>

                    {/* Meta */}
                    <div className="flex items-center gap-6 text-sm text-foreground/40 font-mono">
                      <span>{post.date.replace(/-/g, ".")}</span>
                      <span>·</span>
                      <span>{post.author}</span>
                      <span>·</span>
                      <span>预计 {post.readingTime} 分钟阅读</span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="hidden md:flex items-center self-center">
                    <span className="text-foreground/20 group-hover:text-primary group-hover:translate-x-2 transition-all duration-300 text-2xl">
                      →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
