"use client";

import { useState, useEffect, useCallback } from "react";
import type { FamilyFinanceState, ExchangeRates } from "./types";

const STORAGE_KEY = "wonder_family_finance_v1";

export const DEFAULT_RATES: ExchangeRates = {
  base: "CNY",
  rates: { CNY: 1, USD: 7.25, HKD: 0.93, EUR: 7.85, JPY: 0.048, SGD: 5.38 },
  updatedAt: undefined,
};

export const DEFAULT_STATE: FamilyFinanceState = {
  familyName: "我的家庭",
  baseCurrency: "CNY",
  members: [],
  assets: [],
  liabilities: [],
  cashflows: [],
  expenses: [],
  insurances: [],
  exchangeRates: DEFAULT_RATES,
};

function loadFromStorage(): FamilyFinanceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveToStorage(state: FamilyFinanceState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota exceeded — silently fail
  }
}

export function useFamilyFinance() {
  const [state, setState] = useState<FamilyFinanceState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  // 从 localStorage 初始化
  useEffect(() => {
    setState(loadFromStorage());
    setHydrated(true);
  }, []);

  // 每次状态变更自动持久化
  useEffect(() => {
    if (hydrated) saveToStorage(state);
  }, [state, hydrated]);

  // ── 通用 setter ──────────────────────────────────────────
  const update = useCallback((partial: Partial<FamilyFinanceState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState(DEFAULT_STATE);
  }, []);

  // ── 汇率换算（将任意币种转为基准币） ──────────────────────
  const toBase = useCallback(
    (amount: number, currency: string): number => {
      const { base, rates } = state.exchangeRates;
      if (currency === base) return amount;
      const fromRate = rates[currency] ?? 1;
      const toRate = rates[base] ?? 1;
      return (amount * fromRate) / toRate;
    },
    [state.exchangeRates]
  );

  // ── 刷新汇率（使用公开API，失败则保持本地值） ─────────────
  const refreshRates = useCallback(async () => {
    try {
      // 使用 exchangerate-api 免费端点（或 fastforex fallback）
      const res = await fetch(
        "https://open.er-api.com/v6/latest/CNY"
      );
      if (!res.ok) throw new Error("rate fetch failed");
      const data = await res.json();
      if (data.rates) {
        setState((prev) => ({
          ...prev,
          exchangeRates: {
            base: "CNY",
            rates: { CNY: 1, ...data.rates },
            updatedAt: new Date().toISOString(),
          },
        }));
        return "success";
      }
    } catch {
      // keep existing rates
    }
    return "failed";
  }, []);

  return { state, update, reset, toBase, refreshRates, hydrated };
}
