import Link from "next/link";
import { getAllPostsMeta } from "@/lib/blog";
import { BlogList } from "./blog-list";

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
        <header className="mb-16">
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

        {/* Dynamic Client List */}
        <BlogList posts={posts} />
      </div>
    </main>
  );
}
