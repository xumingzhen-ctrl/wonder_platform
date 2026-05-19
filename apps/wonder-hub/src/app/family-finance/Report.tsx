"use client";
import type {Diag,AppState} from "@/features/_family-finance/core";
import {fmtCcy,fmtPct,fmtRunway,pieColor,tone,today} from "@/features/_family-finance/core";

// ── Pie Chart (conic-gradient) ────────────────────────────────
function PieChart({slices,total,label,ccy}:{slices:{category:string;value:number}[];total:number;label:string;ccy:string}){
  if(slices.length===0||total===0) return <div style={{padding:"18px 14px",border:"1px dashed #d7c49d",borderRadius:8,color:"#6e6251",background:"#fff7e8",textAlign:"center",fontSize:13}}>暂无数据</div>;
  let angle=0;
  const stops=slices.map((s,i)=>{
    const pct=(s.value/total)*100;
    const start=angle; angle+=pct;
    return `${pieColor(i)} ${start.toFixed(2)}% ${angle.toFixed(2)}%`;
  });
  return(
    <div className="ff-pie-layout">
      <div className="ff-pie-chart" style={{background:`conic-gradient(${stops.join(", ")})`}} aria-label="pie chart">
        <div className="ff-pie-center"><span>合计</span><strong>{fmtCcy(total,ccy)}</strong></div>
      </div>
      <div className="ff-pie-legend">
        {slices.map((s,i)=>(
          <div key={s.category} className="ff-pie-legend-row">
            <div className="ff-pie-legend-name">
              <span className="ff-dot" style={{backgroundColor:pieColor(i)}}/>
              <span>{s.category}</span>
            </div>
            <div className="ff-pie-legend-value">
              <strong>{fmtCcy(s.value,ccy)}</strong>
              <span>{((s.value/total)*100).toFixed(1)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Status Pill ───────────────────────────────────────────────
function Pill({t,children}:{t:string;children:React.ReactNode}){
  return <span className={`ff-status-pill ${t}`}>{children}</span>;
}

// ── Diagnosis Table ───────────────────────────────────────────
interface DiagRow{emoji:string;label:string;result:string;reference:string;note:string;tone:string}
function DiagTable({title,colorClass,rows}:{title:string;colorClass:string;rows:DiagRow[]}){
  return(
    <div className="ff-panel ff-diagnosis-table-block">
      <div className={`ff-diagnosis-title ${colorClass}`}>{title}</div>
      <div className="ff-diagnosis-grid">
        <div className="ff-diagnosis-row head">
          <div>科目</div><div>诊断结果</div><div>合理参考</div><div>说明</div>
        </div>
        {rows.map(r=>(
          <div key={r.label} className="ff-diagnosis-row">
            <div className="ff-diagnosis-label">
              <span className="ff-diagnosis-emoji">{r.emoji}</span>{r.label}
            </div>
            <div><Pill t={r.tone}>{r.result}</Pill></div>
            <div className="ff-diagnosis-reference">{r.reference}</div>
            <div className="ff-diagnosis-note">{r.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Member Bars ───────────────────────────────────────────────
function MemberBars({members,ccy}:{members:Diag["memberNets"];ccy:string}){
  if(members.length===0) return null;
  const max=Math.max(...members.map(m=>Math.abs(m.assets-m.liabilities)),1);
  return(
    <div className="ff-bars">
      {members.map((m,i)=>{
        const net=m.assets-m.liabilities;
        const pct=Math.abs(net)/max*100;
        return(
          <div key={m.id} className="ff-member-row">
            <div className="ff-member-head">
              <strong>{m.name}</strong>
              <span className="ff-member-net" style={{color:net<0?"#a33832":undefined}}>{fmtCcy(net,ccy)}</span>
            </div>
            <div className="ff-member-sub">
              <span>资产 {fmtCcy(m.assets,ccy)}</span>
              <span>负债 {fmtCcy(m.liabilities,ccy)}</span>
            </div>
            <div className="ff-bar-track">
              <div className="ff-bar-fill" style={{width:`${pct}%`,backgroundColor:net<0?"#e2bba8":pieColor(i)}}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Report ───────────────────────────────────────────────
export function Report({diag,state}:{diag:Diag;state:AppState}){
  const ccy=state.baseCurrency;
  const hasData=diag.totalAssets>0||diag.totalLiabilities>0||diag.monthlyNeed>0;
  const alertCount=[
    diag.runway<6&&diag.monthlyNeed>0,
    diag.passiveCoverage<0.3&&diag.monthlyNeed>0,
    diag.protectionGap>0,
    diag.debtRatio>0.5&&diag.totalAssets>0,
  ].filter(Boolean).length;
  const callout=alertCount>0?`需要优先关注 ${alertCount} 项风险指标`:"整体结构较稳健，可继续保持当前配置。";

  return(
    <div className="ff-preview">
      {/* Summary Block */}
      <div className="ff-summary-block">
        <div className="ff-summary-head">
          <div>
            <div className="ff-eyebrow">📊 家庭财务诊断分析报告</div>
            <h2>{state.familyName}</h2>
          </div>
          <div className="ff-report-meta">
            <span>分析日期：{today()}</span>
            <span>基准货币：{ccy}</span>
          </div>
        </div>
        <div className="ff-diagnosis-callout">
          <strong>{callout}</strong>
          <span>重点看应急能力、被动现金流覆盖和保障缺口。</span>
        </div>
        <div className="ff-metric-grid">
          <div className="ff-metric teal"><div className="ff-metric-label">总资产</div><div className="ff-metric-value">{fmtCcy(diag.totalAssets,ccy)}</div></div>
          <div className="ff-metric rose"><div className="ff-metric-label">总负债</div><div className="ff-metric-value">{fmtCcy(diag.totalLiabilities,ccy)}</div></div>
          <div className="ff-metric slate"><div className="ff-metric-label">净资产</div><div className="ff-metric-value">{fmtCcy(diag.netWorth,ccy)}</div></div>
          <div className="ff-metric amber"><div className="ff-metric-label">月必要支出</div><div className="ff-metric-value">{fmtCcy(diag.monthlyNeed,ccy)}</div></div>
        </div>
        <div className="ff-mini-metric-row">
          <div className="ff-mini-metric"><span>流动资产</span><strong>{fmtCcy(diag.liquidAssets,ccy)}</strong></div>
          <div className="ff-mini-metric"><span>应急能力</span><strong>{fmtRunway(diag.runway)}</strong></div>
          <div className="ff-mini-metric"><span>月主动收入</span><strong>{diag.totalActiveIncome>0?fmtCcy(diag.totalActiveIncome,ccy):"未录入"}</strong></div>
          <div className="ff-mini-metric"><span>被动现金流</span><strong>{fmtCcy(diag.totalPassiveCashflow,ccy)}</strong></div>
          <div className="ff-mini-metric"><span>月总收入</span><strong>{diag.totalIncome>0?fmtCcy(diag.totalIncome,ccy):"未录入"}</strong></div>
          <div className="ff-mini-metric"><span>总保额</span><strong>{fmtCcy(diag.protectionTotal,ccy)}</strong></div>
        </div>
      </div>

      {/* Diagnosis Tables */}
      <DiagTable title="资产负债科目" colorClass="orange" rows={[
        {emoji:"⚖️",label:"负债率",result:fmtPct(diag.debtRatio),reference:"0% - 50%",note:"越低越稳健",tone:tone(diag.debtRatio,"low",.5)},
        {emoji:"🏠",label:"房产占比",result:fmtPct(diag.propertyRatio),reference:"30% - 50%",note:"重资产占比过高会压低灵活性",tone:tone(diag.propertyRatio,"range",[.3,.5])},
        {emoji:"📈",label:"股票占比",result:fmtPct(diag.stockRatio),reference:"10% - 30%",note:"用于观察权益类配置是否合适",tone:tone(diag.stockRatio,"range",[.1,.3])},
        {emoji:"🌍",label:"外币资产占比",result:fmtPct(diag.foreignAssetRatio),reference:"5% - 20%",note:"以人民币为参照，除人民币外都算外币资产",tone:tone(diag.foreignAssetRatio,"range",[.05,.2])},
        {emoji:"💼",label:"风险资产比例",result:fmtPct(diag.riskAssetRatio),reference:"30% - 70%",note:"房产、股票、基金、股权等合计占比",tone:tone(diag.riskAssetRatio,"range",[.3,.7])},
      ]}/>

      <DiagTable title="主动收入科目" colorClass="orange" rows={[
        {emoji:"💵",label:"月主动收入",result:diag.totalActiveIncome>0?fmtCcy(diag.totalActiveIncome,ccy):"未录入",reference:"请录入收入",note:"工资薪酬、经营收入等主动所得合计",tone:diag.totalActiveIncome>0?"neutral":"warn"},
        {emoji:"📊",label:"储蓄率",result:diag.totalIncome>0?fmtPct(diag.savingsRate):"—",reference:"> 20%",note:"（总收入 - 总支出）/ 总收入，越高越好",tone:diag.totalIncome>0?tone(diag.savingsRate,"high",.2):"neutral"},
        {emoji:"💸",label:"支出占收比",result:diag.totalActiveIncome>0?fmtPct(diag.activeExpenseRatio):"—",reference:"< 80%",note:"月总支出 / 月主动收入，控制在 80% 以内",tone:diag.totalActiveIncome>0?tone(diag.activeExpenseRatio,"low",.8):"neutral"},
        {emoji:"🔄",label:"被动替代率",result:diag.totalActiveIncome>0?fmtPct(diag.passiveReplaceRatio):"—",reference:"> 30%",note:"被动收入 / 主动收入，反映财务独立进度",tone:diag.totalActiveIncome>0?tone(diag.passiveReplaceRatio,"high",.3):"neutral"},
        {emoji:"🏆",label:"财务自由进度",result:diag.totalIncome>0?fmtPct(diag.financialFreedomPct):"—",reference:"> 50%",note:"被动收入占总收入比，100% 即财务自由",tone:diag.totalIncome>0?tone(diag.financialFreedomPct,"high",.5):"neutral"},
      ]}/>

      <DiagTable title="收入支出科目" colorClass="blue" rows={[
        {emoji:"🛟",label:"应急能力",result:fmtRunway(diag.runway),reference:"3 - 6个月",note:"流动资产 / 月必要支出",tone:tone(diag.runway,"range",[3,6])},
        {emoji:"💰",label:"被动现金流覆盖率",result:fmtPct(diag.passiveCoverage),reference:"> 30%",note:"被动现金流 / 月必要支出",tone:tone(diag.passiveCoverage,"high",.3)},
        {emoji:"🏦",label:"房贷月供占比",result:fmtPct(diag.mortgageRatio),reference:"30% - 50%",note:"月供对总支出的压力",tone:tone(diag.mortgageRatio,"range",[.3,.5])},
        {emoji:"🛡️",label:"保险保费占比",result:fmtPct(diag.insurancePremiumRatio),reference:"10% - 20%",note:"保费过低会影响保障，过高会挤压现金流",tone:tone(diag.insurancePremiumRatio,"range",[.1,.2])},
        {emoji:"📊",label:"月度结余",result:fmtCcy(diag.totalIncome-diag.monthlyNeed,ccy),reference:"> 0",note:"总收入减去总支出",tone:tone(diag.totalIncome-diag.monthlyNeed,"high",0)},
      ]}/>

      <DiagTable title="保障科目" colorClass="cyan" rows={[
        {emoji:"🛡️",label:"总保额覆盖率",result:fmtPct(diag.protectionCoverage),reference:">= 100%",note:"人寿+重疾保额，建议覆盖10年必要支出+负债",tone:tone(diag.protectionCoverage,"high",1)},
        {emoji:"🧩",label:"保障缺口",result:fmtCcy(diag.protectionGap,ccy),reference:"越低越好",note:"如果大于 0，说明保障仍需补足",tone:tone(diag.protectionGap,"low",0)},
        {emoji:"❤️",label:"寿险覆盖负债",result:hasData?"—":"—",reference:"覆盖主要负债",note:"用于观察生命价值保障是否足够",tone:"neutral"},
      ]}/>

      {/* Charts */}
      {diag.incomeSlices.length>0&&(
        <div className="ff-panel">
          <div className="ff-section-title">主动收入结构</div>
          <PieChart slices={diag.incomeSlices} total={diag.totalActiveIncome} label="主动收入" ccy={ccy}/>
        </div>
      )}
      {diag.assetSlices.length>0&&(
        <div className="ff-panel">
          <div className="ff-section-title">资产分布</div>
          <PieChart slices={diag.assetSlices} total={diag.totalAssets} label="资产分布" ccy={ccy}/>
        </div>
      )}
      {diag.expSlices.length>0&&(
        <div className="ff-panel">
          <div className="ff-section-title">支出结构</div>
          <PieChart slices={diag.expSlices} total={diag.monthlyNeed} label="支出结构" ccy={ccy}/>
        </div>
      )}
      {diag.cfSlices.length>0&&(
        <div className="ff-panel">
          <div className="ff-section-title">被动现金流结构</div>
          <PieChart slices={diag.cfSlices} total={diag.totalPassiveCashflow} label="被动现金流" ccy={ccy}/>
        </div>
      )}
      {diag.insSlices.length>0&&(
        <div className="ff-panel">
          <div className="ff-section-title">保障结构</div>
          <PieChart slices={diag.insSlices} total={diag.insSlices.reduce((s,i)=>s+i.value,0)} label="保障结构" ccy={ccy}/>
        </div>
      )}
      {diag.memberNets.length>0&&(
        <div className="ff-panel">
          <div className="ff-section-title">成员净值</div>
          <MemberBars members={diag.memberNets} ccy={ccy}/>
        </div>
      )}

      <div className="ff-preview-footer">Wonder 出品 · Wonder 尊享客户专属</div>
    </div>
  );
}
