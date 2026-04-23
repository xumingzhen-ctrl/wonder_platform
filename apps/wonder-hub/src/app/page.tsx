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
            投资思维与感悟
          </Link>
        </div>
      </section>

      {/* Feature Navigation Grid */}
      <section className="w-full max-w-[1400px] mx-auto px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 pb-32">
        {[
          { title: "投资思维与感悟", desc: "聊资产配置、市场认知与家庭财富规划。", link: "/blog" },
          { title: "财富诊断", desc: "家庭资产健康评估与现金流推演。", link: "/assessment" },
          { title: "FIS 沙盘", desc: "独立资产管理与 PortfolioHub 模拟系统。", link: "http://fis.wonderwisdom.online" },
          { title: "行政中枢", desc: "企业/家族办公室后台管理与 B 端系统。", link: "http://company.wonderwisdom.online" },
        ].map((item, idx) => (
          <Link href={item.link} target={item.link.startsWith('http') ? '_blank' : undefined} key={idx} className="group relative p-10 rounded-[2.5rem] border border-border bg-card/40 backdrop-blur-sm hover:shadow-2xl hover:bg-card transition-all duration-500 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <h3 className="text-3xl font-semibold mb-4 text-card-foreground">{item.title}</h3>
            <p className="text-lg text-foreground/80 font-light leading-relaxed">{item.desc}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
