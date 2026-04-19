"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

// ─── 目标子问题定义 ─────────────────────────────────────────────
const GOAL_SUB_QUESTIONS: Record<string, { key: string; question: string; options: string[] }[]> = {
  "规划子女教育/留学基金": [
    {
      key: "edu_child_age",
      question: "孩子目前的年龄是？",
      options: ["0-5岁", "6-10岁", "11-13岁", "14岁以上"],
    },
    {
      key: "edu_destination",
      question: "目标就读地区？",
      options: ["香港本地", "中国内地", "英国", "美国/加拿大", "澳洲/新西兰", "新加坡/日本", "其他"],
    },
    {
      key: "edu_annual_cost",
      question: "预计每年学费+生活费（港元）",
      options: ["30万以下", "30-50万", "50-80万", "80-120万", "120万以上"],
    },
  ],
  "为退休建立被动收入": [
    {
      key: "retire_age",
      question: "您希望几岁退休？",
      options: ["45岁以前", "45-50岁", "51-55岁", "56-60岁", "60岁以后顺其自然"],
    },
    {
      key: "retire_monthly_spend",
      question: "退休后期望的月生活水准（港元）",
      options: ["2万以下", "2-5万", "5-10万", "10万以上"],
    },
  ],
  "财富传承/遗产规划": [
    {
      key: "legacy_scale",
      question: "希望传承的资产量级",
      options: ["500万以下", "500-1000万", "1000-3000万", "3000万以上"],
    },
    {
      key: "legacy_beneficiaries",
      question: "受益人数量",
      options: ["1人", "2人", "3人及以上"],
    },
  ],
  "资产增值，对抗通胀": [
    {
      key: "growth_target_return",
      question: "您的年化回报目标期望是？",
      options: ["4-6%（保守增值）", "6-8%（稳健增值）", "8-12%（积极增值）", "12%以上（进取增值）"],
    },
  ],
}

