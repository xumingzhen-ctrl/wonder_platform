import Link from "next/link";
import { getAllPostsMeta } from "@/lib/blog";
import { BlogList } from "./blog-list";

export const metadata = {
  title: "投资思维 | WONDER",
  description: "分享投资路上的思考与感悟，涵盖资产配置理念、市场认知与家庭财富规划心得。",
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
          <span className="text-foreground/60 text-base">投资思维与感悟</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-20">
        {/* Page Title */}
        <header className="mb-16">
          <p className="text-sm font-mono text-primary mb-4 tracking-widest uppercase">
            Investment Thinking & Insights
          </p>
          <h1 className="text-5xl md:text-6xl font-semibold tracking-tight mb-6 text-card-foreground">
            投资思维与感悟
          </h1>
          <p className="text-xl text-foreground/70 font-light max-w-2xl leading-relaxed">
            分享投资路上的真实思考，聊资产配置、市场认知与家庭财富规划——用普通人能听懂的语言。
          </p>
        </header>

        {/* Dynamic Client List */}
        <BlogList posts={posts} />
      </div>
    </main>
  );
}
