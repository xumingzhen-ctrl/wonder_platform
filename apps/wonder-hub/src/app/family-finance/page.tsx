"use client";
import {useRef,useMemo} from "react";
import "./styles.css";
import {useAppState,computeDiag,exportToMd,importFromMd,downloadFile} from "@/features/_family-finance/core";
import {FamilyPanel,MembersPanel,AssetPanel,LiabPanel,ActiveIncomePanel,CashflowPanel,ExpensePanel,InsurancePanel} from "./Workspace";
import {Report} from "./Report";

export default function FamilyFinancePage(){
  const {state,update,reset,hydrated}=useAppState();
  const fileRef=useRef<HTMLInputElement>(null);
  const diag=useMemo(()=>computeDiag(state),[state]);

  if(!hydrated) return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Inter,sans-serif"}}>加载中…</div>;

  const handleImport=(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      const restored=importFromMd(ev.target?.result as string);
      if(restored) update(restored);
      else alert("❌ 导入失败，请确认文件是否为 Wonder 家庭财务分析文档。");
    };
    reader.readAsText(file);
    e.target.value="";
  };

  const handleExport=()=>{
    const md=exportToMd(state);
    downloadFile(md,`Wonder家庭财务报告_${state.familyName}_${new Date().toLocaleDateString("zh-CN").replace(/\//g,"-")}.md`);
  };

  const handleReset=()=>{ if(confirm("确认清空所有数据？此操作不可撤销。")) reset(); };

  return(
    <div className="ff-root">
      <div className="ff-app-shell">
        {/* Topbar */}
        <header className="ff-topbar">
          <div className="ff-topbar-main">
            <div className="ff-topbar-title">
              <div className="ff-eyebrow">🔒 隐私优先</div>
              <h1>家庭财务健康分析</h1>
              <p className="ff-title-subtitle">本工具不会存储您输入的任何信息到服务器，数据仅保存在您的浏览器本地，请放心使用。</p>
              <p className="ff-title-subtitle brand-note">Wonder 尊享客户专属</p>
            </div>
            <div className="ff-topbar-actions">
              <button type="button" className="ff-ghost-button" onClick={handleReset}>↩ 重置</button>
              <button type="button" className="ff-ghost-button" onClick={()=>fileRef.current?.click()}>📥 导入文档</button>
              <input ref={fileRef} className="file-input" type="file" accept=".md,text/markdown,text/plain" onChange={handleImport}/>
              <button type="button" className="ff-ghost-button" onClick={handleExport}>📄 导出文档</button>
            </div>
          </div>
          <div className="ff-export-hint">导出文档会生成一份可阅读的 Markdown 记录，并内嵌可恢复的数据；以后导入这份文档，就能直接恢复填写内容和分析结果。</div>
        </header>

        {/* Two-column layout */}
        <main className="ff-layout">
          {/* Left: workspace */}
          <section className="ff-workspace">
            <FamilyPanel state={state} update={update} onRefreshRates={async()=>{}}/>
            <MembersPanel state={state} update={update}/>
            <AssetPanel state={state} update={update}/>
            <LiabPanel state={state} update={update}/>
            <ActiveIncomePanel state={state} update={update}/>
            <CashflowPanel state={state} update={update}/>
            <ExpensePanel state={state} update={update}/>
            <InsurancePanel state={state} update={update}/>
          </section>

          {/* Right: report */}
          <Report diag={diag} state={state}/>
        </main>

        <footer className="ff-page-footer">Wonder · 私人财富管理智库 · 数据本地存储，隐私优先</footer>
      </div>
    </div>
  );
}
