"use client"
import { useEffect, useState } from "react"
import Link from "next/link"

interface HealthData {
  savings_rate: number; savings_rate_label: string
  emergency_months: number; emergency_label: string
  debt_ratio: number; debt_ratio_label: string
  insurance_gap_label: string; net_worth: number; net_worth_label: string
}
interface AllocationItem { label: string; pct: number; example: string }
interface Template { id: number; name: string; emoji: string; description: string; allocation: AllocationItem[]; insurance: string[] }
interface AssessmentResult { record_id: string; template: Template; health: HealthData; fis_url: string }

function labelColor(l: string) {
  if (l.includes("✅") || l.includes("充裕") || l.includes("充足")) return "text-emerald-500"
  if (l.includes("⚠️") || l.includes("警示") || l.includes("缺口")) return "text-amber-500"
  return "text-red-500"
}

// ─── 3. 量化计算（PV折现法） ─────────────────────────────────
// 10年内用3.5%，10年以上用5.5%
function pv(fv: number, years: number): { amount: number; rate: number } {
  const rate = years <= 10 ? 0.035 : 0.055
  return { amount: fv / Math.pow(1 + rate, years), rate: years <= 10 ? 3.5 : 5.5 }
}

function buildCaseStudy(result: AssessmentResult, sub: Record<string, string>) {
  const goals: Array<{icon:string;title:string;desc:string;formula:string;target:string}> = []

  const eduCost = sub["edu_annual_cost"]
  const eduChildAge = sub["edu_child_age"]
  const eduDest = sub["edu_destination"]
  if (eduCost || eduDest) {
    const yearMap: Record<string,number> = {"0-5岁":13,"6-10岁":10,"11-13岁":6,"14岁以上":3}
    const costMap: Record<string,number> = {"30万以下":25,"30-50万":40,"50-80万":65,"80-120万":100,"120万以上":150}
    const yrs = yearMap[eduChildAge] ?? 10
    const ac = costMap[eduCost] ?? 65
    const fvTotal = ac * 4
    const { amount: pvNeeded, rate } = pv(fvTotal, yrs)
    goals.push({
      icon:"🎓", title:"子女教育基金",
      desc:`目标地区：${eduDest||"海外"} · 距入学约 ${yrs} 年`,
      formula:`未来需要 HK$${fvTotal}万 ÷ (1+${rate}%)^${yrs}年 = 今日需投入约 HK$${pvNeeded.toFixed(0)}万`,
      target:`今日需专项锁定约 HK$${Math.ceil(pvNeeded/10)*10}万，按 ${rate}% 年化复利增长，${yrs}年后达成 HK$${fvTotal}万目标`,
    })
  }

  const retireAge = sub["retire_age"]
  const retireSpend = sub["retire_monthly_spend"]
  if (retireAge || retireSpend) {
    const ageMap: Record<string,number> = {"45岁以前":44,"45-50岁":48,"51-55岁":53,"56-60岁":58,"60岁以后顺其自然":63}
    const spendMap: Record<string,number> = {"2万以下":1.5,"2-5万":3.5,"5-10万":7.5,"10万以上":15}
    const targetAge = ageMap[retireAge] ?? 55
    const monthly = spendMap[retireSpend] ?? 5
    const annualGap = monthly * 12  // 年缺口（已扣除租金等）
    const pool = annualGap / 0.04  // 4% 安全提取率 → 所需资产池
    const yrsToRetire = Math.max(targetAge - 43, 3)  // 距退休年数（默认当前43岁）
    const { amount: pvNeeded, rate } = pv(pool, yrsToRetire)
    goals.push({
      icon:"🌅", title:"提前退休规划",
      desc:`目标：${targetAge} 岁退休 · 月均被动收入 HK$${monthly}万（缺口部分）`,
      formula:`年缺口 HK$${annualGap}万 ÷ 4%安全提取率 = 所需资产池 HK$${pool}万\n今日所需本金 HK$${pool}万 ÷ (1+${rate}%)^${yrsToRetire}年 ≈ HK$${pvNeeded.toFixed(0)}万`,
      target:`今日需投入约 HK$${Math.ceil(pvNeeded/10)*10}万，按 ${rate}% 年化复利 ${yrsToRetire} 年，退休时积累 HK$${pool}万 资产池（按4%年化提取可维持30年）`,
    })
  }

  const growthReturn = sub["growth_target_return"]
  if (growthReturn && goals.length === 0) {
    goals.push({
      icon:"📈", title:"资产增值目标",
      desc:`年化回报期望：${growthReturn}`,
      formula:`以5.5%年化复利计算，今日HK$100万 → 10年后HK$170万 → 20年后HK$292万`,
      target:`坚持长期投资，20年后资产有望增长近3倍，形成稳定被动收益来源`,
    })
  }
  return goals
}




