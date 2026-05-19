"use client";
import { useState, useCallback, useEffect } from "react";

// ── Types ────────────────────────────────────────────────────
export type Relation = "本人"|"配偶"|"子女"|"父母"|"自定义";
export type AssetCat = "现金存款"|"股票账户"|"基金账户"|"房地产"|"股权"|"其他";
export type LiabCat = "房贷"|"车贷"|"消费贷"|"信用卡"|"其他";
export type CfCat = "保险年金"|"股息分红"|"租金收入"|"其他";
export type ExpCat = "家庭日常"|"赡养父母"|"子女教育"|"保险保费"|"房贷月供"|"其他";
export type InsCat = "人寿保险"|"重疾保险"|"意外保险"|"医疗保险"|"其他";
export type ActiveIncomeCat = "工资薪酬"|"经营收入"|"自由职业"|"兼职收入"|"奖金分红"|"其他";

export interface Member { id:string; name:string; relation:Relation; customRelation?:string; }
export interface Asset  { id:string; ownerId:string; category:AssetCat; name:string; amount:number; currency:string; }
export interface Liability { id:string; ownerId:string; category:LiabCat; name:string; amount:number; currency:string; }
export interface Cashflow  { id:string; ownerId:string; category:CfCat;  name:string; monthlyAmount:number; currency:string; }
export interface Expense   { id:string; ownerId:string; category:ExpCat; name:string; monthlyAmount:number; currency:string; }
export interface Insurance { id:string; ownerId:string; category:InsCat; name:string; coverageAmount:number; currency:string; }
export interface ActiveIncome { id:string; ownerId:string; category:ActiveIncomeCat; name:string; monthlyAmount:number; currency:string; }

export interface AppState {
  familyName: string;
  baseCurrency: string;
  rates: Record<string,number>;
  ratesSource: string;
  ratesUpdatedAt: string;
  members: Member[];
  assets: Asset[];
  liabilities: Liability[];
  cashflows: Cashflow[];
  expenses: Expense[];
  insurances: Insurance[];
  activeIncomes: ActiveIncome[];
}

export const CURRENCIES = ["CNY","USD","HKD","EUR","SGD","JPY","GBP","AUD"];
export const RELATIONS: Relation[] = ["本人","配偶","子女","父母","自定义"];
export const ASSET_CATS: AssetCat[] = ["现金存款","股票账户","基金账户","房地产","股权","其他"];
export const LIAB_CATS: LiabCat[] = ["房贷","车贷","消费贷","信用卡","其他"];
export const CF_CATS: CfCat[] = ["保险年金","股息分红","租金收入","其他"];
export const EXP_CATS: ExpCat[] = ["家庭日常","赡养父母","子女教育","保险保费","房贷月供","其他"];
export const INS_CATS: InsCat[] = ["人寿保险","重疾保险","意外保险","医疗保险","其他"];
export const ACTIVE_INCOME_CATS: ActiveIncomeCat[] = ["工资薪酬","经营收入","自由职业","兼职收入","奖金分红","其他"];

export const DEFAULT_RATES: Record<string,number> = {
  CNY:1, USD:7.25, HKD:0.93, EUR:7.85, SGD:5.38, JPY:0.048, GBP:9.15, AUD:4.65
};

export const DEFAULT_STATE: AppState = {
  familyName:"我的家庭", baseCurrency:"CNY",
  rates:DEFAULT_RATES, ratesSource:"本地默认值", ratesUpdatedAt:"",
  members:[], assets:[], liabilities:[], cashflows:[], expenses:[], insurances:[], activeIncomes:[],
};

