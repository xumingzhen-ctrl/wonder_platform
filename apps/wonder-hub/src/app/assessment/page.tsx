"use client"

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AssessmentIndex() {
  return (
    <main className="min-h-screen bg-background text-foreground px-6 py-24">
      <div className="max-w-5xl mx-auto">
        <header className="mb-20 text-center">
          <Link 
            href="/" 
            className={cn(buttonVariants({ variant: "link" }), "px-0 text-primary hover:text-primary/70 mb-10 text-xl font-medium inline-flex")}
          >
            &larr; 返回首页
          </Link>
          <h1 className="text-5xl md:text-7xl font-semibold tracking-tight mb-6 text-card-foreground">WONDER 智能诊断与推演</h1>
          <p className="text-2xl text-foreground font-light max-w-3xl mx-auto leading-relaxed">
            请选择您需要的财务服务级别。为了确保准确性，推演系统依赖于您真实的财务数据输入。
          </p>
        </header>

        <div className="grid md:grid-cols-2 gap-12">
          {/* Diagnostic Card */}
          <div className="p-12 rounded-[2.5rem] border border-border bg-card/50 flex flex-col items-start relative overflow-hidden hover:shadow-xl hover:bg-card transition-all duration-500">
            <div className="mb-8 inline-flex p-4 rounded-2xl bg-primary/10">
              <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h2 className="text-4xl font-semibold mb-6 text-card-foreground">家庭健康诊断</h2>
            <p className="text-xl text-foreground/80 font-light mb-10 flex-1 leading-relaxed">
              通过标准的财务问卷，评估您的资产负债表与收支流水。我们将出具一份基础的健康风险报告，帮您查漏补缺。
            </p>
            <Button size="lg" className="w-full h-16 rounded-2xl bg-primary text-primary-foreground hover:opacity-90 text-xl font-medium shadow-sm">
              开始评估问卷
            </Button>
          </div>

          {/* Simulation Card */}
          <div className="p-12 rounded-[2.5rem] border border-primary/20 bg-gradient-to-b from-primary/5 to-transparent flex flex-col items-start relative overflow-hidden hover:shadow-xl hover:bg-card transition-all duration-500">
            <div className="mb-8 inline-flex p-4 rounded-2xl bg-primary/20">
              <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </div>
            <h2 className="text-4xl font-semibold mb-6 text-card-foreground">投资组合与现金流推演</h2>
            <p className="text-xl text-foreground font-light mb-10 flex-1 leading-relaxed">
              高阶服务。设定未来的收益预期、通胀率与提取计划，利用金融数学模型为您推演未来 30 年的财富增长趋势。
            </p>
            <a 
              href="http://localhost:5175" 
              target="_blank" 
              rel="noopener noreferrer" 
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full h-16 rounded-2xl border-primary/30 text-primary hover:bg-primary/5 text-xl font-medium shadow-sm flex items-center justify-center")}
            >
              进入深度沙盘系统
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
