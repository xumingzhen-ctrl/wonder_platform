"use client";

import { useState } from "react";
import type { FamilyFinanceState, Asset, AssetCategory, Liability, LiabilityCategory, Cashflow, CashflowCategory, Expense, ExpenseCategory, Insurance, InsuranceCategory } from "../types";
import { EmptyState, Section } from "./Charts";
import { genId, inputCls, btnPrimary, btnGhost, btnDanger, CURRENCIES } from "./FamilyInfoSection";

// ── 通用条目列表组件 ──────────────────────────────────────────
function EntryList<T extends { id: string; name: string; memberId: string }>({
  items,
  renderRow,
  renderForm,
  onAdd,
  emptyLabel,
}: {
  items: T[];
  renderRow: (item: T, onEdit: () => void, onRemove: () => void) => React.ReactNode;
  renderForm: (item: Partial<T>, onChange: (p: Partial<T>) => void, onSave: () => void, onCancel: () => void) => React.ReactNode;
  onAdd: (item: T) => void;
  emptyLabel: string;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<T>>({});
  const [list, setList] = useState(items);

  // Sync external items changes
  if (JSON.stringify(list.map(i => i.id)) !== JSON.stringify(items.map(i => i.id))) {
    setList(items);
  }

  const startAdd = () => { setEditId("__new__"); setForm({} as Partial<T>); };
  const startEdit = (item: T) => { setEditId(item.id); setForm({ ...item }); };
  const save = () => { onAdd({ ...form, id: editId === "__new__" ? genId() : editId! } as T); setEditId(null); setForm({}); };
  const cancel = () => { setEditId(null); setForm({}); };

  return (
    <div className="space-y-2">
      {items.length === 0 && editId !== "__new__" && <EmptyState label={emptyLabel} />}
      {items.map((item) =>
        editId === item.id ? (
          <div key={item.id} className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
            {renderForm(form, setForm, save, cancel)}
          </div>
        ) : (
          renderRow(item, () => startEdit(item), () => onAdd({ ...item, _DELETE: true } as T & { _DELETE: boolean }))
        )
      )}
      {editId === "__new__" && (
        <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
          {renderForm(form, setForm, save, cancel)}
        </div>
      )}
      <button onClick={startAdd} className={btnGhost + " w-full border border-dashed border-border rounded-xl py-2"}>
        + 添加条目
      </button>
    </div>
  );
}

function MemberSelect({ members, value, onChange }: { members: FamilyFinanceState["members"]; value: string; onChange: (v: string) => void }) {
  return (
    <select className={inputCls} value={value} onChange={e => onChange(e.target.value)}>
      <option value="family">家庭共有</option>
      {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  );
}

function AmountRow({ form, onChange, showMonthly = false, showCoverage = false }: {
  form: Partial<Record<string, unknown>>;
  onChange: (p: Record<string, unknown>) => void;
  showMonthly?: boolean;
  showCoverage?: boolean;
}) {
  const amountKey = showMonthly ? "monthlyAmount" : showCoverage ? "coverageAmount" : "amount";
  return (
    <div className="grid grid-cols-2 gap-2">
      <input className={inputCls} type="number" placeholder={showMonthly ? "月金额" : showCoverage ? "保额" : "金额"} value={(form[amountKey] as number) ?? ""}
        onChange={e => onChange({ [amountKey]: parseFloat(e.target.value) || 0 })} />
      <select className={inputCls} value={(form.currency as string) ?? "CNY"} onChange={e => onChange({ currency: e.target.value })}>
        {CURRENCIES.map(c => <option key={c}>{c}</option>)}
      </select>
    </div>
  );
}

function ItemRow({ name, sub, onEdit, onRemove }: { name: string; sub: string; onEdit: () => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-background/60 border border-border">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-card-foreground truncate">{name}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <button onClick={onEdit} className={btnGhost}>编辑</button>
      <button onClick={onRemove} className={btnDanger}>删除</button>
    </div>
  );
}

// ── 资产 ──────────────────────────────────────────────────────
const ASSET_CATEGORIES: AssetCategory[] = ["现金存款", "股票账户", "基金账户", "房地产", "股权", "其他"];

export function AssetSection({ state, update }: { state: FamilyFinanceState; update: (p: Partial<FamilyFinanceState>) => void }) {
  const upsert = (item: Asset & { _DELETE?: boolean }) => {
    if (item._DELETE) { update({ assets: state.assets.filter(a => a.id !== item.id) }); return; }
    const exists = state.assets.find(a => a.id === item.id);
    update({ assets: exists ? state.assets.map(a => a.id === item.id ? item : a) : [...state.assets, item] });
  };

  return (
    <Section title="资产" icon={<span>💰</span>}>
      <div className="pt-2">
        <EntryList
          items={state.assets}
          emptyLabel="还没有资产，先添加一条"
          onAdd={upsert as (item: Asset) => void}
          renderRow={(item, onEdit, onRemove) => (
            <ItemRow key={item.id} name={item.name || item.category}
              sub={`${item.category} · ${item.amount.toLocaleString()} ${item.currency}`}
              onEdit={onEdit} onRemove={onRemove} />
          )}
          renderForm={(form, setForm, save, cancel) => (
            <>
              <div className="grid grid-cols-2 gap-2">
                <MemberSelect members={state.members} value={(form.memberId as string) ?? "family"} onChange={v => setForm({ ...form, memberId: v })} />
                <select className={inputCls} value={(form.category as string) ?? "现金存款"} onChange={e => setForm({ ...form, category: e.target.value as AssetCategory })}>
                  {ASSET_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <input className={inputCls} placeholder="账户名称（如汇丰、富途）" value={(form.name as string) ?? ""} onChange={e => setForm({ ...form, name: e.target.value })} />
              <AmountRow form={form as Record<string, unknown>} onChange={p => setForm({ ...form, ...p })} />
              <div className="flex gap-2"><button className={btnPrimary} onClick={save}>保存</button><button className={btnGhost} onClick={cancel}>取消</button></div>
            </>
          )}
        />
      </div>
    </Section>
  );
}

// ── 负债 ──────────────────────────────────────────────────────
const LIABILITY_CATEGORIES: LiabilityCategory[] = ["房贷", "车贷", "消费贷", "信用卡", "其他"];

export function LiabilitySection({ state, update }: { state: FamilyFinanceState; update: (p: Partial<FamilyFinanceState>) => void }) {
  const upsert = (item: Liability & { _DELETE?: boolean }) => {
    if (item._DELETE) { update({ liabilities: state.liabilities.filter(l => l.id !== item.id) }); return; }
    const exists = state.liabilities.find(l => l.id === item.id);
    update({ liabilities: exists ? state.liabilities.map(l => l.id === item.id ? item : l) : [...state.liabilities, item] });
  };

  return (
    <Section title="负债" icon={<span>🏦</span>}>
      <p className="text-xs text-muted-foreground mb-3 pt-2">只录入负债本金，月供请在"支出"模块录入</p>
      <EntryList
        items={state.liabilities}
        emptyLabel="还没有负债"
        onAdd={upsert as (item: Liability) => void}
        renderRow={(item, onEdit, onRemove) => (
          <ItemRow key={item.id} name={item.name || item.category}
            sub={`${item.category} · 本金 ${item.amount.toLocaleString()} ${item.currency}`}
            onEdit={onEdit} onRemove={onRemove} />
        )}
        renderForm={(form, setForm, save, cancel) => (
          <>
            <div className="grid grid-cols-2 gap-2">
              <MemberSelect members={state.members} value={(form.memberId as string) ?? "family"} onChange={v => setForm({ ...form, memberId: v })} />
              <select className={inputCls} value={(form.category as string) ?? "房贷"} onChange={e => setForm({ ...form, category: e.target.value as LiabilityCategory })}>
                {LIABILITY_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <input className={inputCls} placeholder="贷款名称" value={(form.name as string) ?? ""} onChange={e => setForm({ ...form, name: e.target.value })} />
            <AmountRow form={form as Record<string, unknown>} onChange={p => setForm({ ...form, ...p })} />
            <div className="flex gap-2"><button className={btnPrimary} onClick={save}>保存</button><button className={btnGhost} onClick={cancel}>取消</button></div>
          </>
        )}
      />
    </Section>
  );
}

// ── 被动现金流 ─────────────────────────────────────────────────
const CASHFLOW_CATEGORIES: CashflowCategory[] = ["保险年金", "股息分红", "租金收入", "其他"];

export function CashflowSection({ state, update }: { state: FamilyFinanceState; update: (p: Partial<FamilyFinanceState>) => void }) {
  const upsert = (item: Cashflow & { _DELETE?: boolean }) => {
    if (item._DELETE) { update({ cashflows: state.cashflows.filter(c => c.id !== item.id) }); return; }
    const exists = state.cashflows.find(c => c.id === item.id);
    update({ cashflows: exists ? state.cashflows.map(c => c.id === item.id ? item : c) : [...state.cashflows, item] });
  };

  return (
    <Section title="被动现金流" icon={<span>📈</span>}>
      <div className="pt-2">
        <EntryList
          items={state.cashflows}
          emptyLabel="还没有被动收入"
          onAdd={upsert as (item: Cashflow) => void}
          renderRow={(item, onEdit, onRemove) => (
            <ItemRow key={item.id} name={item.name || item.category}
              sub={`${item.category} · 月收 ${item.monthlyAmount.toLocaleString()} ${item.currency}`}
              onEdit={onEdit} onRemove={onRemove} />
          )}
          renderForm={(form, setForm, save, cancel) => (
            <>
              <div className="grid grid-cols-2 gap-2">
                <MemberSelect members={state.members} value={(form.memberId as string) ?? "family"} onChange={v => setForm({ ...form, memberId: v })} />
                <select className={inputCls} value={(form.category as string) ?? "股息分红"} onChange={e => setForm({ ...form, category: e.target.value as CashflowCategory })}>
                  {CASHFLOW_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <input className={inputCls} placeholder="来源名称" value={(form.name as string) ?? ""} onChange={e => setForm({ ...form, name: e.target.value })} />
              <AmountRow form={form as Record<string, unknown>} onChange={p => setForm({ ...form, ...p })} showMonthly />
              <div className="flex gap-2"><button className={btnPrimary} onClick={save}>保存</button><button className={btnGhost} onClick={cancel}>取消</button></div>
            </>
          )}
        />
      </div>
    </Section>
  );
}

// ── 月度支出 ──────────────────────────────────────────────────
const EXPENSE_CATEGORIES: ExpenseCategory[] = ["家庭日常", "赡养父母", "子女教育", "保险保费", "房贷月供", "其他"];

export function ExpenseSection({ state, update }: { state: FamilyFinanceState; update: (p: Partial<FamilyFinanceState>) => void }) {
  const upsert = (item: Expense & { _DELETE?: boolean }) => {
    if (item._DELETE) { update({ expenses: state.expenses.filter(e => e.id !== item.id) }); return; }
    const exists = state.expenses.find(e => e.id === item.id);
    update({ expenses: exists ? state.expenses.map(e => e.id === item.id ? item : e) : [...state.expenses, item] });
  };

  return (
    <Section title="月度支出" icon={<span>💸</span>}>
      <div className="pt-2">
        <EntryList
          items={state.expenses}
          emptyLabel="还没有支出记录"
          onAdd={upsert as (item: Expense) => void}
          renderRow={(item, onEdit, onRemove) => (
            <ItemRow key={item.id} name={item.name || item.category}
              sub={`${item.category} · 月支 ${item.monthlyAmount.toLocaleString()} ${item.currency}`}
              onEdit={onEdit} onRemove={onRemove} />
          )}
          renderForm={(form, setForm, save, cancel) => (
            <>
              <div className="grid grid-cols-2 gap-2">
                <MemberSelect members={state.members} value={(form.memberId as string) ?? "family"} onChange={v => setForm({ ...form, memberId: v })} />
                <select className={inputCls} value={(form.category as string) ?? "家庭日常"} onChange={e => setForm({ ...form, category: e.target.value as ExpenseCategory })}>
                  {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <input className={inputCls} placeholder="支出名称" value={(form.name as string) ?? ""} onChange={e => setForm({ ...form, name: e.target.value })} />
              <AmountRow form={form as Record<string, unknown>} onChange={p => setForm({ ...form, ...p })} showMonthly />
              <div className="flex gap-2"><button className={btnPrimary} onClick={save}>保存</button><button className={btnGhost} onClick={cancel}>取消</button></div>
            </>
          )}
        />
      </div>
    </Section>
  );
}

// ── 保障保险 ──────────────────────────────────────────────────
const INSURANCE_CATEGORIES: InsuranceCategory[] = ["人寿保险", "重疾保险", "意外保险", "医疗保险", "其他"];

export function InsuranceSection({ state, update }: { state: FamilyFinanceState; update: (p: Partial<FamilyFinanceState>) => void }) {
  const upsert = (item: Insurance & { _DELETE?: boolean }) => {
    if (item._DELETE) { update({ insurances: state.insurances.filter(i => i.id !== item.id) }); return; }
    const exists = state.insurances.find(i => i.id === item.id);
    update({ insurances: exists ? state.insurances.map(i => i.id === item.id ? item : i) : [...state.insurances, item] });
  };

  return (
    <Section title="保障保险" icon={<span>🛡️</span>}>
      <p className="text-xs text-muted-foreground mb-3 pt-2">按保额录入，分别填写人寿、重疾、意外、医疗各险种</p>
      <EntryList
        items={state.insurances}
        emptyLabel="还没有保险记录"
        onAdd={upsert as (item: Insurance) => void}
        renderRow={(item, onEdit, onRemove) => (
          <ItemRow key={item.id} name={item.name || item.category}
            sub={`${item.category} · 保额 ${item.coverageAmount.toLocaleString()} ${item.currency}`}
            onEdit={onEdit} onRemove={onRemove} />
        )}
        renderForm={(form, setForm, save, cancel) => (
          <>
            <div className="grid grid-cols-2 gap-2">
              <MemberSelect members={state.members} value={(form.memberId as string) ?? "family"} onChange={v => setForm({ ...form, memberId: v })} />
              <select className={inputCls} value={(form.category as string) ?? "人寿保险"} onChange={e => setForm({ ...form, category: e.target.value as InsuranceCategory })}>
                {INSURANCE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <input className={inputCls} placeholder="保险名称" value={(form.name as string) ?? ""} onChange={e => setForm({ ...form, name: e.target.value })} />
            <AmountRow form={form as Record<string, unknown>} onChange={p => setForm({ ...form, ...p })} showCoverage />
            <div className="flex gap-2"><button className={btnPrimary} onClick={save}>保存</button><button className={btnGhost} onClick={cancel}>取消</button></div>
          </>
        )}
      />
    </Section>
  );
}