// ─── 问卷数据定义 ──────────────────────────────────────────────
const STAGES = [
  {
    id: "basic",
    title: "基础画像",
    subtitle: "帮助我们快速了解您的家庭结构",
    color: "from-blue-500/20 to-blue-600/10",
    questions: [
      {
        key: "q1_family_type",
        question: "您的家庭结构是？",
        options: ["单身，无赡养负担", "已婚，暂无子女", "已婚，有子女（18岁以下）", "子女已成年，临近退休", "退休或半退休"],
      },
      {
        key: "q2_age_range",
        question: "您（家庭主理人）的年龄段是？",
        options: ["25岁以下", "25-35岁", "36-45岁", "46-55岁", "55岁以上"],
      },
    ],
  },
  {
    id: "financial",
    title: "财务数据",
    subtitle: "这是核心诊断依据，数据越准确，建议越精准",
    color: "from-amber-500/20 to-amber-600/10",
    questions: [
      {
        key: "q3_income", question: "家庭月税后总收入（所有成员合计）",
        hint: "包含工资、奖金、租金、分红等所有来源",
        options: ["3万以下", "3-6万", "6-10万", "10-20万", "20-50万", "50万以上"],
      },
      {
        key: "q4_fixed_expense", question: "每月固定刚性支出",
        hint: "房贷/租金、学费、车贷等固定还款合计",
        options: ["5千以下", "5千-1.5万", "1.5-3万", "3-6万", "6万以上"],
      },
      {
        key: "q5_living_expense", question: "每月生活弹性消费",
        hint: "餐饮、购物、娱乐、出行等日常开销",
        options: ["5千以下", "5千-1万", "1-2万", "2-4万", "4万以上"],
      },
      {
        key: "q6_insurance_premium", question: "每月保险保费支出（所有保单合计）",
        options: ["无/几乎没有", "5千以下", "5千-1.5万", "1.5-3万", "3万以上"],
      },
      {
        key: "q7_liquid_asset", question: "流动资产总量",
        hint: "现金 + 银行存款 + 可随时变现的基金/股票",
        options: ["10万以下", "10-50万", "50-200万", "200-500万", "500万以上"],
      },
      {
        key: "q8_property_asset", question: "非流动资产总量",
        hint: "自住物业 + 投资物业的当前市场估值",
        options: ["无", "200万以下", "200-500万", "500-1000万", "1000万以上"],
      },
      {
        key: "q9_total_debt", question: "家庭总负债",
        hint: "按揭余额 + 各类贷款余额合计",
        options: ["无", "50万以下", "50-200万", "200-500万", "500万以上"],
      },
    ],
  },
  {
    id: "insurance",
    title: "保障诊断",
    subtitle: "评估您当前的风险保障状况",
    color: "from-green-500/20 to-green-600/10",
    questions: [
      {
        key: "q10_life_insurance", question: "现有寿险总保额（含雇主团险）",
        options: ["无", "50万以下", "50-200万", "200-500万", "500万以上", "不清楚"],
      },
      {
        key: "q11_critical_illness", question: "现有重大疾病险保额",
        options: ["无", "50万以下", "50-100万", "100-300万", "300万以上", "不清楚"],
      },
      {
        key: "q12_medical", question: "现有医疗险状态",
        options: [
          "无任何医疗险（仅靠储蓄自费）",
          "仅有内地医保（无商业险）",
          "内地医保 + 商业百万医疗险",
          "有香港/离岸私家医院计划",
          "有顶级国际医疗险（无限额/全球覆盖）",
        ],
      },
    ],
  },
  {
    id: "behavior",
    title: "投资目标",
    subtitle: "了解您的核心目标与风险承受力",
    color: "from-purple-500/20 to-purple-600/10",
    questions: [
      {
        key: "q13_goals",
        question: "您最希望实现的财务目标？（最多选2项）",
        hint: "选中后将弹出细化问题，帮助我们量化您的目标",
        multi: true,
        maxSelect: 2,
        hasSubQuestions: true,
        options: [
          "填补保障缺口（寿险/重疾/医疗）",
          "为退休建立被动收入",
          "规划子女教育/留学基金",
          "资产增值，对抗通胀",
          "财富传承/遗产规划",
        ],
      },
      {
        key: "q14_horizon", question: "预计这批资金的投资期限",
        options: ["3年以内（短期）", "3-7年（中期）", "7-15年（长期）", "15年以上（超长期）"],
      },
      {
        key: "q15_risk_reaction",
        question: "投资组合6个月内下跌20%，您会？",
        hint: "晨星经典风险意愿测试",
        options: [
          "立刻赎回，损失已超出我的心理承受范围",
          "赎回一半，将余下资金转入更保守的产品",
          "继续持有，我认为长期来看会回升",
          "加仓，这正是以低价买入的机会",
        ],
      },
      {
        key: "q16_experience", question: "您过往最熟悉的投资产品是？",
        options: [
          "仅有银行存款/货币基金",
          "曾购买过储蓄险/保本型产品",
          "有基金/ETF投资经验",
          "有个股或债券投资经验",
          "有私募/另类资产/海外投资经验",
        ],
      },
    ],
  },
]

const ALL_QUESTIONS = STAGES.flatMap(s => s.questions)

function initAnswers() {
  const a: Record<string, string | string[]> = {}
  ALL_QUESTIONS.forEach(q => { a[q.key] = (q as any).multi ? [] : "" })
  return a
}

