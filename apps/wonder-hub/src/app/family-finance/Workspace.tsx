"use client";
import React,{useState} from "react";
import type {AppState,Member,Asset,Liability,Cashflow,Expense,Insurance} from "@/features/_family-finance/core";
import {uid,CURRENCIES,RELATIONS,ASSET_CATS,LIAB_CATS,CF_CATS,EXP_CATS,INS_CATS} from "@/features/_family-finance/core";

type Upd = (p:Partial<AppState>)=>void;

// ── Shared Primitives ─────────────────────────────────────────
const Panel=({title,sub,children}:{title:React.ReactNode;sub?:string;children:React.ReactNode})=>(
  <section className="ff-panel">
    <div className="ff-panel-head">
      <div className="ff-panel-title">{title}</div>
      {sub&&<div className="ff-panel-subtitle">{sub}</div>}
    </div>
    {children}
  </section>
);

const FieldGrid=({cols,children}:{cols:2|3|4;children:React.ReactNode})=>(
  <div className={`ff-field-grid ${cols===2?"two":cols===3?"three":"four"}`}>{children}</div>
);

const Lbl=({label,children}:{label:string;children:React.ReactNode})=>(
  <label><span>{label}</span>{children}</label>
);

const Sel=({value,onChange,opts}:{value:string;onChange:(v:string)=>void;opts:readonly string[]})=>(
  <select value={value} onChange={e=>onChange(e.target.value)}>
    {opts.map(o=><option key={o} value={o}>{o}</option>)}
  </select>
);

const Inp=({value,onChange,placeholder,type="text"}:{value:string|number;onChange:(v:string)=>void;placeholder?:string;type?:string})=>(
  <input type={type} value={value} placeholder={placeholder} onChange={e=>onChange(e.target.value)}/>
);

const EmptyState=({label}:{label:string})=><div className="ff-empty-state">{label}</div>;

const IconBtn=({onClick,danger,children}:{onClick:()=>void;danger?:boolean;children:React.ReactNode})=>(
  <button type="button" className={`ff-icon-button${danger?" danger":""}`} onClick={onClick}>{children}</button>
);

// ── Generic Entry List ────────────────────────────────────────
type BaseEntry={id:string;ownerId:string};