// ─── 5. FIS预载案例映射 ───────────────────────────────────────
const FIS_CASE_MAP: Record<number, {label:string;portfolio:string}> = {
  1: {label:"稳健收益型示范组合",   portfolio:"稳健收益型示范组合"},
  2: {label:"稳健收益型示范组合",   portfolio:"稳健收益型示范组合"},
  3: {label:"均衡积累型示范组合",   portfolio:"均衡积累型示范组合"},
  4: {label:"积极积累型示范组合",   portfolio:"积极积累型示范组合"},
  5: {label:"积极积累型示范组合",   portfolio:"积极积累型示范组合"},
}

// ─── 三个典型客户案例 ─────────────────────────────────────────
const REFERENCE_CASES = [
  {
    id: "A",
    avatar: "👨‍👩‍👦",
    name: "王先生家庭",
    profile: "43岁 · 已婚 · 一子9岁 · 退休高管",
    assetSummary: "流动资产300万 · 两套物业（自住800万按揭中 + 投资600万已还清）· 净资产约1,400万",
    goals: ["10年后供子英国大学（年均80万，4年合计320万）", "55岁半退休，月均被动收入5万"],
    gap: [
      {label:"教育金今日所需本金",formula:"320万 ÷ (1+3.5%)^10 ≈ 227万",result:"专项锁定227万"},
      {label:"退休资产池今日所需",formula:"(5万×12) ÷ 4%提取率 = 1,200万 → PV ÷(1+5.5%)^12 ≈ 631万",result:"缺口558万靠月储8万弥补"},
    ],
    portfolio: [
      {pct:35, label:"高保证成分保单 / 固定收益类基金（教育金专项）",note:"10年期锁定，到期提取覆盖英国4年学费，保证成分高，到期确定性强"},
      {pct:35, label:"全球均衡基金组合（退休仓）",note:"全球股债混合，5.5%年化目标，退休前持续增值"},
      {pct:20, label:"投资物业变现再配置",note:"出售投资物业释放600万，重新配置为高息债券/REIT组合，将当期收益率从~2%（租金回报）提升至4-5%"},
      {pct:10, label:"货币/短债备用金",note:"覆盖6个月紧急备用"},
    ],
    insurance: "重疾险：夫妻各200万 ✅  孩子100万 ✅  寿险：待核查（建议补足至年收入×10倍）",
    advisorNote: "核心策略：投资物业租金回报仅~2%，变现后重新配置可提升当期收益至4-5%，同时释放流动性。教育金用高保证成分保单锁定，10年后提取确定性极高；退休仓用全球基金长线积累。资产结构从「重物业」转向「高流动+高收益」。",
    matchTemplates: [2,3],
  },
  {
    id: "B",
    avatar: "👩‍💼",
    name: "陈小姐",
    profile: "35岁 · 单身 · 专业人士",
    assetSummary: "流动资产200万 · 自住物业400万（无房贷）· 净资产约600万",
    goals: ["50岁财务自由（月被动收入3万，完全覆盖生活开支）"],
    gap: [
      {label:"① 通胀调整（2%/年×15年）",formula:"今日3万/月 × (1+2%)^15 ≈ 4万/月",result:"15年后维持同等生活水准需 HK$4万/月"},
      {label:"② 所需退休资产池（无传承，提取率5.5%）",formula:"(4万×12) ÷ 5.5% ≈ 880万",result:"目标资产池 HK$880万"},
      {label:"③ 现有资产复利增长",formula:"200万 × (1+5.5%)^12 = 380万（本金）+ 月储2.5万定投复利12年 = 492万",result:"12年后（47岁）合计约 HK$872万"},
      {label:"④ 达标判定",formula:"872万 ≥ 880万通胀调整需求的~99%",result:"47岁基本达标 ✅（保持储蓄纪律即可提前3年财务自由）"},
    ],
    portfolio: [
      {pct:55, label:"全球进取股票基金",note:"15年长线积累，年化目标6-7%"},
      {pct:25, label:"香港储蓄分红险",note:"保障+确定收益双功能，50岁起可提取现金价值；同时作为强制储蓄工具锁定纪律"},
      {pct:15, label:"全球债券/REIT",note:"分散波动，补充稳定息差"},
      {pct:5,  label:"货币基金备用",note:"短期流动性储备"},
    ],
    insurance: "重疾险：100万（内地商业险）⚠️ 建议提升至200万+  医疗：内地社保 + 建议补充香港高端医疗险（覆盖境外就医）  寿险：单身低需求，若有父母赡养则需评估",
    advisorNote: "亮点：按当前储蓄节奏，47岁即可达到退休资产池目标（872万 > 829万），比原计划提前3年实现财务自由。最大风险是「储蓄纪律」——建议通过两种强制手段执行：① 每月自动扣款定投（2.5万/月），资金直接转入全球基金组合；② 配置香港储蓄分红险（年缴），以保单合约锁定长期储蓄承诺。医疗险是最优先补充项。",
    matchTemplates: [3,4],
  },
  {
    id: "C",
    avatar: "👴👵",
    name: "李先生夫妇",
    profile: "55岁 · 已婚 · 子女已成年 · 退休高管",
    assetSummary: "流动资产2,000万 · 自住物业约1,000万（已还清）· 净资产约3,000万",
    goals: ["退休生活月均8万（年96万）", "财富定向传承给子女", "子女婚前财产保全", "提前规避潜在遗产税风险"],
    gap: [
      {label:"① 退休年支出",formula:"8万/月 × 12 = 96万/年",result:"年均消耗 HK$96万"},
      {label:"② 退休仓承压测算",formula:"1,500万 × 5-6%目标回报 = 75-90万/年，缺口仅6-21万/年需小幅消耗本金",result:"退休仓可持续30年以上（投资回报几乎覆盖全部支出）"},
      {label:"③ 传承替代与税费拨备",formula:"500万终身寿险保费 → 身故高杠杆赔付约1,000-1,500万",result:"不仅「替代回来」退休消耗的本金，更作为未来内地房产若征收遗产税的专属现金储备"},
    ],
    portfolio: [
      {pct:75, label:"投连险ILAS（退休生活仓）1,500万",note:"子女为第二受保人；稳健基金组合（高息债50%+全球股票50%），年目标回报5-6%（75-90万），几乎覆盖月均8万生活支出"},
      {pct:25, label:"终身人寿险（传承保全仓）500万",note:"子女为受益人；身故赔付1,000-1,500万直接给子女，绕过遗产程序，实现「资产替代」及「税费储备」"},
    ],
    insurance: "投连险：李先生身故→保单权益转给子女（第二受保人），不进入遗产。终身寿险：赔付金不属夫妻共同财产（婚前保全） ✅  应对遗产税：大额免税理赔金直接支付给受益人，提供充足现金流用于缴纳内地1,000万房产的潜在遗产税，避免子女被迫折价卖房换现。",
    advisorNote: "核心架构：「收益覆盖 + 杠杆拨备」。1,500万ILAS年回报5-6%几乎覆盖96万年支出。最大亮点在于500万终身寿险的高杠杆：赔付的1,000万+现金不仅「补回」了退休消耗，更为未来可能出台的房产遗产税提前准备了「专属税费钱包」。子女最终无痛继承所有房产+ILAS剩余+千万理赔金——实现保全、避税、防折价三重目标。",
    matchTemplates: [1,2],
  },
]