// ── Storage ──────────────────────────────────────────────────
const KEY = "wonder_ff_v2";
export function loadState(): AppState {
  try { const r = localStorage.getItem(KEY); return r ? {...DEFAULT_STATE,...JSON.parse(r)} : DEFAULT_STATE; } catch { return DEFAULT_STATE; }
}
export function saveState(s: AppState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

// ── ID Generator ─────────────────────────────────────────────
export function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2,7)}`; }

// ── Currency Converter ───────────────────────────────────────
export function toBase(amount:number, currency:string, rates:Record<string,number>, base:string): number {
  if (currency === base) return amount;
  const from = rates[currency] ?? 1;
  const to = rates[base] ?? 1;
  return amount * from / to;
}

// ── Formatter ────────────────────────────────────────────────
export function fmtCcy(v:number, ccy:string): string {
  return new Intl.NumberFormat("zh-CN",{style:"currency",currency:ccy,maximumFractionDigits:0}).format(v);
}
export function fmtPct(v:number): string { return `${(v*100).toFixed(1)}%`; }
export function fmtRunway(months:number): string {
  if (!isFinite(months)||months<=0) return "—";
  return `${months.toFixed(1)} 个月`;
}
export function today(): string {
  return new Date().toLocaleDateString("zh-CN",{year:"numeric",month:"long",day:"numeric"});
}

// ── Pie Colors ───────────────────────────────────────────────
const PIE_COLORS = ["#0b2d52","#9f7321","#1f6f78","#355c7d","#7d5a1d","#b78a2a","#8a6f2a","#2a5c7d"];
export function pieColor(i:number): string { return PIE_COLORS[i % PIE_COLORS.length]; }

// ── Diagnostics ──────────────────────────────────────────────
export interface Diag {
  totalAssets:number; totalLiabilities:number; netWorth:number;
  monthlyNeed:number; liquidAssets:number; runway:number;
  totalPassiveCashflow:number; protectionTotal:number;
  debtRatio:number; propertyRatio:number; stockRatio:number;
  foreignAssetRatio:number; riskAssetRatio:number;
  passiveCoverage:number; mortgageRatio:number; insurancePremiumRatio:number;
  monthlyBurden:number; protectionCoverage:number; protectionGap:number;
  // 主动收入相关指标
  totalActiveIncome:number;
  totalIncome:number;
  savingsRate:number;          // 储蓄率 (总收入-总支出)/总收入
  activeExpenseRatio:number;   // 支出占主动收入比
  passiveReplaceRatio:number;  // 被动替代率 被动/主动
  financialFreedomPct:number;  // 财务自由进度 被动/(被动+主动)
  incomeSlices:{category:string;value:number}[];
  assetSlices:{category:string;value:number}[];
  cfSlices:{category:string;value:number}[];
  expSlices:{category:string;value:number}[];
  insSlices:{category:string;value:number}[];
  memberNets:{id:string;name:string;assets:number;liabilities:number}[];
}

export function computeDiag(s:AppState): Diag {
  const tb = (amt:number,ccy:string) => toBase(amt,ccy,s.rates,s.baseCurrency);

  // Assets
  const totalAssets = s.assets.reduce((sum,a)=>sum+tb(a.amount,a.currency),0);
  const liquidAssets = s.assets.filter(a=>["现金存款","股票账户","基金账户"].includes(a.category))
    .reduce((sum,a)=>sum+tb(a.amount,a.currency),0);
  const property = s.assets.filter(a=>a.category==="房地产").reduce((sum,a)=>sum+tb(a.amount,a.currency),0);
  const stock = s.assets.filter(a=>a.category==="股票账户").reduce((sum,a)=>sum+tb(a.amount,a.currency),0);
  const foreignAssets = s.assets.filter(a=>a.currency!==s.baseCurrency).reduce((sum,a)=>sum+tb(a.amount,a.currency),0);
  const riskAssets = s.assets.filter(a=>["股票账户","基金账户","股权","房地产"].includes(a.category))
    .reduce((sum,a)=>sum+tb(a.amount,a.currency),0);

  // Asset slices
  const aMap = new Map<string,number>();
  for(const a of s.assets){ aMap.set(a.category,(aMap.get(a.category)??0)+tb(a.amount,a.currency)); }
  const assetSlices = [...aMap.entries()].filter(([,v])=>v>0).map(([category,value])=>({category,value}));

  // Liabilities
  const totalLiabilities = s.liabilities.reduce((sum,l)=>sum+tb(l.amount,l.currency),0);
  const netWorth = totalAssets - totalLiabilities;

  // Cashflows
  const totalPassiveCashflow = s.cashflows.reduce((sum,c)=>sum+tb(c.monthlyAmount,c.currency),0);
  const cfMap = new Map<string,number>();
  for(const c of s.cashflows){ cfMap.set(c.category,(cfMap.get(c.category)??0)+tb(c.monthlyAmount,c.currency)); }
  const cfSlices = [...cfMap.entries()].filter(([,v])=>v>0).map(([category,value])=>({category,value}));

  // Expenses
  const monthlyNeed = s.expenses.reduce((sum,e)=>sum+tb(e.monthlyAmount,e.currency),0);
  const monthlyBurden = s.expenses.filter(e=>["保险保费","房贷月供"].includes(e.category))
    .reduce((sum,e)=>sum+tb(e.monthlyAmount,e.currency),0);
  const mortgage = s.expenses.filter(e=>e.category==="房贷月供").reduce((sum,e)=>sum+tb(e.monthlyAmount,e.currency),0);
  const premium = s.expenses.filter(e=>e.category==="保险保费").reduce((sum,e)=>sum+tb(e.monthlyAmount,e.currency),0);
  const expMap = new Map<string,number>();
  for(const e of s.expenses){ expMap.set(e.category,(expMap.get(e.category)??0)+tb(e.monthlyAmount,e.currency)); }
  const expSlices = [...expMap.entries()].filter(([,v])=>v>0).map(([category,value])=>({category,value}));

  // Insurance
  const protectionTotal = s.insurances.filter(i=>["人寿保险","重疾保险"].includes(i.category))
    .reduce((sum,i)=>sum+tb(i.coverageAmount,i.currency),0);
  const insMap = new Map<string,number>();
  for(const i of s.insurances){ insMap.set(i.category,(insMap.get(i.category)??0)+tb(i.coverageAmount,i.currency)); }
  const insSlices = [...insMap.entries()].filter(([,v])=>v>0).map(([category,value])=>({category,value}));
  const COVERAGE_YEARS = 10;
  const recommendedProtection = monthlyNeed*12*COVERAGE_YEARS + totalLiabilities;
  const protectionGap = Math.max(0, recommendedProtection - protectionTotal);

  // Active Income
  const totalActiveIncome = (s.activeIncomes??[]).reduce((sum,a)=>sum+tb(a.monthlyAmount,a.currency),0);
  const totalIncome = totalActiveIncome + totalPassiveCashflow;
  const incMap = new Map<string,number>();
  for(const a of (s.activeIncomes??[])){ incMap.set(a.category,(incMap.get(a.category)??0)+tb(a.monthlyAmount,a.currency)); }
  const incomeSlices = [...incMap.entries()].filter(([,v])=>v>0).map(([category,value])=>({category,value}));

  // Member nets
  const memberNets = s.members.map(m=>({
    id:m.id, name:m.name||m.relation,
    assets: s.assets.filter(a=>a.ownerId===m.id).reduce((sum,a)=>sum+tb(a.amount,a.currency),0),
    liabilities: s.liabilities.filter(l=>l.ownerId===m.id).reduce((sum,l)=>sum+tb(l.amount,l.currency),0),
  }));

  return {
    totalAssets, totalLiabilities, netWorth,
    monthlyNeed, liquidAssets,
    runway: monthlyNeed>0 ? liquidAssets/monthlyNeed : Infinity,
    totalPassiveCashflow, protectionTotal,
    debtRatio: totalAssets>0 ? totalLiabilities/totalAssets : 0,
    propertyRatio: totalAssets>0 ? property/totalAssets : 0,
    stockRatio: totalAssets>0 ? stock/totalAssets : 0,
    foreignAssetRatio: totalAssets>0 ? foreignAssets/totalAssets : 0,
    riskAssetRatio: totalAssets>0 ? riskAssets/totalAssets : 0,
    passiveCoverage: monthlyNeed>0 ? totalPassiveCashflow/monthlyNeed : 0,
    mortgageRatio: monthlyNeed>0 ? mortgage/monthlyNeed : 0,
    insurancePremiumRatio: monthlyNeed>0 ? premium/monthlyNeed : 0,
    monthlyBurden,
    protectionCoverage: recommendedProtection>0 ? protectionTotal/recommendedProtection : 0,
    protectionGap,
    totalActiveIncome, totalIncome,
    savingsRate: totalIncome>0 ? Math.max(0,(totalIncome-monthlyNeed)/totalIncome) : 0,
    activeExpenseRatio: totalActiveIncome>0 ? monthlyNeed/totalActiveIncome : 0,
    passiveReplaceRatio: totalActiveIncome>0 ? totalPassiveCashflow/totalActiveIncome : 0,
    financialFreedomPct: totalIncome>0 ? totalPassiveCashflow/totalIncome : 0,
    incomeSlices,
    assetSlices, cfSlices, expSlices, insSlices, memberNets,
  };
}

// ── Status Pill Logic ─────────────────────────────────────────
export type Tone = "good"|"warn"|"alert"|"neutral";
export function tone(value:number, mode:"low"|"high"|"range", threshold:number|[number,number]): Tone {
  if(mode==="low"){
    if(value<=0) return "good";
    if(value<=(threshold as number)*0.5) return "warn";
    return "alert";
  }
  if(mode==="high"){
    if(value>=(threshold as number)) return "good";
    if(value>=(threshold as number)*0.6) return "warn";
    return "alert";
  }
  // range
  const [lo,hi] = threshold as [number,number];
  if(value>=lo && value<=hi) return "good";
  if(value<lo*0.6 || value>hi*1.5) return "alert";
  return "warn";
}

// ── Hooks ────────────────────────────────────────────────────
export function useAppState() {
  const [state, setStateRaw] = useState<AppState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(()=>{ setStateRaw(loadState()); setHydrated(true); },[]);
  useEffect(()=>{ if(hydrated) saveState(state); },[state,hydrated]);

  const update = useCallback((patch:Partial<AppState>)=>{
    setStateRaw(prev=>({...prev,...patch}));
  },[]);

  const reset = useCallback(()=>{
    localStorage.removeItem(KEY);
    setStateRaw(DEFAULT_STATE);
  },[]);

  return {state,update,reset,hydrated};
}

// ── Export / Import ───────────────────────────────────────────
export function exportToMd(s:AppState):string{
  const d=new Date().toLocaleDateString("zh-CN",{year:"numeric",month:"long",day:"numeric"});
  const rows=(items:{name?:string;category?:string}[])=>items.length?items.map(i=>`- ${i.name||i.category}`).join("\n"):"暂无";
  const human=`# Wonder 家庭财务健康报告\n\n**家庭名称**：${s.familyName}\n**基准货币**：${s.baseCurrency}\n**导出日期**：${d}\n**出品**：Wonder · 私人财富管理智库\n\n---\n\n## 家庭成员\n${s.members.map(m=>`- ${m.name}（${m.customRelation||m.relation}）`).join("\n")||"暂无"}\n\n## 资产\n${rows(s.assets)}\n\n## 负债\n${rows(s.liabilities)}\n\n## 被动现金流\n${rows(s.cashflows)}\n\n## 支出\n${rows(s.expenses)}\n\n## 保障保险\n${rows(s.insurances)}\n\n---\n*本报告由 Wonder 家庭财务体检工具生成，数据仅保存在您的设备本地。*\n`;
  const data=`\n\n<!-- WONDER_FF_DATA_V2\n${JSON.stringify(s,null,2)}\nEND_WONDER_FF_DATA -->`;
  return human+data;
}

export function importFromMd(content:string):AppState|null{
  try{
    const m=content.match(/<!-- WONDER_FF_DATA_V2\n([\s\S]+?)\nEND_WONDER_FF_DATA -->/);
    if(!m) return null;
    const p=JSON.parse(m[1]);
    if(!p.familyName||!Array.isArray(p.members)) return null;
    return {...DEFAULT_STATE,...p} as AppState;
  }catch{return null;}
}

export function downloadFile(content:string,filename:string):void{
  const blob=new Blob([content],{type:"text/markdown;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();
  document.body.removeChild(a);URL.revokeObjectURL(url);
}
