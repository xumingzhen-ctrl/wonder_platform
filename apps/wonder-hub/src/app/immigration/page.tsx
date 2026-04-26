"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { content, Lang } from "./content"

// ── 语言检测 ──────────────────────────────────────────────────────
async function detectLang(): Promise<Lang> {
  try {
    const saved = localStorage.getItem("immigration_lang") as Lang | null
    if (saved && ["zh", "en", "ar"].includes(saved)) return saved
    const res = await fetch("/api/geo")
    if (res.ok) {
      const { lang } = await res.json()
      return lang as Lang
    }
  } catch {}
  return "zh"
}

// ── 圆环图组件 ─────────────────────────────────────────────────────
function DonutChart({ items }: { items: { pct: string; label: string; amount: string; color: string }[] }) {
  const radius = 70, cx = 90, cy = 90, strokeW = 28
  const circumference = 2 * Math.PI * radius
  const pcts = [10, 90]
  let offset = 0
  return (
    <svg viewBox="0 0 180 180" className="w-44 h-44">
      {items.map((item, i) => {
        const dash = (pcts[i] / 100) * circumference
        const el = (
          <circle
            key={i}
            cx={cx} cy={cy} r={radius}
            fill="none"
            stroke={item.color}
            strokeWidth={strokeW}
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset * circumference / 100}
            strokeLinecap="butt"
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        )
        offset += pcts[i]
        return el
      })}
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize="14" fill="#111" fontWeight="700">HK$30M</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="10" fill="#666" fontWeight="500">总投资额</text>
    </svg>
  )
}

