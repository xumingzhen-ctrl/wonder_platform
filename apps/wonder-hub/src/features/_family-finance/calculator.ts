import type {
  FamilyFinanceState,
  DiagnosticResult,
  AlertType,
} from "./types";

// ── 图表配色 ──────────────────────────────────────────────────
const ASSET_COLORS: Record<string, string> = {
  现金存款: "#2563a8",
  股票账户: "#3b82f6",
  基金账户: "#60a5fa",
  房地产: "#b8924a",
  股权: "#d4a574",
  其他: "#94a3b8",
};

const EXPENSE_COLORS: Record<string, string> = {
  家庭日常: "#2563a8",
  赡养父母: "#3b82f6",
  子女教育: "#60a5fa",
  保险保费: "#b8924a",
  房贷月供: "#d4a574",
  其他: "#94a3b8",
};

const CASHFLOW_COLORS: Record<string, string> = {
  保险年金: "#2563a8",
  股息分红: "#3b82f6",
  租金收入: "#60a5fa",
  其他: "#94a3b8",
};

const INSURANCE_COLORS: Record<string, string> = {
  人寿保险: "#2563a8",
  重疾保险: "#b8924a",
  意外保险: "#60a5fa",
  医疗保险: "#3b82f6",
  其他: "#94a3b8",
};

