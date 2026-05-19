"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// ── 迷你饼图（纯 SVG，无依赖） ────────────────────────────────
interface PieSlice {
  name: string;
  value: number;
  color: string;
}

export function MiniPieChart({
  data,
  size = 120,
}: {
  data: PieSlice[];
  size?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0)
    return (
      <div
        className="rounded-full bg-border flex items-center justify-center text-xs text-muted-foreground"
        style={{ width: size, height: size }}
      >
        暂无数据
      </div>
    );

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;

  let cumAngle = -Math.PI / 2;
  const slices: { d: string; color: string; name: string; pct: number }[] = [];

  for (const slice of data) {
    if (slice.value <= 0) continue;
    const angle = (slice.value / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(cumAngle);
    const y1 = cy + r * Math.sin(cumAngle);
    const x2 = cx + r * Math.cos(cumAngle + angle);
    const y2 = cy + r * Math.sin(cumAngle + angle);
    const largeArc = angle > Math.PI ? 1 : 0;
    slices.push({
      d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      color: slice.color,
      name: slice.name,
      pct: (slice.value / total) * 100,
    });
    cumAngle += angle;
  }

  return (
    <div className="flex flex-col gap-3 items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((s, i) => (
          <path key={i} d={s.d} fill={s.color} stroke="var(--card)" strokeWidth={1.5} />
        ))}
        {/* 中心镂空 */}
        <circle cx={cx} cy={cy} r={r * 0.45} fill="var(--card)" />
      </svg>
      {/* 图例 */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center max-w-[200px]">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-1 text-xs text-muted-foreground">
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: s.color }}
            />
            {s.name} {s.pct.toFixed(0)}%
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 横向条形图（成员净值） ─────────────────────────────────────
export function BarChart({
  data,
  formatValue,
}: {
  data: { name: string; value: number }[];
  formatValue: (v: number) => string;
}) {
  if (data.length === 0)
    return <p className="text-sm text-muted-foreground">暂无成员数据</p>;
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);

  return (
    <div className="flex flex-col gap-2 w-full">
      {data.map((d, i) => {
        const isNeg = d.value < 0;
        const pct = (Math.abs(d.value) / max) * 100;
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-14 text-right shrink-0">
              {d.name}
            </span>
            <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${pct}%`,
                  backgroundColor: isNeg ? "#ef4444" : "#2563a8",
                }}
              />
            </div>
            <span
              className={cn(
                "text-xs tabular-nums w-28 shrink-0",
                isNeg ? "text-red-500" : "text-foreground"
              )}
            >
              {formatValue(d.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Section 容器 ──────────────────────────────────────────────
export function Section({
  title,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-border bg-card/50 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-6 py-4 text-left hover:bg-muted/30 transition-colors"
      >
        <span className="text-primary">{icon}</span>
        <span className="font-display font-semibold text-lg text-card-foreground">
          {title}
        </span>
        <span className="ml-auto text-muted-foreground text-sm">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
}

// ── 指标卡 ────────────────────────────────────────────────────
export function MetricCard({
  label,
  value,
  sub,
  status,
  big,
}: {
  label: string;
  value: string;
  sub?: string;
  status?: "ok" | "warn" | "bad" | "neutral";
  big?: boolean;
}) {
  const statusColors = {
    ok: "text-emerald-600",
    warn: "text-amber-500",
    bad: "text-red-500",
    neutral: "text-foreground",
  };
  return (
    <div className="p-4 rounded-xl bg-background/60 border border-border flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "font-semibold tabular-nums",
          big ? "text-xl" : "text-base",
          status ? statusColors[status] : "text-card-foreground"
        )}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── 行内标签 ──────────────────────────────────────────────────
export function Tag({
  label,
  color,
}: {
  label: string;
  color: "red" | "amber" | "blue" | "green";
}) {
  const colors = {
    red: "bg-red-100 text-red-700 border-red-200",
    amber: "bg-amber-100 text-amber-700 border-amber-200",
    blue: "bg-blue-100 text-blue-700 border-blue-200",
    green: "bg-emerald-100 text-emerald-700 border-emerald-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
        colors[color]
      )}
    >
      {label}
    </span>
  );
}

// ── 空状态 ────────────────────────────────────────────────────
export function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-center py-6 text-muted-foreground text-sm">{label}</div>
  );
}
