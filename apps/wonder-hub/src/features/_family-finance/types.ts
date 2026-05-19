// ─── 家庭成员 ────────────────────────────────────────────────
export type Relation = "本人" | "配偶" | "子女" | "父母" | "自定义";

export interface Member {
  id: string;
  name: string;
  relation: Relation;
  customRelation?: string;
}

// ─── 资产 ────────────────────────────────────────────────────
export type AssetCategory = "现金存款" | "股票账户" | "基金账户" | "房地产" | "股权" | "其他";

export interface Asset {
  id: string;
  memberId: string; // "family" = 家庭共有
  category: AssetCategory;
  name: string;
  amount: number;
  currency: string;
  note?: string;
}

// ─── 负债 ────────────────────────────────────────────────────
export type LiabilityCategory = "房贷" | "车贷" | "消费贷" | "信用卡" | "其他";

export interface Liability {
  id: string;
  memberId: string;
  category: LiabilityCategory;
  name: string;
  amount: number;     // 本金
  currency: string;
  monthlyPayment: number; // 月供（用于计算月度支出）
  note?: string;
}

// ─── 被动现金流 ──────────────────────────────────────────────
export type CashflowCategory = "保险年金" | "股息分红" | "租金收入" | "其他";

export interface Cashflow {
  id: string;
  memberId: string;
  category: CashflowCategory;
  name: string;
  monthlyAmount: number;
  currency: string;
  note?: string;
}

// ─── 月度支出 ────────────────────────────────────────────────
export type ExpenseCategory = "家庭日常" | "赡养父母" | "子女教育" | "保险保费" | "房贷月供" | "其他";

export interface Expense {
  id: string;
  memberId: string;
  category: ExpenseCategory;
  name: string;
  monthlyAmount: number;
  currency: string;
  note?: string;
}

// ─── 保障保险 ────────────────────────────────────────────────
export type InsuranceCategory = "人寿保险" | "重疾保险" | "意外保险" | "医疗保险" | "其他";

export interface Insurance {
  id: string;
  memberId: string;
  category: InsuranceCategory;
  name: string;
  coverageAmount: number;
  currency: string;
  note?: string;
}

// ─── 汇率 ────────────────────────────────────────────────────
export interface ExchangeRates {
  base: string;
  rates: Record<string, number>; // e.g. { USD: 7.24, HKD: 0.93 }
  updatedAt?: string;
}

// ─── 顶层状态 ────────────────────────────────────────────────
export interface FamilyFinanceState {
  familyName: string;
  baseCurrency: string;
  members: Member[];
  assets: Asset[];
  liabilities: Liability[];
  cashflows: Cashflow[];
  expenses: Expense[];
  insurances: Insurance[];
  exchangeRates: ExchangeRates;
}

// ─── 诊断结果 ────────────────────────────────────────────────
export interface DiagnosticResult {
  // 总览
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  // 现金流
  totalPassiveCashflow: number;
  monthlyBurden: number;    // 刚性支出（月供+保费）
  totalMonthlyExpense: number; // 所有支出
  monthlyBalance: number;   // 被动 - 总支出
  // 应急
  liquidAssets: number;
  survivableMonths: number;
  // 保障
  protectionTotal: number;  // 人寿+重疾保额
  protectionGap: number;    // 保障缺口（年必要支出 × 10 - 现有保额）
  // 比率
  debtRatio: number;        // 负债/资产
  realEstateRatio: number;
  riskAssetRatio: number;
  passiveCoverageRatio: number; // 被动/总支出
  mortgageRatio: number;    // 月供/总支出
  insuranceRatio: number;   // 保费/总支出
  // 预警
  alerts: AlertType[];
  // 成员净值
  memberNetWorth: { memberId: string; name: string; net: number }[];
  // 资产分布（用于图表）
  assetBreakdown: { name: string; value: number; color: string }[];
  expenseBreakdown: { name: string; value: number; color: string }[];
  cashflowBreakdown: { name: string; value: number; color: string }[];
  insuranceBreakdown: { name: string; value: number; color: string }[];
}

export type AlertType =
  | "应急现金不足"
  | "被动现金流偏弱"
  | "保障存在缺口"
  | "负债率偏高";