function HealthRow({label,value,statusLabel}:{label:string;value:string;statusLabel:string}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/60 last:border-0">
      <span className="text-sm text-foreground/70">{label}</span>
      <div className="text-right">
        {value && <span className="text-sm font-semibold text-card-foreground mr-2">{value}</span>}
        <span className={`text-xs font-medium ${labelColor(statusLabel)}`}>{statusLabel}</span>
      </div>
    </div>
  )
}



// ─── 合规确认弹窗（首次进入时展示）─────────────────────────────────
function ComplianceGateModal({ onAcknowledge }: { onAcknowledge: () => void }) {
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full p-8 space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-xl flex-shrink-0">
            ⚠️
          </div>
          <div>
            <h2 className="text-base font-bold text-card-foreground leading-tight">使用须知 / Terms of Use</h2>
            <p className="text-xs text-foreground/40 mt-0.5">请在继续前阅读以下声明 · Please read before proceeding</p>
          </div>
        </div>
        <div className="bg-amber-500/6 border border-amber-500/20 rounded-xl px-4 py-4">
          <p className="text-[12.5px] text-foreground/70 leading-relaxed">
            <strong className="text-amber-500">本平台由 Wonder Wisdom. 运营，</strong>
            未持有香港证监会（SFC）任何类别牌照。平台所有内容（包括数据、分析、模型测算及组合参考）
            <strong className="text-foreground/85">仅供信息分享与学习参考之用</strong>，
            不构成任何投资、保险、税务或法律建议，亦不代表任何产品要约。
            <strong className="text-foreground/85">过往表现不代表未来结果。</strong>
          </p>
        </div>
        <div className="bg-primary/5 border border-primary/15 rounded-xl px-4 py-3">
          <p className="text-[11px] text-foreground/45 leading-relaxed">
            This platform is operated by Wonder Wisdom. and is not licensed by the SFC of Hong Kong.
            All information is for educational purposes only and does not constitute investment, insurance,
            legal or tax advice. Consult a licensed advisor before making financial decisions.
            Wonder Wisdom. accepts no liability for any loss from reliance on this information.
          </p>
        </div>
        <button
          id="compliance-acknowledge-btn"
          onClick={onAcknowledge}
          className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          我已阅读并了解，进入平台 →
        </button>
        <p className="text-center text-[11px] text-foreground/25">
          继续使用即表示您同意上述条款 · Continuing constitutes acceptance of the above terms
        </p>
      </div>
    </div>
  )
}

