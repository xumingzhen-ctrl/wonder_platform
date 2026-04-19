"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { BlogPostMeta } from "@/lib/blog";
import { cn } from "@/lib/utils";

export function BlogList({ posts }: { posts: BlogPostMeta[] }) {
  const [activeCategory, setActiveCategory] = useState<string>("全部");

  const categories = useMemo(() => {
    const cats = new Set(posts.map((post) => post.category).filter(Boolean));
    return ["全部", ...Array.from(cats)];
  }, [posts]);

  const filteredPosts = useMemo(() => {
    if (activeCategory === "全部") return posts;
    return posts.filter((post) => post.category === activeCategory);
  }, [posts, activeCategory]);

  return (
    <div>
      {/* Categories Filter */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-3 mb-12">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 border",
                activeCategory === cat
                  ? "bg-primary text-primary-foreground border-primary shadow-md"
                  : "bg-card/30 text-foreground/70 border-border hover:bg-card hover:text-foreground"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Article List */}
      {filteredPosts.length === 0 ? (
        <div className="text-center py-24 text-foreground/40 border border-dashed border-border rounded-3xl">
          <p className="text-2xl mb-2">暂无该分类下的文章</p>
          <p className="text-base">敬请期待更多内容更新</p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredPosts.map((post, idx) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group block p-8 md:p-10 rounded-[2rem] border border-border bg-card/30 hover:bg-card hover:shadow-xl transition-all duration-500 relative overflow-hidden"
            >
              {/* Hover indicator */}
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary scale-y-0 group-hover:scale-y-100 transition-transform duration-300 origin-center rounded-l-full" />

              <div className="flex flex-col md:flex-row md:items-start gap-6">
                {/* Index Number */}
                <span className="hidden md:block text-4xl font-light text-foreground/10 font-mono flex-shrink-0 w-16 mt-1">
                  {String(idx + 1).padStart(2, "0")}
                </span>

                <div className="flex-1">
                  {/* Category & Tags */}
                  <div className="flex flex-wrap gap-2 mb-4 items-center">
                    {post.category && post.category !== "未分类" && (
                      <span className="text-xs font-semibold px-3 py-1 rounded-full bg-primary text-primary-foreground">
                        {post.category}
                      </span>
                    )}
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
                  <div className="flex flex-wrap items-center gap-4 text-sm text-foreground/40 font-mono">
                    <span>{post.date.replace(/-/g, ".")}</span>
                    <span className="hidden md:inline">·</span>
                    <span>{post.author}</span>
                    <span className="hidden md:inline">·</span>
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
  );
}