// ── 时间轴组件 ─────────────────────────────────────────────────────
function Timeline({ steps, dir }: { steps: { year: string; label: string; desc: string }[]; dir: "ltr" | "rtl" }) {
  return (
    <div className="relative flex flex-col md:flex-row items-start md:items-center gap-0 md:gap-0">
      {steps.map((step, i) => (
        <div key={i} className="flex flex-col md:flex-row items-start md:items-center flex-1 min-w-0">
          <div className="flex flex-col items-center md:items-start flex-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">
                {i + 1}
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{step.year}</div>
                <div className="font-semibold text-card-foreground">{step.label}</div>
                <div className="text-sm text-muted-foreground">{step.desc}</div>
              </div>
            </div>
          </div>
          {i < steps.length - 1 && (
            <div className="hidden md:block h-px flex-1 bg-border mx-4 mt-5" />
          )}
        </div>
      ))}
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────
export default function ImmigrationPage() {
  const [lang, setLang] = useState<Lang>("zh")
  const [mounted, setMounted] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)

  // 表单状态
  const [formData, setFormData] = useState({ name: "", contact: "", location: "", status: "", message: "" })
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<"success" | "error" | null>(null)

  useEffect(() => {
    detectLang().then(l => { setLang(l); setMounted(true) })
  }, [])

  const switchLang = (l: Lang) => {
    setLang(l)
    localStorage.setItem("immigration_lang", l)
  }

  useEffect(() => {
    if (!mounted) return
    document.documentElement.dir = c.dir
    document.documentElement.lang = lang
  }, [lang, mounted])

  if (!mounted) return null

  const c = content[lang]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setSubmitResult(null)
    try {
      const res = await fetch("/api/contact/immigration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, lang }),
      })
      setSubmitResult(res.ok ? "success" : "error")
    } catch {
      setSubmitResult("error")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">

      {/* ── 语言切换栏 ── */}
      <div className="fixed top-4 right-4 z-50 flex gap-1 bg-card/80 backdrop-blur border border-border rounded-full px-2 py-1">
        {(["zh", "en", "ar"] as Lang[]).map(l => (
          <button
            key={l}
            onClick={() => switchLang(l)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
              lang === l ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {c.nav[l]}
          </button>
        ))}
      </div>

      {/* ── HERO ── */}
      <section className="relative min-h-[95vh] flex flex-col items-center justify-center text-center px-6 overflow-hidden">
        {/* 背景图与遮罩 */}
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat transition-transform duration-1000 hover:scale-105"
          style={{ backgroundImage: "url('/images/hk_skyline.png')" }}
        />
        <div className="absolute inset-0 z-[1] bg-black/50 backdrop-blur-[2px]" />
        <div className="absolute bottom-0 left-0 right-0 h-64 z-[2] bg-gradient-to-t from-background via-background/80 to-transparent" />

        <div className="relative z-10 max-w-5xl mx-auto space-y-10">
          <span className="inline-block px-5 py-2 rounded-full border border-white/20 bg-white/10 text-white text-base font-medium backdrop-blur-md">
            {c.hero.badge}
          </span>
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold text-white leading-tight tracking-tight drop-shadow-2xl">
            {c.hero.title}
          </h1>
          <p className="text-xl md:text-2xl text-white/90 font-light max-w-3xl mx-auto leading-relaxed drop-shadow-lg">
            {c.hero.subtitle}
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center pt-8">
            <button
              onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })}
              className="px-12 py-5 rounded-2xl bg-primary text-white font-bold text-xl hover:scale-105 transition-all shadow-2xl shadow-primary/40 active:scale-95"
            >
              {c.hero.cta1}
            </button>
            <button
              onClick={() => document.getElementById('portfolios')?.scrollIntoView({ behavior: "smooth" })}
              className="px-12 py-5 rounded-2xl border border-white/30 bg-white/10 text-white font-bold text-xl hover:bg-white/20 transition-all backdrop-blur-md active:scale-95"
            >
              {c.hero.cta2}
            </button>
          </div>
        </div>
      </section>

      {/* ── 核心优势 ── */}
      <section className="py-24 px-6 bg-background">
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {c.advantages.map((item, i) => (
            <div key={i} className="p-10 rounded-[2.5rem] border border-border bg-card shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-500">
              <div className="text-5xl mb-6">{item.icon}</div>
              <h3 className="font-bold text-card-foreground text-xl mb-3">{item.title}</h3>
              <p className="text-muted-foreground text-base leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 申请资格分群 ── */}
      <section className="py-24 px-6 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center text-card-foreground mb-16">{c.eligibility.title}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* 内地/大陆 */}
            <div className="p-8 rounded-3xl border border-border bg-card space-y-4">
              <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-medium">
                {c.eligibility.mainland.badge}
              </span>
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm leading-relaxed">
                ⚠️ {c.eligibility.mainland.warning}
              </div>
              <ul className="space-y-2">
                {c.eligibility.mainland.paths.map((p, i) => (
                  <li key={i} className="text-sm text-foreground/80 leading-relaxed">{p}</li>
                ))}
              </ul>
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs leading-relaxed">
                {c.eligibility.mainland.usWarning}
              </div>
              <button
                onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="w-full py-3 rounded-xl bg-primary text-white font-medium hover:opacity-90 transition-all"
              >
                {c.eligibility.mainland.cta}
              </button>
            </div>

            {/* 海外 */}
            <div className="p-8 rounded-3xl border border-border bg-card space-y-4">
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                {c.eligibility.overseas.badge}
              </span>
              <ul className="space-y-2">
                {c.eligibility.overseas.paths.map((p, i) => (
                  <li key={i} className="text-sm text-foreground/80 leading-relaxed">{p}</li>
                ))}
              </ul>
              <div className="border-t border-border pt-4 space-y-2">
                {c.eligibility.overseas.requirements.map((r, i) => (
                  <div key={i} className="flex gap-2 text-sm text-muted-foreground">
                    <span className="text-primary mt-0.5">•</span><span>{r}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="w-full py-3 rounded-xl bg-primary text-white font-medium hover:opacity-90 transition-all"
              >
                {c.eligibility.overseas.cta}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── 投资结构 ── */}
      <section className="py-24 px-6 bg-background">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center text-card-foreground mb-4">{c.investment.title}</h2>
          <p className="text-center text-muted-foreground mb-12">{c.investment.subtitle}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            {/* 圆环图 */}
            <div className="flex flex-col items-center gap-6">
              <DonutChart items={c.investment.items} />
              <div className="space-y-3 w-full max-w-xs">
                {c.investment.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: item.color }} />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-card-foreground">{item.pct} — {item.label}</div>
                      <div className="text-xs text-muted-foreground">{item.amount}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ILI 说明 + 文章链接 */}
            <div className="space-y-8">
              <div className="p-8 rounded-3xl bg-primary/5 border border-primary/20 shadow-sm">
                <div className="text-primary font-bold text-lg mb-3">★ {c.investment.iliNote}</div>
                <div className="mt-6 pt-6 border-t border-primary/10">
                   <a
                    href={`http://fis.wonderwisdom.online?mode=immigration&lang=${lang}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-primary text-white font-bold text-lg hover:bg-primary/90 transition-all shadow-xl shadow-primary/20 group"
                  >
                    <span>{c.hero.cta2}</span>
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </a>
                </div>
              </div>
              <div>
                <div className="text-base font-bold text-muted-foreground mb-4 uppercase tracking-widest">
                  {c.investment.iliReason}
                </div>
                <div className="space-y-3">
                  {c.investment.articles.map((art, i) => (
                    art.available ? (
                      <Link
                        key={i}
                        href={`/blog/${art.slug}`}
                        className="flex items-center gap-4 p-4 rounded-2xl border border-border bg-card hover:bg-card/80 hover:border-primary/30 transition-all group shadow-sm"
                      >
                        <span className="text-primary text-2xl">📄</span>
                        <span className="text-base font-medium text-foreground group-hover:text-primary transition-colors">{art.title}</span>
                      </Link>
                    ) : (
                      <div key={i} className="flex items-center gap-4 p-4 rounded-2xl border border-dashed border-border opacity-50">
                        <span className="text-muted-foreground text-2xl">🔜</span>
                        <span className="text-base font-medium text-muted-foreground">{art.title}</span>
                      </div>
                    )
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
 
      {/* ── 推荐投资组合模型 ── */}
      <section id="portfolios" className="py-24 px-6 bg-muted/20 border-y border-border">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-card-foreground mb-4">{(c as any).investment.portfolios.title}</h2>
            <p className="text-xl text-muted-foreground">{(c as any).investment.portfolios.subtitle}</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {(c as any).investment.portfolios.items.map((item: any, i: number) => (
              <div key={i} className="flex flex-col p-10 rounded-[2.5rem] border border-border bg-card shadow-xl hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 text-6xl opacity-10 group-hover:scale-110 transition-transform">{item.icon}</div>
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-3xl">{item.icon}</div>
                  <div>
                    <h3 className="text-2xl font-bold text-card-foreground">{item.name}</h3>
                    <span className="text-sm font-semibold text-primary/80 uppercase tracking-wider">{item.tag}</span>
                  </div>
                </div>
                <div className="space-y-6 flex-1">
                  <div>
                    <div className="text-sm font-bold text-muted-foreground mb-2 uppercase">{(c as any).investment.portfolios.labels.focus}</div>
                    <p className="text-foreground font-semibold text-lg">{item.focus}</p>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-muted-foreground mb-2 uppercase">{(c as any).investment.portfolios.labels.features}</div>
                    <p className="text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                  <div className="p-5 rounded-2xl bg-muted/50 border border-border">
                    <div className="text-sm font-bold text-muted-foreground mb-2 uppercase">{(c as any).investment.portfolios.labels.target}</div>
                    <p className="text-sm text-foreground/80 leading-relaxed">{item.target}</p>
                  </div>
                  <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10">
                    <div className="text-sm font-bold text-primary mb-2 uppercase">{(c as any).investment.portfolios.labels.analysis}</div>
                    <p className="text-sm text-primary/90 font-medium leading-relaxed">{item.analysis}</p>
                  </div>
                </div>
                <div className="mt-8">
                  <a
                    href={`http://fis.wonderwisdom.online?mode=immigration&lang=${lang}&model=${item.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 py-4 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                  >
                    <span>{(c as any).investment.portfolios.labels.cta}</span>
                    <span className={lang === 'ar' ? 'rotate-180' : ''}>→</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ── 居留时间轴 ── */}
      <section className="py-24 px-6 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center text-card-foreground mb-16">{c.timeline.title}</h2>
          <div className="bg-card p-12 rounded-[3rem] border border-border shadow-sm">
            <Timeline steps={c.timeline.steps} dir={c.dir} />
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-24 px-6 bg-background">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center text-card-foreground mb-16">FAQ</h2>
          <div className="space-y-4">
            {c.faq.map((item, i) => (
              <FAQItem key={i} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── 预约表单 ── */}
      <section ref={formRef} className="py-20 px-6 bg-gradient-to-b from-[#0a0f1e] to-[#0d1a35]">
        <div className="max-w-xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-white mb-2">{c.form.title}</h2>
          <p className="text-center text-blue-200/70 mb-10">{c.form.subtitle}</p>

          {submitResult === "success" ? (
            <div className="p-8 rounded-2xl bg-green-500/10 border border-green-500/30 text-center text-green-400 text-lg">
              {c.form.success}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {[
                { key: "name", label: c.form.fields.name, type: "text", required: true },
                { key: "contact", label: c.form.fields.contact, type: "text", required: true },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm text-blue-200/80 mb-1">{f.label}</label>
                  <input
                    type={f.type}
                    required={f.required}
                    value={formData[f.key as keyof typeof formData]}
                    onChange={e => setFormData(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  />
                </div>
              ))}

              {/* 居住地下拉 */}
              <div>
                <label className="block text-sm text-blue-200/80 mb-1">{c.form.fields.location}</label>
                <select
                  required
                  value={formData.location}
                  onChange={e => setFormData(prev => ({ ...prev, location: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-primary transition-all"
                >
                  <option value="" className="bg-gray-900">—</option>
                  {c.form.locationOptions.map(o => (
                    <option key={o.value} value={o.value} className="bg-gray-900">{o.label}</option>
                  ))}
                </select>
              </div>

              {/* 身份下拉 */}
              <div>
                <label className="block text-sm text-blue-200/80 mb-1">{c.form.fields.status}</label>
                <select
                  required
                  value={formData.status}
                  onChange={e => setFormData(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-primary transition-all"
                >
                  <option value="" className="bg-gray-900">—</option>
                  {c.form.statusOptions.map(o => (
                    <option key={o.value} value={o.value} className="bg-gray-900">{o.label}</option>
                  ))}
                </select>
              </div>

              {/* 备注 */}
              <div>
                <label className="block text-sm text-blue-200/80 mb-1">{c.form.fields.message}</label>
                <textarea
                  rows={3}
                  value={formData.message}
                  onChange={e => setFormData(prev => ({ ...prev, message: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-primary transition-all resize-none"
                />
              </div>

              {submitResult === "error" && (
                <p className="text-red-400 text-sm text-center">{c.form.error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 rounded-2xl bg-primary text-white font-semibold text-lg hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-primary/30"
              >
                {submitting ? c.form.submitting : c.form.submit}
              </button>

              <p className="text-center text-xs text-white/30 leading-relaxed">{c.form.disclaimer}</p>
            </form>
          )}
        </div>
      </section>

    </main>
  )
}

// ── FAQ折叠组件 ───────────────────────────────────────────────────
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-border rounded-3xl overflow-hidden transition-all duration-300 hover:shadow-md">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-8 py-6 text-left hover:bg-muted/30 transition-all"
      >
        <span className="text-lg md:text-xl font-bold text-card-foreground">{q}</span>
        <span className={`text-primary text-2xl transition-transform duration-300 ${open ? "rotate-45" : ""}`}>＋</span>
      </button>
      {open && (
        <div className="px-8 pb-8 text-base md:text-lg text-muted-foreground leading-relaxed border-t border-border pt-6 bg-muted/10">
          {a}
        </div>
      )}
    </div>
  )
}