export default function ResultPage() {
  const [result,setResult]=useState<AssessmentResult|null>(null)
  const [sub,setSub]=useState<Record<string,string>>({})
  const [loading,setLoading]=useState(true)

  // ── 合规确认状态（与 FIS Hub 共用同一 localStorage key）──
  const [complianceAcked, setComplianceAcked] = useState(
    () => typeof window !== 'undefined' && !!localStorage.getItem('ww_compliance_acked')
  )
  const handleComplianceAcknowledge = () => {
    localStorage.setItem('ww_compliance_acked', '1')
    setComplianceAcked(true)
  }

  useEffect(()=>{
    const raw=sessionStorage.getItem("assessment_result")
    const rawSub=sessionStorage.getItem("assessment_sub_answers")
    if(raw){try{setResult(JSON.parse(raw))}catch{}}
    if(rawSub){try{setSub(JSON.parse(rawSub))}catch{}}
    setLoading(false)
  },[])

  // ── 合规确认 Gate ──
  if (!complianceAcked) {
    return <ComplianceGateModal onAcknowledge={handleComplianceAcknowledge} />
  }

  if(loading) return (
    <main className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto"/>
        <p className="text-foreground/60">正在生成您的专属财务画像…</p>
      </div>
    </main>
  )

  if(!result) return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="text-center space-y-4">
        <p className="text-foreground/60 text-lg">未找到评估结果，请重新填写问卷</p>
        <Link href="/assessment/questionnaire" className="inline-block px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium">重新开始</Link>
      </div>
    </main>
  )

  const {template,health} = result
  const caseGoals = buildCaseStudy(result, sub)
  const fisCase = FIS_CASE_MAP[template.id]
  const fisUrl = `https://fis.wonderwisdom.online?from=assessment&portfolio=${encodeURIComponent(fisCase.portfolio)}&template=${template.id}`

  return (
    <main className="min-h-screen bg-background text-foreground pb-24">
      {/* Hero */}
      <div className="bg-gradient-to-b from-primary/10 to-transparent px-6 pt-16 pb-12 text-center">
        <div className="text-6xl mb-4">{template.emoji}</div>
        <h1 className="text-3xl md:text-4xl font-semibold text-card-foreground mb-3">您的财富画像：{template.name}</h1>
        <p className="text-base text-foreground/70 max-w-xl mx-auto leading-relaxed">{template.description}</p>
      </div>

      <div className="max-w-3xl mx-auto px-6 space-y-8">

        {/* 财务健康仪表盘 */}
        <section className="bg-card/50 border border-border rounded-3xl p-6">
          <h2 className="text-lg font-semibold text-card-foreground mb-4">📊 家庭财务健康诊断</h2>
          <HealthRow label="储蓄率" value={`${health.savings_rate}%`} statusLabel={health.savings_rate_label}/>
          <HealthRow label="紧急备用金" value={`可覆盖 ${health.emergency_months} 个月`} statusLabel={health.emergency_label}/>
          <HealthRow label="负债收入比（固定支出）" value={`${health.debt_ratio}%`} statusLabel={health.debt_ratio_label}/>
          <HealthRow label="寿险保障缺口" value="" statusLabel={health.insurance_gap_label}/>
          <HealthRow label="净资产成长力" value="" statusLabel={health.net_worth_label}/>
        </section>

        {/* 3. 量化目标分析（含公式） */}
        {caseGoals.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-card-foreground mb-4">🎯 您的目标量化分析</h2>
            <div className="space-y-4">
              {caseGoals.map((g,i)=>(
                <div key={i} className={`rounded-3xl border p-6 ${i===0?"bg-blue-500/5 border-blue-500/20":"bg-amber-500/5 border-amber-500/20"}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-3xl">{g.icon}</span>
                    <div>
                      <h3 className="font-semibold text-card-foreground">{g.title}</h3>
                      <p className="text-sm text-foreground/50">{g.desc}</p>
                    </div>
                  </div>
                  {/* 公式展示 */}
                  <div className="bg-background/50 border border-border/50 rounded-xl px-4 py-2.5 mb-3 font-mono text-xs text-foreground/60">
                    🧮 {g.formula}
                  </div>
                  <div className="bg-background/50 border border-primary/20 rounded-xl px-4 py-2.5 mb-3">
                    <p className="text-xs font-medium text-primary mb-0.5">📌 目标</p>
                    <p className="text-sm font-semibold text-card-foreground">{g.target}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}




        {/* 免责声明 */}
        <div className="bg-amber-500/8 border border-amber-500/20 rounded-2xl px-5 py-4">
          <p className="text-xs text-foreground/50 leading-relaxed">
            ⚠️ <strong className="text-foreground/70">免责声明：</strong>
            本报告（含数字测算）由系统自动生成，<strong>仅供参考，不构成任何投资、保险或法律建议</strong>。
            您的个人信息已严格加密保存，仅供指定顾问联系使用，严格遵守香港 PDPO 条例。
          </p>
        </div>

        {/* 典型客户案例 */}
        <section>
          <h2 className="text-lg font-semibold text-card-foreground mb-1">👥 与您相似的典型客户案例</h2>
          <p className="text-xs text-foreground/40 mb-5">以下为匿名参考案例，数字经适当调整，仅供参考 · 建议与顾问深入沟通个人方案</p>
          <div className="space-y-6">
            {REFERENCE_CASES.map((c) => {
              const isMatch = c.matchTemplates.includes(template.id)
              return (
                <div key={c.id} className={`rounded-3xl border overflow-hidden transition-all ${isMatch ? "border-primary/40 shadow-md shadow-primary/10" : "border-border"}`}>
                  {/* 匹配标签 */}
                  {isMatch && (
                    <div className="bg-primary/10 px-5 py-2 flex items-center gap-2">
                      <span className="text-xs font-medium text-primary">✦ 与您的财务画像高度匹配</span>
                    </div>
                  )}
                  {/* 人物头部 */}
                  <div className="bg-card/60 px-6 py-5 border-b border-border/50">
                    <div className="flex items-center gap-4">
                      <span className="text-4xl">{c.avatar}</span>
                      <div>
                        <h3 className="font-semibold text-card-foreground text-base">{c.name}</h3>
                        <p className="text-xs text-foreground/50 mt-0.5">{c.profile}</p>
                        <p className="text-xs text-foreground/40 mt-0.5">💼 {c.assetSummary}</p>
                      </div>
                    </div>
                  </div>

                  <div className="px-6 py-5 space-y-5 bg-card/30">
                    {/* 核心目标 */}
                    <div>
                      <p className="text-xs font-medium text-foreground/40 uppercase tracking-wider mb-2">核心目标</p>
                      <ul className="space-y-1">
                        {c.goals.map((g,i) => (
                          <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                            <span className="text-primary mt-0.5 flex-shrink-0">›</span>{g}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* 缺口测算 */}
                    <div>
                      <p className="text-xs font-medium text-foreground/40 uppercase tracking-wider mb-2">目标缺口测算</p>
                      <div className="space-y-2">
                        {c.gap.map((g,i) => (
                          <div key={i} className="bg-background/50 border border-border/50 rounded-xl px-4 py-3">
                            <p className="text-xs font-medium text-foreground/60 mb-1">{g.label}</p>
                            <p className="font-mono text-xs text-foreground/50 mb-1">🧮 {g.formula}</p>
                            <p className="text-xs font-semibold text-primary">{g.result}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 组合构建 */}
                    <div>
                      <p className="text-xs font-medium text-foreground/40 uppercase tracking-wider mb-2">参考组合构建</p>
                      <div className="space-y-2">
                        {c.portfolio.map((p,i) => (
                          <div key={i} className="flex items-start gap-3 bg-background/50 border border-border/50 rounded-xl px-4 py-2.5">
                            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                              {p.pct}%
                            </div>
                            <div>
                              <p className="text-sm font-medium text-card-foreground">{p.label}</p>
                              <p className="text-xs text-foreground/45 mt-0.5">{p.note}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 保障结构 */}
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3">
                      <p className="text-xs font-medium text-emerald-500 mb-1">🛡 保障架构</p>
                      <p className="text-xs text-foreground/60 leading-relaxed">{c.insurance}</p>
                    </div>

                    {/* 顾问洞察 */}
                    <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
                      <p className="text-xs font-medium text-primary mb-1">⚡ 顾问核心洞察</p>
                      <p className="text-sm text-foreground/75 leading-relaxed italic">"{c.advisorNote}"</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-foreground/30 text-center mt-4">
            以上案例仅供参考，不构成投资或保险建议。每位客户的情况各不相同，建议预约顾问进行一对一深度规划。
          </p>
        </section>


        {/* 5. FIS沙盘（预载案例） */}
        <section className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-3xl p-6">
          <h2 className="text-lg font-semibold text-card-foreground mb-1">🔬 进入 FIS 专业沙盘推演</h2>
          <p className="text-sm text-foreground/60 mb-2">
            已为您预载与您风险画像最接近的示范组合：
            <strong className="text-card-foreground"> 「{fisCase.label}」</strong>
          </p>
          <p className="text-xs text-foreground/40 mb-5">
            进入后可直接查看该组合的历史表现、现金流推演及各资产权重，并可自行调参对比
          </p>
          <a id="fis-deeplink" href={fisUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">
            查看 {fisCase.label} →
          </a>
        </section>

        {/* 6. 预约顾问 + 微信 */}
        <section className="bg-card/50 border border-border rounded-3xl p-6">
          <h2 className="text-lg font-semibold text-card-foreground mb-2">💬 预约顾问深度解读</h2>
          <p className="text-sm text-foreground/60 mb-5">
            您的顾问已收到通知，将尽快联系您。如需加急，请通过以下方式直接联系：
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 微信 */}
            <div id="wechat-contact"
              className="flex flex-col items-center gap-2 px-4 py-4 rounded-2xl bg-[#07C160] text-white text-center cursor-pointer hover:bg-[#06ad56] transition-colors"
              onClick={()=>alert("微信号：aniuwu224\n请添加好友后告知「来自财务诊断」")}>
              <span className="text-2xl">💬</span>
              <div>
                <p className="text-sm font-semibold">微信深度咨询</p>
                <p className="text-xs opacity-90 tracking-wider">aniuwu224</p>
              </div>
            </div>
            {/* 返回 */}
            <Link href="/assessment"
              className="flex flex-col items-center gap-2 px-4 py-4 rounded-2xl border border-border text-foreground/70 hover:bg-card transition-colors text-center">
              <span className="text-2xl">🏠</span>
              <div>
                <p className="text-sm font-semibold">返回诊断中心</p>
                <p className="text-xs text-foreground/40">重新填写</p>
              </div>
            </Link>
          </div>
          <p className="text-xs text-foreground/30 text-center mt-4">
            工作时间：周一至周五 09:00–18:00（香港时间）
          </p>
        </section>

      </div>

      {/* 极简合规页脚 */}
      <footer className="border-t border-border/30 px-6 py-4 mt-8">
        <div className="max-w-3xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <p className="text-[11px] text-foreground/25">
            © Wonder Wisdom. · 本平台内容仅供参考，不构成投资建议 · For informational purposes only
          </p>
          <button
            onClick={() => {
              localStorage.removeItem('ww_compliance_acked')
              setComplianceAcked(false)
            }}
            className="text-[11px] text-foreground/25 underline hover:text-foreground/50 transition-colors"
          >
            查看免责声明
          </button>
        </div>
      </footer>
    </main>
  )
}
