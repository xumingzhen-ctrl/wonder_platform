"use client"

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const features = [
  { title: "投资思维与感悟", desc: "聊资产配置、市场认知与家庭财富规划。", link: "/blog" },
  { title: "财富诊断", desc: "问卷评估、家庭财务体检与现金流推演三合一诊断中心。", link: "/assessment" },
  { title: "FIS 沙盘", desc: "独立资产管理与 PortfolioHub 模拟系统。", link: "http://fis.wonderwisdom.online" },
  { title: "行政中枢", desc: "企业/家族办公室后台管理与 B 端系统。", link: "http://company.wonderwisdom.online" },
  { title: "香港投资移民", desc: "New CIES 专题：资格评估、ILI投资方案与顾问预约。", link: "/immigration" },
];

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center min-h-screen bg-background text-foreground relative overflow-hidden">
      {/* 双光晕背景：左下香槟金 + 右上品牌蓝 */}
      <div
        aria-hidden="true"
        className="pointer-events-none -z-10 absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 900px 700px at 15% 90%, rgba(184,146,74,0.07) 0%, transparent 70%),
            radial-gradient(ellipse 700px 900px at 90% 5%, rgba(37,99,168,0.06) 0%, transparent 70%),
            radial-gradient(ellipse 600px 400px at 50% 40%, rgba(37,99,168,0.04) 0%, transparent 70%)
          `
        }}
      />

      {/* ── Hero 区域 ── */}
      <section className="container max-w-5xl mx-auto px-6 py-24 flex flex-col items-center text-center space-y-10 z-10">

        {/* Step 1: 小标志/期号行（最先出现，定调编辑感） */}
        <p
          className="font-sans text-xs tracking-[0.25em] uppercase text-foreground/40"
          style={{ animation: "wonder-fade-up 0.6s 0s ease-out both" }}
        >
          WONDER · 私人财富管理智库
        </p>

        {/* Step 2: H1 主标题 */}
        <h1
          className="font-display text-5xl sm:text-6xl md:text-8xl font-semibold tracking-tight leading-[1.08]"
          style={{
            animation: "wonder-fade-up 0.7s 0.15s ease-out both",
            background: "linear-gradient(135deg, #1a1a1a 0%, #1a1a1a 55%, #b8924a 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          重塑您的私人财富体系
        </h1>

        {/* Step 3: 副标题 */}
        <p
          className="font-sans text-xl md:text-2xl text-foreground/60 font-light leading-relaxed max-w-2xl"
          style={{ animation: "wonder-fade-up 0.6s 0.3s ease-out both" }}
        >
          专注于高净值个人与家庭的综合财富管理智库。深度专业研究、定制化财务诊断与未来现金流推演。
        </p>

        {/* 装饰性分割线 */}
        <div
          className="w-16 h-[1px] bg-foreground/20"
          style={{ animation: "wonder-fade-up 0.5s 0.4s ease-out both" }}
        />

        {/* Step 4: CTA 按钮组 */}
        <div
          className="flex flex-col w-full px-4 sm:px-0 sm:flex-row items-center justify-center gap-4"
          style={{ animation: "wonder-fade-up 0.6s 0.5s ease-out both" }}
        >
          <Link
            href="/assessment"
            className={cn(
              buttonVariants({ size: "lg" }),
              "w-full sm:w-auto h-14 px-10 rounded-2xl bg-primary text-primary-foreground hover:opacity-90 text-base font-medium shadow-sm transition-all duration-300"
            )}
          >
            开启专属财务诊断
          </Link>
          <Link
            href="/blog"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "w-full sm:w-auto h-14 px-10 rounded-2xl border-border bg-card/40 hover:bg-card text-foreground backdrop-blur-md text-base font-medium transition-all duration-300"
            )}
          >
            投资思维与感悟
          </Link>
        </div>
      </section>

      {/* ── Step 5: 功能卡片（交错入场，手机端横向滑动） ── */}
      <section className="w-full max-w-[1400px] mx-auto px-6 flex overflow-x-auto md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 pb-32 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {features.map((item, idx) => (
          <Link
            href={item.link}
            target={item.link.startsWith("http") ? "_blank" : undefined}
            key={idx}
            className="group relative flex-none w-[85vw] sm:w-[320px] md:w-auto snap-center p-8 rounded-[2rem] border border-border bg-card/35 backdrop-blur-sm hover:shadow-xl hover:bg-card/60 hover:-translate-y-1 transition-all duration-500 overflow-hidden"
            style={{ animation: `wonder-fade-up 0.6s ${0.65 + idx * 0.08}s ease-out both` }}
          >
            {/* Hover 光晕 */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            {/* 右上角装饰性序号 */}
            <span className="absolute top-6 right-7 font-sans text-xs text-foreground/15 tabular-nums">
              {String(idx + 1).padStart(2, "0")}
            </span>
            <h3 className="font-display text-2xl font-semibold mb-3 text-card-foreground leading-tight">
              {item.title}
            </h3>
            <p className="font-sans text-sm text-foreground/60 font-light leading-relaxed">
              {item.desc}
            </p>
          </Link>
        ))}
      </section>

      {/* 入场动画 keyframes（CSS-only，无依赖） */}
      <style>{`
        @keyframes wonder-fade-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  );
}
