"use client";

import { useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 懒加载家庭财务体检工具（避免影响首屏）
import dynamic from "next/dynamic";
const FamilyFinanceTool = dynamic(
  () => import("@/app/family-finance/page").then(m => ({ default: m.default })),
  { loading: () => <div style={{ padding: "60px", textAlign: "center", color: "#6e6251", fontFamily: "Inter,sans-serif" }}>加载中…</div>, ssr: false }
);

type Mode = "home" | "finance";

export default function AssessmentIndex() {
  const [mode, setMode] = useState<Mode>("home");

  // 嵌入家庭财务体检工具
  if (mode === "finance") {
    return (
      <div>
        {/* 返回按钮条 */}
        <div style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "rgba(248,239,223,0.95)", backdropFilter: "blur(8px)",
          borderBottom: "1px solid #dfcfad", padding: "10px 20px",
          display: "flex", alignItems: "center", gap: 16,
        }}>
          <button
            onClick={() => setMode("home")}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "none", border: "1px solid #dfcfad",
              borderRadius: 8, padding: "8px 14px", cursor: "pointer",
              color: "#0a1f3b", fontSize: 14, fontFamily: "Inter,sans-serif",
            }}
          >
            ← 返回诊断中心
          </button>
          <span style={{ fontSize: 13, color: "#6e6251", fontFamily: "Inter,sans-serif" }}>
            WONDER 智能诊断 · 家庭财务体检
          </span>
        </div>
        <FamilyFinanceTool />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground px-6 py-24">
      <div className="max-w-6xl mx-auto">
        <header className="mb-20 text-center">
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "link" }), "px-0 text-primary hover:text-primary/70 mb-10 text-xl font-medium inline-flex")}
          >
            &larr; 返回首页
          </Link>
          <h1 className="text-5xl md:text-7xl font-semibold tracking-tight mb-6 text-card-foreground">
            WONDER 智能诊断与推演
          </h1>
          <p className="text-2xl text-foreground font-light max-w-3xl mx-auto leading-relaxed">
            请选择您需要的财务服务级别。为了确保准确性，推演系统依赖于您真实的财务数据输入。
          </p>
        </header>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Card 1: 家庭健康诊断（问卷）*/}
          <div className="p-10 rounded-[2.5rem] border border-border bg-card/50 flex flex-col items-start relative overflow-hidden hover:shadow-xl hover:bg-card transition-all duration-500">
            <div className="mb-8 inline-flex p-4 rounded-2xl bg-primary/10">
              <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h2 className="text-3xl font-semibold mb-4 text-card-foreground">家庭健康诊断</h2>
            <p className="text-lg text-foreground/80 font-light mb-8 flex-1 leading-relaxed">
              通过标准的财务问卷，评估您的资产负债表与收支流水。我们将出具一份基础的健康风险报告，帮您查漏补缺。
            </p>
            <Link
              href="/assessment/questionnaire"
              className="w-full h-14 rounded-2xl bg-primary text-primary-foreground hover:opacity-90 text-lg font-medium shadow-sm flex items-center justify-center"
            >
              开始评估问卷
            </Link>
          </div>

          {/* Card 2: 家庭财务体检（嵌入式工具）*/}
          <div className="p-10 rounded-[2.5rem] border border-amber-200/60 bg-gradient-to-b from-amber-50/80 to-transparent flex flex-col items-start relative overflow-hidden hover:shadow-xl hover:bg-amber-50/60 transition-all duration-500">
            {/* 推荐标签 */}
            <div className="absolute top-5 right-5 text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
              精细诊断
            </div>
            <div className="mb-8 inline-flex p-4 rounded-2xl bg-amber-100">
              <svg className="w-8 h-8 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h2 className="text-3xl font-semibold mb-4 text-card-foreground">家庭财务体检</h2>
            <p className="text-lg text-foreground/80 font-light mb-8 flex-1 leading-relaxed">
              逐项录入资产、负债、被动现金流、月度支出与保障保险，系统实时计算财务指标并生成专属诊断报告。
            </p>
            <button
              onClick={() => setMode("finance")}
              className="w-full h-14 rounded-2xl bg-amber-600 text-white hover:bg-amber-700 text-lg font-medium shadow-sm flex items-center justify-center transition-colors"
            >
              开始财务体检
            </button>
          </div>

          {/* Card 3: FIS 沙盘 */}
          <div className="p-10 rounded-[2.5rem] border border-primary/20 bg-gradient-to-b from-primary/5 to-transparent flex flex-col items-start relative overflow-hidden hover:shadow-xl hover:bg-card transition-all duration-500">
            <div className="mb-8 inline-flex p-4 rounded-2xl bg-primary/20">
              <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </div>
            <h2 className="text-3xl font-semibold mb-4 text-card-foreground">投资组合与现金流推演</h2>
            <p className="text-lg text-foreground font-light mb-8 flex-1 leading-relaxed">
              高阶服务。设定未来的收益预期、通胀率与提取计划，利用金融数学模型为您推演未来 30 年的财富增长趋势。
            </p>
            <a
              href="http://fis.wonderwisdom.online"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full h-14 rounded-2xl border-primary/30 text-primary hover:bg-primary/5 text-lg font-medium shadow-sm flex items-center justify-center")}
            >
              进入深度沙盘系统
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
