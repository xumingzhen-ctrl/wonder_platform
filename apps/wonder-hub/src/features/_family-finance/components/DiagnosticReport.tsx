"use client";

import type { DiagnosticResult, AlertType } from "../types";
import { formatCurrency, formatPercent } from "../calculator";
import { MiniPieChart, BarChart, MetricCard, Tag, Section } from "./Charts";

const ALERT_LABELS: Record<AlertType, { label: string; desc: string; color: "red" | "amber" | "blue" | "green" }> = {
  应急现金不足: { label: "⚠ 应急现金不足", desc: "流动资产可支撑月数不足 6 个月", color: "red" },
  被动现金流偏弱: { label: "⚠ 被动现金流偏弱", desc: "被动收入覆盖支出比例低于 30%", color: "amber" },
  保障存在缺口: { label: "⚠ 保障存在缺口", desc: "人寿+重疾保额低于年支出×10", color: "amber" },
  负债率偏高: { label: "⚠ 负债率偏高", desc: "总负债超过总资产的 50%", color: "red" },
};

interface Props {
  result: DiagnosticResult;
  baseCurrency: string;
}

export function DiagnosticReport({ result, baseCurrency }: Props) {
  const fmt = (v: number) => formatCurrency(v, baseCurrency, true);

  const hasAlerts = result.alerts.length > 0;
  const hasData = result.totalAssets > 0 || result.totalLiabilities > 0 || result.totalMonthlyExpense > 0;

  if (!hasData) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
        <p className="text-lg mb-2">暂无数据</p>
        <p className="text-sm">请先在左侧录入资产、负债和支出信息，报告将自动生成。</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── 诊断摘要 ── */}
      <div className="rounded-2xl border border-border bg-card/50 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg text-card-foreground">诊断摘要</h3>
          {hasAlerts ? (
            <Tag label={`${result.alerts.length} 项需关注`} color="amber" />
          ) : (
            <Tag label="整体较稳健" color="green" />
          )}
        </div>

        {/* 预警 */}
        {hasAlerts && (
          <div className="space-y-2">
            {result.alerts.map((alert) => {
              const info = ALERT_LABELS[alert];
              return (
                <div key={alert} className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-800">{info.label}</p>
                    <p className="text-xs text-amber-600">{info.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 核心指标 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MetricCard label="总资产" value={fmt(result.totalAssets)} big />
          <MetricCard label="总负债" value={fmt(result.totalLiabilities)} big />
          <MetricCard
            label="净资产"
            value={fmt(result.netWorth)}
            big
            status={result.netWorth >= 0 ? "ok" : "bad"}
          />
          <MetricCard label="月被动收入" value={fmt(result.totalPassiveCashflow)} />
          <MetricCard label="月总支出" value={fmt(result.totalMonthlyExpense)} />
          <MetricCard
            label="月度结余"
            value={fmt(result.monthlyBalance)}
            status={result.monthlyBalance >= 0 ? "ok" : "bad"}
          />
        </div>
      </div>

      {/* ── 应急能力 ── */}
      <Section title="应急能力" icon={<span>🔋</span>} defaultOpen>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
          <MetricCard
            label="流动资产"
            value={fmt(result.liquidAssets)}
            sub="现金+股票+基金"
          />
          <MetricCard
            label="可支撑月数"
            value={result.totalMonthlyExpense > 0 ? `${result.survivableMonths.toFixed(1)} 个月` : "—"}
            sub="建议 ≥ 6 个月"
            status={result.survivableMonths >= 6 ? "ok" : result.survivableMonths >= 3 ? "warn" : "bad"}
          />
          <MetricCard
            label="负债率"
            value={result.totalAssets > 0 ? formatPercent(result.debtRatio) : "—"}
            sub="建议 ≤ 50%"
            status={result.debtRatio <= 0.3 ? "ok" : result.debtRatio <= 0.5 ? "warn" : "bad"}
          />
          <MetricCard
            label="房产占比"
            value={result.totalAssets > 0 ? formatPercent(result.realEstateRatio) : "—"}
            sub="重资产参考"
          />
          <MetricCard
            label="风险资产占比"
            value={result.totalAssets > 0 ? formatPercent(result.riskAssetRatio) : "—"}
            sub="股票+基金+股权"
          />
        </div>
      </Section>

      {/* ── 收支分析 ── */}
      <Section title="收支分析" icon={<span>📊</span>} defaultOpen>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
          <MetricCard
            label="被动覆盖率"
            value={result.totalMonthlyExpense > 0 ? formatPercent(result.passiveCoverageRatio) : "—"}
            sub="被动收入/总支出"
            status={result.passiveCoverageRatio >= 1 ? "ok" : result.passiveCoverageRatio >= 0.5 ? "warn" : "bad"}
          />
          <MetricCard
            label="房贷月供占比"
            value={result.totalMonthlyExpense > 0 ? formatPercent(result.mortgageRatio) : "—"}
            sub="建议 ≤ 40%"
            status={result.mortgageRatio <= 0.3 ? "ok" : result.mortgageRatio <= 0.4 ? "warn" : "bad"}
          />
          <MetricCard
            label="保费占比"
            value={result.totalMonthlyExpense > 0 ? formatPercent(result.insuranceRatio) : "—"}
            sub="建议 5%~10%"
            status={result.insuranceRatio >= 0.05 && result.insuranceRatio <= 0.1 ? "ok" : "warn"}
          />
        </div>
      </Section>

      {/* ── 保障分析 ── */}
      <Section title="保障分析" icon={<span>🛡️</span>} defaultOpen>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
          <MetricCard
            label="人寿+重疾保额"
            value={fmt(result.protectionTotal)}
          />
          <MetricCard
            label="建议保额"
            value={fmt(result.totalMonthlyExpense * 12 * 10)}
            sub="年必要支出 × 10 倍"
          />
          <MetricCard
            label="保障缺口"
            value={result.protectionGap > 0 ? fmt(result.protectionGap) : "无缺口"}
            status={result.protectionGap <= 0 ? "ok" : "bad"}
          />
        </div>
      </Section>

      {/* ── 可视化图表 ── */}
      <Section title="图表分析" icon={<span>📐</span>} defaultOpen={false}>
        <div className="grid sm:grid-cols-2 gap-8 pt-4">

          {result.assetBreakdown.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-card-foreground text-center">资产分布</p>
              <div className="flex justify-center">
                <MiniPieChart data={result.assetBreakdown} size={140} />
              </div>
            </div>
          )}

          {result.expenseBreakdown.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-card-foreground text-center">支出结构</p>
              <div className="flex justify-center">
                <MiniPieChart data={result.expenseBreakdown} size={140} />
              </div>
            </div>
          )}

          {result.cashflowBreakdown.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-card-foreground text-center">被动现金流结构</p>
              <div className="flex justify-center">
                <MiniPieChart data={result.cashflowBreakdown} size={140} />
              </div>
            </div>
          )}

          {result.insuranceBreakdown.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-card-foreground text-center">保障结构</p>
              <div className="flex justify-center">
                <MiniPieChart data={result.insuranceBreakdown} size={140} />
              </div>
            </div>
          )}

          {result.memberNetWorth.length > 0 && (
            <div className="space-y-3 sm:col-span-2">
              <p className="text-sm font-medium text-card-foreground text-center">成员净值</p>
              <BarChart
                data={result.memberNetWorth.map((m) => ({ name: m.name, value: m.net }))}
                formatValue={(v) => formatCurrency(v, "CNY", true)}
              />
            </div>
          )}
        </div>
      </Section>

      {/* ── 版权 ── */}
      <p className="text-center text-xs text-muted-foreground pt-2">
        Wonder 出品 · Wonder 尊享客户专属工具 · 数据仅保存在您的设备本地
      </p>
    </div>
  );
}