// ─── 欢迎 / 免责声明 / 隐私告知页 ───────────────────────────────
function WelcomeScreen({ onAgree }: { onAgree: () => void }) {
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg">
        {/* 品牌头部 */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-6">
            🔒 数据安全 · 专业保密
          </div>
          <h1 className="text-4xl font-semibold text-card-foreground mb-3">家庭财务健康诊断</h1>
          <p className="text-foreground/60 text-base leading-relaxed">
            本问卷由 Wonder 财富管理团队设计，参照国际 CFP 标准，帮助您全面了解家庭的财务健康状况并获取专属配置参考。
          </p>
        </div>

        {/* 须知卡片 */}
        <div className="space-y-4 mb-8">
          {/* 隐私告知 */}
          <div className="bg-card/50 border border-border rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🔐</span>
              <div>
                <h3 className="font-semibold text-card-foreground mb-1">隐私保护声明</h3>
                <p className="text-sm text-foreground/60 leading-relaxed">
                  您填写的所有信息将经过加密处理，仅供您的指定财务顾问查阅，
                  <strong className="text-foreground/80">绝不会向任何第三方披露或用于商业推广</strong>。
                  我们严格遵守香港《个人资料（私隐）条例》（PDPO）的相关规定。
                </p>
              </div>
            </div>
          </div>

          {/* 免责声明 */}
          <div className="bg-amber-500/8 border border-amber-500/20 rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h3 className="font-semibold text-card-foreground mb-1">免责声明</h3>
                <p className="text-sm text-foreground/60 leading-relaxed">
                  本问卷结果及所附资产配置建议<strong className="text-foreground/80">仅供参考，不构成任何投资、保险或法律建议</strong>。
                  任何财务决策均须在持牌专业顾问的指导下，结合您的完整个人情况审慎制定。
                  Wonder 不对依据本报告所作的任何决定承担法律责任。
                </p>
              </div>
            </div>
          </div>

          {/* 问卷说明 */}
          <div className="bg-card/50 border border-border rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <span className="text-2xl">📋</span>
              <div>
                <h3 className="font-semibold text-card-foreground mb-1">问卷说明</h3>
                <ul className="text-sm text-foreground/60 space-y-1 leading-relaxed">
                  <li>· 共 <strong className="text-foreground/80">16 道题</strong>，预计需要 <strong className="text-foreground/80">8-10 分钟</strong></li>
                  <li>· 数据填写越准确，系统给出的参考建议越贴近您的实际情况</li>
                  <li>· 财务数字均采用区间选择，无需填写精确数字</li>
                  <li>· 完成后可生成专属财务画像，并可预约顾问进一步解读</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* 同意按钮 */}
        <button
          id="agree-and-start"
          onClick={onAgree}
          className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-medium text-lg hover:opacity-90 transition-opacity shadow-sm"
        >
          我已阅读并同意，开始诊断 →
        </button>
        <p className="text-center text-xs text-foreground/30 mt-4">
          点击即表示您同意 Wonder 按上述隐私声明处理您的个人信息
        </p>
        <div className="text-center mt-4">
          <Link href="/assessment" className="text-sm text-foreground/40 hover:text-foreground/60">← 返回</Link>
        </div>
      </div>
    </main>
  )
}

