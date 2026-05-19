import type { FamilyFinanceState } from "./types";

// ── 导出 Markdown ─────────────────────────────────────────────
export function exportToMarkdown(state: FamilyFinanceState): string {
  const date = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // 人类可读部分
  const humanPart = `# Wonder 家庭财务健康报告

**家庭名称**：${state.familyName}
**基准货币**：${state.baseCurrency}
**导出日期**：${date}
**出品**：Wonder · 私人财富管理智库

---

## 家庭成员

| 姓名 | 关系 |
|------|------|
${state.members.map((m) => `| ${m.name} | ${m.customRelation || m.relation} |`).join("\n")}

## 资产明细

| 归属 | 类别 | 名称 | 金额 | 货币 |
|------|------|------|------|------|
${state.assets
  .map((a) => {
    const member = state.members.find((m) => m.id === a.memberId);
    return `| ${member?.name ?? "家庭共有"} | ${a.category} | ${a.name} | ${a.amount.toLocaleString()} | ${a.currency} |`;
  })
  .join("\n")}

## 负债明细

| 归属 | 类别 | 名称 | 本金 | 货币 |
|------|------|------|------|------|
${state.liabilities
  .map((l) => {
    const member = state.members.find((m) => m.id === l.memberId);
    return `| ${member?.name ?? "家庭共有"} | ${l.category} | ${l.name} | ${l.amount.toLocaleString()} | ${l.currency} |`;
  })
  .join("\n")}

## 被动现金流

| 归属 | 类别 | 名称 | 月金额 | 货币 |
|------|------|------|--------|------|
${state.cashflows
  .map((c) => {
    const member = state.members.find((m) => m.id === c.memberId);
    return `| ${member?.name ?? "家庭共有"} | ${c.category} | ${c.name} | ${c.monthlyAmount.toLocaleString()} | ${c.currency} |`;
  })
  .join("\n")}

## 月度支出

| 归属 | 类别 | 名称 | 月支出 | 货币 |
|------|------|------|--------|------|
${state.expenses
  .map((e) => {
    const member = state.members.find((m) => m.id === e.memberId);
    return `| ${member?.name ?? "家庭共有"} | ${e.category} | ${e.name} | ${e.monthlyAmount.toLocaleString()} | ${e.currency} |`;
  })
  .join("\n")}

## 保障保险

| 归属 | 类别 | 名称 | 保额 | 货币 |
|------|------|------|------|------|
${state.insurances
  .map((i) => {
    const member = state.members.find((m) => m.id === i.memberId);
    return `| ${member?.name ?? "家庭共有"} | ${i.category} | ${i.name} | ${i.coverageAmount.toLocaleString()} | ${i.currency} |`;
  })
  .join("\n")}

---

*本报告由 Wonder 家庭财务体检工具生成。数据仅保存在您的设备本地，Wonder 不存储任何个人财务信息。*
`;

  // 机器可读数据块（隐藏在注释里，用于恢复）
  const dataPart = `\n\n<!-- WONDER_FAMILY_FINANCE_DATA_V1\n${JSON.stringify(
    state,
    null,
    2
  )}\nEND_WONDER_DATA -->`;

  return humanPart + dataPart;
}

// ── 导入 Markdown ─────────────────────────────────────────────
export function importFromMarkdown(
  content: string
): FamilyFinanceState | null {
  try {
    const match = content.match(
      /<!-- WONDER_FAMILY_FINANCE_DATA_V1\n([\s\S]+?)\nEND_WONDER_DATA -->/
    );
    if (!match) return null;
    const parsed = JSON.parse(match[1]);
    // 基础校验
    if (!parsed.familyName || !Array.isArray(parsed.members)) return null;
    return parsed as FamilyFinanceState;
  } catch {
    return null;
  }
}

// ── 触发文件下载 ──────────────────────────────────────────────
export function downloadFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
