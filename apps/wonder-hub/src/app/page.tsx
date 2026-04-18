"use client"

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center min-h-screen bg-background text-foreground relative overflow-hidden">
      {/* Soft Solarized Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none -z-10" />

      <section className="container max-w-5xl mx-auto px-6 py-24 flex flex-col items-center text-center space-y-10 z-10">
        <h1 className="text-6xl md:text-8xl font-semibold tracking-tight text-card-foreground">
          重塑您的私人财富体系
        </h1>
        <p className="text-xl md:text-2xl text-foreground font-light leading-relaxed max-w-3xl">
          WONDER 是专注于高净值个人与家庭的综合财富管理智库。我们提供深度的专业研究、定制化财务诊断与未来现金流推演系统。
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-6 pt-10">
          <Link 
            href="/assessment" 
            className={cn(buttonVariants({ size: "lg" }), "h-16 px-10 rounded-2xl bg-primary text-primary-foreground hover:opacity-90 text-lg font-medium shadow-sm flex items-center justify-center")}
          >
            开启专属财务诊断
          </Link>
          <Link 
            href="/blog" 
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-16 px-10 rounded-2xl border-border bg-card/50 hover:bg-card text-foreground backdrop-blur-md text-lg font-medium flex items-center justify-center")}
          >
            阅读专业洞察
          </Link>
        </div>
      </section>

      {/* Feature Navigation Grid */}
      <section className="w-full max-w-[1400px] mx-auto px-6 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 pb-32">
        {[
          { title: "專業研究", desc: "前沿的宏觀經濟與資產配置文章。", link: "/blog" },
          { title: "健康診斷", desc: "評估您的家庭資產負債與收支風險。", link: "/assessment#diagnostic" },
          { title: "組合推演", desc: "基於複利與現金流折現的長期預測。", link: "/assessment#simulation" },
          { title: "企業保障", desc: "雇員補償、MPF 及團體醫療方案詢價。", link: "/insurance" },
          { title: "FIS 系統", desc: "獨立資產管理與沙盤推演系統(PortfolioHub)。", link: "http://localhost:5175" },
        ].map((item, idx) => (
          <Link href={item.link} target={item.link.startsWith('http') ? '_blank' : undefined} key={idx} className="group relative p-8 rounded-[2rem] border border-border bg-card/40 backdrop-blur-sm hover:shadow-xl hover:bg-card transition-all duration-500 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <h3 className="text-2xl font-semibold mb-3 text-card-foreground">{item.title}</h3>
            <p className="text-base text-foreground/80 font-light leading-relaxed">{item.desc}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