function EntryList<T extends BaseEntry>({
  items,members,emptyLabel,
  renderMeta,formFields,
  onUpsert,onDelete,defaultForm,
}:{
  items:T[];members:Member[];emptyLabel:string;
  renderMeta:(item:T)=>React.ReactNode;
  formFields:(form:Partial<T>,set:(p:Partial<T>)=>void)=>React.ReactNode;
  onUpsert:(item:T)=>void;onDelete:(id:string)=>void;
  defaultForm:Partial<T>;
}){
  const [editId,setEditId]=useState<string|null>(null);
  const [form,setForm]=useState<Partial<T>>(defaultForm);
  const merge=(p:Partial<T>)=>setForm(prev=>({...prev,...p}));

  const save=()=>{
    if(!editId)return;
    onUpsert({...defaultForm,...form,id:editId==="__new__"?uid():editId} as T);
    setEditId(null);setForm(defaultForm);
  };
  const cancel=()=>{setEditId(null);setForm(defaultForm);};
  const startEdit=(item:T)=>{setEditId(item.id);setForm({...item});};
  const startAdd=()=>{setEditId("__new__");setForm(defaultForm);};

  return(
    <div>
      <div className="ff-action-row">
        <button type="button" className="ff-ghost-button" onClick={startAdd}>+ 添加条目</button>
      </div>
      {items.length===0&&editId!=="__new__"&&<EmptyState label={emptyLabel}/>}
      <div className="ff-entry-list">
        {items.map(item=>
          editId===item.id?(
            <div key={item.id} style={{display:"grid",gap:10,padding:12,background:"#fff7e8",border:"1px solid #e7d4ad",borderRadius:8}}>
              <FieldGrid cols={4}>
                <Lbl label="归属">
                  <select value={form.ownerId??""} onChange={e=>merge({ownerId:e.target.value} as Partial<T>)}>
                    <option value="family">家庭共有</option>
                    {members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </Lbl>
                {formFields(form,merge)}
              </FieldGrid>
              <div className="ff-row-actions">
                <button type="button" className="ff-ghost-button" onClick={save}>保存</button>
                <button type="button" className="ff-ghost-button" onClick={cancel}>取消</button>
              </div>
            </div>
          ):(
            <div key={item.id} className="ff-entry-row">
              <div className="ff-entry-main">{renderMeta(item)}</div>
              <div className="ff-row-actions">
                <IconBtn onClick={()=>startEdit(item)}>✏️</IconBtn>
                <IconBtn danger onClick={()=>onDelete(item.id)}>🗑️</IconBtn>
              </div>
            </div>
          )
        )}
        {editId==="__new__"&&(
          <div style={{display:"grid",gap:10,padding:12,background:"#fff7e8",border:"1px solid #d4ad5c",borderRadius:8}}>
            <FieldGrid cols={4}>
              <Lbl label="归属">
                <select value={form.ownerId??""} onChange={e=>merge({ownerId:e.target.value} as Partial<T>)}>
                  <option value="family">家庭共有</option>
                  {members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Lbl>
              {formFields(form,merge)}
            </FieldGrid>
            <div className="ff-row-actions">
              <button type="button" className="ff-ghost-button" onClick={save}>保存</button>
              <button type="button" className="ff-ghost-button" onClick={cancel}>取消</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Family Info Panel ─────────────────────────────────────────
export function FamilyPanel({state,update,onRefreshRates}:{state:AppState;update:Upd;onRefreshRates:()=>Promise<void>}){
  const [status,setStatus]=useState<"idle"|"loading"|"ready"|"error">("idle");
  const refresh=async()=>{
    setStatus("loading");
    try{
      const r=await fetch(`https://open.er-api.com/v6/latest/${state.baseCurrency}`);
      const d=await r.json();
      if(d.rates){
        // API 返回"1 基准货币 = X 外币"，但 toBase() 需要"1 外币 = X 基准货币"
        // 因此取倒数，恢复为 1 外币能兑换多少基准货币
        const inverted:Record<string,number>={[state.baseCurrency]:1};
        for(const [k,v] of Object.entries(d.rates as Record<string,number>)){
          if(Number(v)>0) inverted[k]=parseFloat((1/Number(v)).toFixed(6));
        }
        update({rates:inverted,ratesSource:"ECB Data Portal",ratesUpdatedAt:new Date().toISOString()});
        setStatus("ready");
      }else setStatus("error");
    }catch{setStatus("error");}
  };

  // Members
  const [editMId,setEditMId]=useState<string|null>(null);
  const [mForm,setMForm]=useState<Partial<Member>>({});
  const saveMember=()=>{
    if(!mForm.name?.trim())return;
    if(editMId==="__new__"){
      update({members:[...state.members,{id:uid(),name:mForm.name!,relation:mForm.relation??"本人",customRelation:mForm.customRelation}]});
    }else{
      update({members:state.members.map(m=>m.id===editMId?{...m,...mForm} as Member:m)});
    }
    setEditMId(null);setMForm({});
  };

  return(
    <Panel title="🏠 家庭信息">
      <div className="ff-rates-banner">
        <div><strong>汇率来源</strong><span>{state.ratesSource||"本地默认值"}</span></div>
        <div><strong>状态</strong><span>{status==="loading"?"正在刷新":status==="ready"?"已更新":status==="error"?"更新失败":"—"}</span></div>
        <div><strong>更新时间</strong><span>{state.ratesUpdatedAt?new Date(state.ratesUpdatedAt).toLocaleString("zh-CN"):"暂无"}</span></div>
        <button type="button" className="ff-rate-refresh-button" onClick={refresh} disabled={status==="loading"}>
          {status==="loading"?"刷新中":"刷新"}
        </button>
      </div>
      <FieldGrid cols={2}>
        <Lbl label="家庭名称"><Inp value={state.familyName} onChange={v=>update({familyName:v})}/></Lbl>
        <Lbl label="基准货币">
          <Sel value={state.baseCurrency} onChange={v=>{
            const oldBaseRate = state.rates[v] || 1;
            const newRates: Record<string,number> = {};
            for (const k of Object.keys(state.rates)) {
              newRates[k] = parseFloat((state.rates[k] / oldBaseRate).toFixed(6));
            }
            newRates[v] = 1; // Ensure the new base is exactly 1
            update({ baseCurrency: v, rates: newRates });
          }} opts={CURRENCIES}/>
        </Lbl>
      </FieldGrid>
      <div className="ff-rate-grid">
        {CURRENCIES.map(c=>(
          <Lbl key={c} label={`1 ${c} = ? ${state.baseCurrency}`}>
            <input type="number" step="0.0001" value={state.rates[c]??1}
              onChange={e=>update({rates:{...state.rates,[c]:parseFloat(e.target.value)||1}})}/>
          </Lbl>
        ))}
      </div>
    </Panel>
  );
}

// Members panel
export function MembersPanel({state,update}:{state:AppState;update:Upd}){
  const [editId,setEditId]=useState<string|null>(null);
  const [form,setForm]=useState<Partial<Member>>({});
  const save=()=>{
    if(!form.name?.trim())return;
    if(editId==="__new__") update({members:[...state.members,{id:uid(),name:form.name!,relation:form.relation??"本人",customRelation:form.customRelation}]});
    else update({members:state.members.map(m=>m.id===editId?{...m,...form} as Member:m)});
    setEditId(null);setForm({});
  };
  const del=(id:string)=>update({members:state.members.filter(m=>m.id!==id)});

  return(
    <Panel title="👨‍👩‍👧 成员" sub="按家庭成员逐个创建，可修改和删除">
      {state.members.length===0&&editId!=="__new__"&&<EmptyState label="还没有成员，先添加一个"/>}
      <div className="ff-entry-list">
        {state.members.map(m=>editId===m.id?(
          <div key={m.id} style={{display:"grid",gap:8,padding:12,background:"#fff7e8",border:"1px solid #d4ad5c",borderRadius:8}}>
            <FieldGrid cols={3}>
              <Lbl label="姓名"><Inp value={form.name??""} onChange={v=>setForm(p=>({...p,name:v}))}/></Lbl>
              <Lbl label="关系"><Sel value={form.relation??"本人"} onChange={v=>setForm(p=>({...p,relation:v as Member["relation"]}))} opts={RELATIONS}/></Lbl>
              {form.relation==="自定义"&&<Lbl label="自定义"><Inp value={form.customRelation??""} onChange={v=>setForm(p=>({...p,customRelation:v}))}/></Lbl>}
            </FieldGrid>
            <div className="ff-row-actions">
              <button type="button" className="ff-ghost-button" onClick={save}>保存成员</button>
              <button type="button" className="ff-ghost-button" onClick={()=>{setEditId(null);setForm({});}}>取消</button>
            </div>
          </div>
        ):(
          <div key={m.id} className="ff-entry-row">
            <div className="ff-entry-main"><strong>{m.name}</strong><span>{m.customRelation||m.relation}</span></div>
            <div className="ff-row-actions">
              <IconBtn onClick={()=>{setEditId(m.id);setForm({...m});}}>✏️</IconBtn>
              <IconBtn danger onClick={()=>del(m.id)}>🗑️</IconBtn>
            </div>
          </div>
        ))}
        {editId==="__new__"&&(
          <div style={{display:"grid",gap:8,padding:12,background:"#fff7e8",border:"1px solid #d4ad5c",borderRadius:8}}>
            <FieldGrid cols={3}>
              <Lbl label="姓名"><Inp value={form.name??""} onChange={v=>setForm(p=>({...p,name:v}))}/></Lbl>
              <Lbl label="关系"><Sel value={form.relation??"本人"} onChange={v=>setForm(p=>({...p,relation:v as Member["relation"]}))} opts={RELATIONS}/></Lbl>
              {form.relation==="自定义"&&<Lbl label="自定义"><Inp value={form.customRelation??""} onChange={v=>setForm(p=>({...p,customRelation:v}))}/></Lbl>}
            </FieldGrid>
            <div className="ff-row-actions">
              <button type="button" className="ff-ghost-button" onClick={save}>保存成员</button>
              <button type="button" className="ff-ghost-button" onClick={()=>{setEditId(null);setForm({});}}>取消</button>
            </div>
          </div>
        )}
      </div>
      <div className="ff-action-row">
        <button type="button" className="ff-ghost-button" onClick={()=>{setEditId("__new__");setForm({relation:"本人"});}}>+ 添加成员</button>
      </div>
    </Panel>
  );
}

// ── Asset Panel ───────────────────────────────────────────────
export function AssetPanel({state,update}:{state:AppState;update:Upd}){
  const upsert=(item:Asset)=>update({assets:state.assets.find(a=>a.id===item.id)?state.assets.map(a=>a.id===item.id?item:a):[...state.assets,item]});
  const del=(id:string)=>update({assets:state.assets.filter(a=>a.id!==id)});
  return(
    <Panel title="💰 资产" sub="支持股票账户、市值、房产、股权等分类录入">
      <EntryList<Asset> items={state.assets} members={state.members} emptyLabel="还没有资产"
        defaultForm={{ownerId:"family",category:"现金存款",name:"",amount:0,currency:state.baseCurrency}}
        renderMeta={a=><><strong>{a.name||a.category}</strong><span>{a.category} · {a.amount.toLocaleString()} {a.currency}</span></>}
        onUpsert={upsert} onDelete={del}
        formFields={(form,set)=><>
          <Lbl label="类别"><Sel value={form.category??"现金存款"} onChange={v=>set({category:v as Asset["category"]})} opts={ASSET_CATS}/></Lbl>
          <Lbl label="名称"><Inp value={form.name??""} onChange={v=>set({name:v})} placeholder="如汇丰、富途"/></Lbl>
          <Lbl label="金额"><Inp type="number" value={form.amount??0} onChange={v=>set({amount:parseFloat(v)||0})}/></Lbl>
          <Lbl label="货币"><Sel value={form.currency??state.baseCurrency} onChange={v=>set({currency:v})} opts={CURRENCIES}/></Lbl>
        </>}
      />
    </Panel>
  );
}

// ── Liability Panel ───────────────────────────────────────────
export function LiabPanel({state,update}:{state:AppState;update:Upd}){
  const upsert=(item:Liability)=>update({liabilities:state.liabilities.find(l=>l.id===item.id)?state.liabilities.map(l=>l.id===item.id?item:l):[...state.liabilities,item]});
  const del=(id:string)=>update({liabilities:state.liabilities.filter(l=>l.id!==id)});
  return(
    <Panel title="🏦 负债" sub="只录入负债本金，不再填写月供">
      <EntryList<Liability> items={state.liabilities} members={state.members} emptyLabel="还没有负债"
        defaultForm={{ownerId:"family",category:"房贷",name:"",amount:0,currency:state.baseCurrency}}
        renderMeta={l=><><strong>{l.name||l.category}</strong><span>{l.category} · 本金 {l.amount.toLocaleString()} {l.currency}</span></>}
        onUpsert={upsert} onDelete={del}
        formFields={(form,set)=><>
          <Lbl label="类别"><Sel value={form.category??"房贷"} onChange={v=>set({category:v as Liability["category"]})} opts={LIAB_CATS}/></Lbl>
          <Lbl label="名称"><Inp value={form.name??""} onChange={v=>set({name:v})}/></Lbl>
          <Lbl label="本金"><Inp type="number" value={form.amount??0} onChange={v=>set({amount:parseFloat(v)||0})}/></Lbl>
          <Lbl label="货币"><Sel value={form.currency??state.baseCurrency} onChange={v=>set({currency:v})} opts={CURRENCIES}/></Lbl>
        </>}
      />
    </Panel>
  );
}

// ── Cashflow Panel ────────────────────────────────────────────
export function CashflowPanel({state,update}:{state:AppState;update:Upd}){
  const upsert=(item:Cashflow)=>update({cashflows:state.cashflows.find(c=>c.id===item.id)?state.cashflows.map(c=>c.id===item.id?item:c):[...state.cashflows,item]});
  const del=(id:string)=>update({cashflows:state.cashflows.filter(c=>c.id!==id)});
  return(
    <Panel title="📈 被动现金流" sub="保险年金、股息分红、租金收入等月度现金流">
      <EntryList<Cashflow> items={state.cashflows} members={state.members} emptyLabel="还没有被动收入"
        defaultForm={{ownerId:"family",category:"股息分红",name:"",monthlyAmount:0,currency:state.baseCurrency}}
        renderMeta={c=><><strong>{c.name||c.category}</strong><span>{c.category} · 月收 {c.monthlyAmount.toLocaleString()} {c.currency}</span></>}
        onUpsert={upsert} onDelete={del}
        formFields={(form,set)=><>
          <Lbl label="类别"><Sel value={form.category??"股息分红"} onChange={v=>set({category:v as Cashflow["category"]})} opts={CF_CATS}/></Lbl>
          <Lbl label="来源名称"><Inp value={form.name??""} onChange={v=>set({name:v})}/></Lbl>
          <Lbl label="月金额"><Inp type="number" value={form.monthlyAmount??0} onChange={v=>set({monthlyAmount:parseFloat(v)||0})}/></Lbl>
          <Lbl label="货币"><Sel value={form.currency??state.baseCurrency} onChange={v=>set({currency:v})} opts={CURRENCIES}/></Lbl>
        </>}
      />
    </Panel>
  );
}

// ── Expense Panel ─────────────────────────────────────────────
export function ExpensePanel({state,update}:{state:AppState;update:Upd}){
  const upsert=(item:Expense)=>update({expenses:state.expenses.find(e=>e.id===item.id)?state.expenses.map(e=>e.id===item.id?item:e):[...state.expenses,item]});
  const del=(id:string)=>update({expenses:state.expenses.filter(e=>e.id!==id)});
  return(
    <Panel title="💸 支出" sub="家庭日常、赡养父母、房贷月供、保险保费等">
      <EntryList<Expense> items={state.expenses} members={state.members} emptyLabel="还没有支出"
        defaultForm={{ownerId:"family",category:"家庭日常",name:"",monthlyAmount:0,currency:state.baseCurrency}}
        renderMeta={e=><><strong>{e.name||e.category}</strong><span>{e.category} · 月支 {e.monthlyAmount.toLocaleString()} {e.currency}</span></>}
        onUpsert={upsert} onDelete={del}
        formFields={(form,set)=><>
          <Lbl label="类别"><Sel value={form.category??"家庭日常"} onChange={v=>set({category:v as Expense["category"]})} opts={EXP_CATS}/></Lbl>
          <Lbl label="名称"><Inp value={form.name??""} onChange={v=>set({name:v})}/></Lbl>
          <Lbl label="月支出"><Inp type="number" value={form.monthlyAmount??0} onChange={v=>set({monthlyAmount:parseFloat(v)||0})}/></Lbl>
          <Lbl label="货币"><Sel value={form.currency??state.baseCurrency} onChange={v=>set({currency:v})} opts={CURRENCIES}/></Lbl>
        </>}
      />
    </Panel>
  );
}

// ── Insurance Panel ───────────────────────────────────────────
export function InsurancePanel({state,update}:{state:AppState;update:Upd}){
  const upsert=(item:Insurance)=>update({insurances:state.insurances.find(i=>i.id===item.id)?state.insurances.map(i=>i.id===item.id?item:i):[...state.insurances,item]});
  const del=(id:string)=>update({insurances:state.insurances.filter(i=>i.id!==id)});
  return(
    <Panel title="🛡️ 保障保险" sub="按保额录入人寿、重疾、意外、医疗保障">
      <EntryList<Insurance> items={state.insurances} members={state.members} emptyLabel="还没有保险"
        defaultForm={{ownerId:"family",category:"人寿保险",name:"",coverageAmount:0,currency:state.baseCurrency}}
        renderMeta={i=><><strong>{i.name||i.category}</strong><span>{i.category} · 保额 {i.coverageAmount.toLocaleString()} {i.currency}</span></>}
        onUpsert={upsert} onDelete={del}
        formFields={(form,set)=><>
          <Lbl label="类别"><Sel value={form.category??"人寿保险"} onChange={v=>set({category:v as Insurance["category"]})} opts={INS_CATS}/></Lbl>
          <Lbl label="保险名称"><Inp value={form.name??""} onChange={v=>set({name:v})}/></Lbl>
          <Lbl label="保额"><Inp type="number" value={form.coverageAmount??0} onChange={v=>set({coverageAmount:parseFloat(v)||0})}/></Lbl>
          <Lbl label="货币"><Sel value={form.currency??state.baseCurrency} onChange={v=>set({currency:v})} opts={CURRENCIES}/></Lbl>
        </>}
      />
    </Panel>
  );
}

// ── Active Income Panel ───────────────────────────────────────
import type {ActiveIncome} from "@/features/_family-finance/core";
import {ACTIVE_INCOME_CATS} from "@/features/_family-finance/core";

export function ActiveIncomePanel({state,update}:{state:AppState;update:Upd}){
  const upsert=(item:ActiveIncome)=>update({activeIncomes:(state.activeIncomes??[]).find(a=>a.id===item.id)?(state.activeIncomes??[]).map(a=>a.id===item.id?item:a):[...(state.activeIncomes??[]),item]});
  const del=(id:string)=>update({activeIncomes:(state.activeIncomes??[]).filter(a=>a.id!==id)});
  return(
    <Panel title="💼 主动收入" sub="工资薪酬、经营收入、兼职等每月主动所得">
      <EntryList<ActiveIncome> items={state.activeIncomes??[]} members={state.members} emptyLabel="还没有主动收入记录"
        defaultForm={{ownerId:"family",category:"工资薪酬",name:"",monthlyAmount:0,currency:state.baseCurrency}}
        renderMeta={a=><><strong>{a.name||a.category}</strong><span>{a.category} · 月入 {a.monthlyAmount.toLocaleString()} {a.currency}</span></>}
        onUpsert={upsert} onDelete={del}
        formFields={(form,set)=><>
          <Lbl label="类别"><Sel value={form.category??"工资薪酬"} onChange={v=>set({category:v as ActiveIncome["category"]})} opts={ACTIVE_INCOME_CATS}/></Lbl>
          <Lbl label="名称"><Inp value={form.name??""} onChange={v=>set({name:v})} placeholder="如 Derek 薪酬"/></Lbl>
          <Lbl label="月金额"><Inp type="number" value={form.monthlyAmount??0} onChange={v=>set({monthlyAmount:parseFloat(v)||0})}/></Lbl>
          <Lbl label="货币"><Sel value={form.currency??state.baseCurrency} onChange={v=>set({currency:v})} opts={CURRENCIES}/></Lbl>
        </>}
      />
    </Panel>
  );
}