// ── 主计算函数 ────────────────────────────────────────────────
export function calculate(
  state: FamilyFinanceState,
  toBase: (amount: number, currency: string) => number
): DiagnosticResult {
  const { members, assets, liabilities, cashflows, expenses, insurances } = state;

  // ── 1. 资产 ──────────────────────────────────────────────
  const totalAssets = assets.reduce(
    (sum, a) => sum + toBase(a.amount, a.currency),
    0
  );

  const liquidAssets = assets
    .filter((a) => ["现金存款", "股票账户", "基金账户"].includes(a.category))
    .reduce((sum, a) => sum + toBase(a.amount, a.currency), 0);

  const realEstate = assets
    .filter((a) => a.category === "房地产")
    .reduce((sum, a) => sum + toBase(a.amount, a.currency), 0);

  const riskAssets = assets
    .filter((a) => ["股票账户", "基金账户", "股权"].includes(a.category))
    .reduce((sum, a) => sum + toBase(a.amount, a.currency), 0);

  // 资产分布图表数据
  const assetByCategory = new Map<string, number>();
  for (const a of assets) {
    const v = toBase(a.amount, a.currency);
    assetByCategory.set(a.category, (assetByCategory.get(a.category) ?? 0) + v);
  }
  const assetBreakdown = Array.from(assetByCategory.entries())
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({
      name,
      value,
      color: ASSET_COLORS[name] ?? "#94a3b8",
    }));

  // ── 2. 负债 ──────────────────────────────────────────────
  const totalLiabilities = liabilities.reduce(
    (sum, l) => sum + toBase(l.amount, l.currency),
    0
  );

  const netWorth = totalAssets - totalLiabilities;

  // ── 3. 被动现金流 ─────────────────────────────────────────
  const totalPassiveCashflow = cashflows.reduce(
    (sum, c) => sum + toBase(c.monthlyAmount, c.currency),
    0
  );

  const cashflowByCategory = new Map<string, number>();
  for (const c of cashflows) {
    const v = toBase(c.monthlyAmount, c.currency);
    cashflowByCategory.set(c.category, (cashflowByCategory.get(c.category) ?? 0) + v);
  }
  const cashflowBreakdown = Array.from(cashflowByCategory.entries())
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({
      name,
      value,
      color: CASHFLOW_COLORS[name] ?? "#94a3b8",
    }));

  // ── 4. 支出 ──────────────────────────────────────────────
  const totalMonthlyExpense = expenses.reduce(
    (sum, e) => sum + toBase(e.monthlyAmount, e.currency),
    0
  );

  // 刚性支出 = 保险保费 + 房贷月供
  const monthlyBurden = expenses
    .filter((e) => ["保险保费", "房贷月供"].includes(e.category))
    .reduce((sum, e) => sum + toBase(e.monthlyAmount, e.currency), 0);

  const monthlyBalance = totalPassiveCashflow - totalMonthlyExpense;

  const expenseByCategory = new Map<string, number>();
  for (const e of expenses) {
    const v = toBase(e.monthlyAmount, e.currency);
    expenseByCategory.set(e.category, (expenseByCategory.get(e.category) ?? 0) + v);
  }
  const expenseBreakdown = Array.from(expenseByCategory.entries())
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({
      name,
      value,
      color: EXPENSE_COLORS[name] ?? "#94a3b8",
    }));

  // ── 5. 保险 ──────────────────────────────────────────────
  const protectionTotal = insurances
    .filter((i) => ["人寿保险", "重疾保险"].includes(i.category))
    .reduce((sum, i) => sum + toBase(i.coverageAmount, i.currency), 0);

  // 建议保额 = 年必要支出 × 10
  const annualExpense = totalMonthlyExpense * 12;
  const recommendedCoverage = annualExpense * 10;
  const protectionGap = Math.max(0, recommendedCoverage - protectionTotal);

  const insuranceByCategory = new Map<string, number>();
  for (const i of insurances) {
    const v = toBase(i.coverageAmount, i.currency);
    insuranceByCategory.set(i.category, (insuranceByCategory.get(i.category) ?? 0) + v);
  }
  const insuranceBreakdown = Array.from(insuranceByCategory.entries())
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({
      name,
      value,
      color: INSURANCE_COLORS[name] ?? "#94a3b8",
    }));

  // ── 6. 比率计算 ───────────────────────────────────────────
  const debtRatio = totalAssets > 0 ? totalLiabilities / totalAssets : 0;
  const realEstateRatio = totalAssets > 0 ? realEstate / totalAssets : 0;
  const riskAssetRatio = totalAssets > 0 ? riskAssets / totalAssets : 0;
  const passiveCoverageRatio =
    totalMonthlyExpense > 0 ? totalPassiveCashflow / totalMonthlyExpense : 0;
  const mortgageExpense = expenses
    .filter((e) => e.category === "房贷月供")
    .reduce((sum, e) => sum + toBase(e.monthlyAmount, e.currency), 0);
  const mortgageRatio =
    totalMonthlyExpense > 0 ? mortgageExpense / totalMonthlyExpense : 0;
  const insuranceExpense = expenses
    .filter((e) => e.category === "保险保费")
    .reduce((sum, e) => sum + toBase(e.monthlyAmount, e.currency), 0);
  const insuranceRatio =
    totalMonthlyExpense > 0 ? insuranceExpense / totalMonthlyExpense : 0;

  // ── 7. 应急能力 ───────────────────────────────────────────
  const survivableMonths =
    totalMonthlyExpense > 0 ? liquidAssets / totalMonthlyExpense : 0;

  // ── 8. 成员净值 ───────────────────────────────────────────
  const memberNetWorth = members.map((m) => {
    const memberAssets = assets
      .filter((a) => a.memberId === m.id)
      .reduce((sum, a) => sum + toBase(a.amount, a.currency), 0);
    const memberLiabilities = liabilities
      .filter((l) => l.memberId === m.id)
      .reduce((sum, l) => sum + toBase(l.amount, l.currency), 0);
    return {
      memberId: m.id,
      name: m.name || m.relation,
      net: memberAssets - memberLiabilities,
    };
  });

  // ── 9. 预警 ──────────────────────────────────────────────
  const alerts: AlertType[] = [];
  if (survivableMonths < 6 && totalMonthlyExpense > 0) alerts.push("应急现金不足");
  if (passiveCoverageRatio < 0.3 && totalMonthlyExpense > 0) alerts.push("被动现金流偏弱");
  if (protectionGap > 0 && annualExpense > 0) alerts.push("保障存在缺口");
  if (debtRatio > 0.5 && totalAssets > 0) alerts.push("负债率偏高");

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    totalPassiveCashflow,
    monthlyBurden,
    totalMonthlyExpense,
    monthlyBalance,
    liquidAssets,
    survivableMonths,
    protectionTotal,
    protectionGap,
    debtRatio,
    realEstateRatio,
    riskAssetRatio,
    passiveCoverageRatio,
    mortgageRatio,
    insuranceRatio,
    alerts,
    memberNetWorth,
    assetBreakdown,
    expenseBreakdown,
    cashflowBreakdown,
    insuranceBreakdown,
  };
}

// ── 货币格式化 ────────────────────────────────────────────────
export function formatCurrency(
  amount: number,
  currency = "CNY",
  compact = false
): string {
  const absVal = Math.abs(amount);
  if (compact && absVal >= 10000) {
    return `${currency} ${(amount / 10000).toFixed(1)}万`;
  }
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}