// ─── 子问题面板组件 ────────────────────────────────────────────
function SubQuestionPanel({
  goal,
  subAnswers,
  onChange,
}: {
  goal: string
  subAnswers: Record<string, string>
  onChange: (key: string, val: string) => void
}) {
  const subs = GOAL_SUB_QUESTIONS[goal]
  if (!subs) return null
  return (
    <div className="mt-3 ml-9 border-l-2 border-primary/30 pl-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
      {subs.map(sub => (
        <div key={sub.key}>
          <p className="text-xs font-medium text-primary/80 mb-2">→ {sub.question}</p>
          <div className="flex flex-wrap gap-2">
            {sub.options.map(opt => (
              <button
                key={opt}
                onClick={() => onChange(sub.key, opt)}
                className={`text-xs px-3 py-1.5 rounded-xl border transition-all duration-150 font-medium
                  ${subAnswers[sub.key] === opt
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-card/40 text-foreground/60 hover:border-foreground/30"
                  }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function QuestionnairePage() {
  const router = useRouter()
  const [showWelcome, setShowWelcome] = useState(true)
  const [stageIdx, setStageIdx] = useState(0)
  const [qIdxInStage, setQIdxInStage] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>(initAnswers)
  const [subAnswers, setSubAnswers] = useState<Record<string, string>>({})
  const [showContact, setShowContact] = useState(false)
  const [contact, setContact] = useState({ name: "", phone: "", note: "" })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  // 欢迎页优先渲染
  if (showWelcome) return <WelcomeScreen onAgree={() => setShowWelcome(false)} />
  const stage = STAGES[stageIdx]
  const question = stage.questions[qIdxInStage]
  const isMulti = !!(question as any).multi
  const maxSelect = (question as any).maxSelect || 1
  const hasSubQ = !!(question as any).hasSubQuestions
  const currentAnswer = answers[question.key]

  const totalQ = ALL_QUESTIONS.length
  const answeredCount = Object.values(answers).filter(v => Array.isArray(v) ? v.length > 0 : v !== "").length
  const progress = Math.round((answeredCount / totalQ) * 100)

  function selectOption(key: string, opt: string) {
    if (isMulti) {
      setAnswers(prev => {
        const arr = prev[key] as string[]
        if (arr.includes(opt)) {
          // 取消选中时清除该目标的子答案
          const relatedKeys = Object.keys(GOAL_SUB_QUESTIONS[opt] ? GOAL_SUB_QUESTIONS[opt].reduce((acc, s) => ({ ...acc, [s.key]: 1 }), {}) : {})
          setSubAnswers(sa => {
            const next = { ...sa }
            relatedKeys.forEach(k => delete next[k])
            return next
          })
          return { ...prev, [key]: arr.filter(x => x !== opt) }
        }
        if (arr.length >= maxSelect) return prev
        return { ...prev, [key]: [...arr, opt] }
      })
    } else {
      setAnswers(prev => ({ ...prev, [key]: opt }))
      setTimeout(() => advanceQuestion(), 300)
    }
  }

  function setSubAnswer(key: string, val: string) {
    setSubAnswers(prev => ({ ...prev, [key]: val }))
  }

  // 检查 Q13 子问题是否已填完（所有选中目标的子问题都需填写）
  function isQ13SubsComplete(): boolean {
    const selectedGoals = answers["q13_goals"] as string[]
    for (const goal of selectedGoals) {
      const subs = GOAL_SUB_QUESTIONS[goal]
      if (!subs) continue
      for (const sub of subs) {
        if (!subAnswers[sub.key]) return false
      }
    }
    return true
  }

  const canProceed = isMulti
    ? (currentAnswer as string[]).length > 0 && (!hasSubQ || isQ13SubsComplete())
    : currentAnswer !== ""

  function advanceQuestion() {
    const stageQs = STAGES[stageIdx].questions
    if (qIdxInStage < stageQs.length - 1) {
      setQIdxInStage(q => q + 1)
    } else if (stageIdx < STAGES.length - 1) {
      setStageIdx(s => s + 1)
      setQIdxInStage(0)
    } else {
      setShowContact(true)
    }
  }

  function goBack() {
    if (showContact) { setShowContact(false); return }
    if (qIdxInStage > 0) { setQIdxInStage(q => q - 1); return }
    if (stageIdx > 0) {
      setStageIdx(s => s - 1)
      setQIdxInStage(STAGES[stageIdx - 1].questions.length - 1)
    }
  }

  async function handleSubmit() {
    if (!contact.name || !contact.phone) { setError("请填写姓名和联系方式"); return }
    setSubmitting(true); setError("")
    try {
      const payload = {
        ...answers,
        ...subAnswers, // 子问题答案一并提交
        contact_name: contact.name,
        contact_phone: contact.phone,
        contact_note: contact.note,
      }
      const res = await fetch("/api/assessment/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error("提交失败")
      const data = await res.json()
      sessionStorage.setItem("assessment_result", JSON.stringify(data))
      sessionStorage.setItem("assessment_sub_answers", JSON.stringify(subAnswers))
      router.push("/assessment/result")
    } catch {
      setError("提交时出现问题，请稍后重试")
    } finally {
      setSubmitting(false)
    }
  }

  // ─── 留资页 ────────────────────────────────────────────────
  if (showContact) {
    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg">
          <div className="mb-8 text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-3xl font-semibold text-card-foreground mb-2">问卷完成！</h2>
            <p className="text-foreground/70">您的财务画像正在生成中。请留下联系方式，顾问将为您深度解读这份报告。</p>
          </div>
          <div className="bg-card/60 backdrop-blur-sm border border-border rounded-3xl p-8 space-y-5">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-2">您的称呼 *</label>
              <input id="contact-name" className="w-full bg-background/60 border border-border rounded-xl px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="例：张先生 / Ms. Chan" value={contact.name} onChange={e => setContact(c => ({ ...c, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-2">手机 / WhatsApp *</label>
              <input id="contact-phone" className="w-full bg-background/60 border border-border rounded-xl px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="+852 / +86" value={contact.phone} onChange={e => setContact(c => ({ ...c, phone: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-2">补充说明（选填）</label>
              <textarea id="contact-note" className="w-full bg-background/60 border border-border rounded-xl px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" rows={3} placeholder="例：希望重点了解退休规划、或子女教育基金方案…" value={contact.note} onChange={e => setContact(c => ({ ...c, note: e.target.value }))} />
            </div>
            <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 text-xs text-foreground/60 leading-relaxed">
              🔒 您的个人信息将严格保密，仅用于专属顾问联系，不作任何其他用途。
            </div>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button id="submit-assessment" onClick={handleSubmit} disabled={submitting} className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-medium text-lg hover:opacity-90 transition-opacity disabled:opacity-50">
              {submitting ? "正在生成您的专属报告…" : "生成我的财务画像 →"}
            </button>
            <button onClick={goBack} className="w-full text-sm text-foreground/50 hover:text-foreground/80 transition-colors">← 返回修改答案</button>
          </div>
        </div>
      </main>
    )
  }

  // ─── 问卷主体 ──────────────────────────────────────────────
  const selectedGoals = (answers["q13_goals"] || []) as string[]

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col">
      {/* 顶部进度条 */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Link href="/assessment" className="text-foreground/50 hover:text-foreground text-sm">✕</Link>
          <div className="flex-1 bg-border rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs text-foreground/50 tabular-nums">{answeredCount}/{totalQ}</span>
        </div>
      </div>

      {/* 阶段指示器 */}
      <div className="pt-20 pb-4 px-6">
        <div className="max-w-2xl mx-auto flex gap-2">
          {STAGES.map((s, i) => (
            <div key={s.id} className={`flex-1 h-1 rounded-full transition-all duration-300 ${i <= stageIdx ? "bg-primary" : "bg-border"}`} />
          ))}
        </div>
        <div className="max-w-2xl mx-auto mt-3">
          <span className={`inline-block text-xs font-medium px-3 py-1 rounded-full bg-gradient-to-r ${stage.color} text-foreground/80`}>
            第 {stageIdx + 1} 阶段 · {stage.title}
          </span>
        </div>
      </div>

      {/* 问题主体 */}
      <div className="flex-1 flex items-start justify-center px-6 py-8">
        <div className="w-full max-w-2xl">
          <div className="mb-8">
            <p className="text-xs text-foreground/40 mb-3 uppercase tracking-wider">
              Q{ALL_QUESTIONS.findIndex(q => q.key === question.key) + 1} · {stage.subtitle}
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold text-card-foreground leading-snug">{question.question}</h2>
            {(question as any).hint && <p className="mt-2 text-sm text-foreground/50">{(question as any).hint}</p>}
          </div>

          {/* 选项列表 */}
          <div className="space-y-3">
            {question.options.map(opt => {
              const selected = isMulti ? (currentAnswer as string[]).includes(opt) : currentAnswer === opt
              return (
                <div key={opt}>
                  <button
                    id={`opt-${question.key}-${opt.substring(0, 10).replace(/\s/g, "_")}`}
                    onClick={() => selectOption(question.key, opt)}
                    className={`w-full text-left px-6 py-4 rounded-2xl border transition-all duration-200 text-base font-medium
                      ${selected
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border bg-card/40 text-foreground/80 hover:bg-card hover:border-foreground/20"
                      }`}
                  >
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full border mr-3 text-xs flex-shrink-0 align-middle
                      ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                      {selected ? "✓" : ""}
                    </span>
                    {opt}
                  </button>
                  {/* Q13 选中后展开子问题 */}
                  {hasSubQ && selected && GOAL_SUB_QUESTIONS[opt] && (
                    <SubQuestionPanel
                      goal={opt}
                      subAnswers={subAnswers}
                      onChange={setSubAnswer}
                    />
                  )}
                </div>
              )
            })}
          </div>

          {/* 多选继续按钮 */}
          {isMulti && (
            <div className="mt-6">
              {hasSubQ && selectedGoals.length > 0 && !isQ13SubsComplete() && (
                <p className="text-xs text-amber-500 text-center mb-3">⚠️ 请完成所有选中目标的细化问题后继续</p>
              )}
              <button
                id="multi-next"
                onClick={advanceQuestion}
                disabled={!canProceed}
                className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-medium text-lg hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                继续 →
              </button>
            </div>
          )}

          {(stageIdx > 0 || qIdxInStage > 0) && (
            <button onClick={goBack} className="mt-4 w-full text-sm text-foreground/40 hover:text-foreground/70 transition-colors">
              ← 上一题
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
