"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { FamilyFinanceState, Member, Relation } from "../types";
import { EmptyState, Section } from "./Charts";

const RELATIONS: Relation[] = ["本人", "配偶", "子女", "父母", "自定义"];
const CURRENCIES = ["CNY", "USD", "HKD", "EUR", "SGD", "JPY"];

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm " +
  "placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all";

const btnPrimary =
  "px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity";
const btnGhost =
  "px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors";
const btnDanger = "px-2 py-1 rounded-lg text-xs text-red-500 hover:bg-red-50 transition-colors";

// ──────────────────────────────────────────────────────────────
//  家庭信息 & 成员
// ──────────────────────────────────────────────────────────────
export function FamilyInfoSection({
  state,
  update,
  refreshRates,
}: {
  state: FamilyFinanceState;
  update: (p: Partial<FamilyFinanceState>) => void;
  refreshRates: () => Promise<string>;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Member>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [rateStatus, setRateStatus] = useState<"" | "ok" | "fail">("");

  const startAdd = () => {
    setEditId("__new__");
    setForm({ relation: "本人", name: "" });
  };

  const startEdit = (m: Member) => {
    setEditId(m.id);
    setForm({ ...m });
  };

  const save = () => {
    if (!form.name?.trim()) return;
    if (editId === "__new__") {
      const newMember: Member = {
        id: genId(),
        name: form.name!.trim(),
        relation: form.relation as Relation,
        customRelation: form.customRelation,
      };
      update({ members: [...state.members, newMember] });
    } else {
      update({
        members: state.members.map((m) =>
          m.id === editId ? { ...m, ...form } as Member : m
        ),
      });
    }
    setEditId(null);
    setForm({});
  };

  const remove = (id: string) => {
    update({ members: state.members.filter((m) => m.id !== id) });
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    const result = await refreshRates();
    setRateStatus(result === "success" ? "ok" : "fail");
    setRefreshing(false);
    setTimeout(() => setRateStatus(""), 3000);
  };

  return (
    <Section
      title="家庭信息"
      icon={<span>🏠</span>}
    >
      <div className="space-y-6 pt-2">
        {/* 基本信息 */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">家庭名称</label>
            <input
              className={inputCls}
              value={state.familyName}
              onChange={(e) => update({ familyName: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">基准货币</label>
            <select
              className={inputCls}
              value={state.baseCurrency}
              onChange={(e) => update({ baseCurrency: e.target.value })}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 汇率 */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border">
          <span className="text-xs text-muted-foreground flex-1">
            汇率来源：{state.exchangeRates.updatedAt ? (
              <span className="text-foreground">
                官方汇率 · {new Date(state.exchangeRates.updatedAt).toLocaleDateString("zh-CN")}
              </span>
            ) : "本地默认值"}
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={cn(btnGhost, rateStatus === "ok" && "text-emerald-600", rateStatus === "fail" && "text-red-500")}
          >
            {refreshing ? "刷新中…" : rateStatus === "ok" ? "✓ 已更新" : rateStatus === "fail" ? "✗ 失败" : "刷新汇率"}
          </button>
        </div>

        {/* 成员列表 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-card-foreground">家庭成员</p>
            <button onClick={startAdd} className={btnGhost}>+ 添加成员</button>
          </div>

          {state.members.length === 0 && editId !== "__new__" && (
            <EmptyState label="还没有成员，先添加一个" />
          )}

          <div className="space-y-2">
            {state.members.map((m) =>
              editId === m.id ? (
                <MemberForm
                  key={m.id}
                  form={form}
                  setForm={setForm}
                  onSave={save}
                  onCancel={() => setEditId(null)}
                />
              ) : (
                <div
                  key={m.id}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-background/60 border border-border"
                >
                  <span className="text-sm font-medium text-card-foreground flex-1">{m.name}</span>
                  <span className="text-xs text-muted-foreground">{m.customRelation || m.relation}</span>
                  <button onClick={() => startEdit(m)} className={btnGhost}>编辑</button>
                  <button onClick={() => remove(m.id)} className={btnDanger}>删除</button>
                </div>
              )
            )}
            {editId === "__new__" && (
              <MemberForm form={form} setForm={setForm} onSave={save} onCancel={() => setEditId(null)} />
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

function MemberForm({
  form,
  setForm,
  onSave,
  onCancel,
}: {
  form: Partial<Member>;
  setForm: (f: Partial<Member>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input
          className={inputCls}
          placeholder="姓名"
          value={form.name ?? ""}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <select
          className={inputCls}
          value={form.relation ?? "本人"}
          onChange={(e) => setForm({ ...form, relation: e.target.value as Relation })}
        >
          {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      {form.relation === "自定义" && (
        <input
          className={inputCls}
          placeholder="自定义关系"
          value={form.customRelation ?? ""}
          onChange={(e) => setForm({ ...form, customRelation: e.target.value })}
        />
      )}
      <div className="flex gap-2">
        <button onClick={onSave} className={btnPrimary}>保存成员</button>
        <button onClick={onCancel} className={btnGhost}>取消</button>
      </div>
    </div>
  );
}

export { genId, inputCls, btnPrimary, btnGhost, btnDanger, CURRENCIES };
