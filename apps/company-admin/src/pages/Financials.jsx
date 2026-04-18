import React, { useState, useEffect, useCallback } from 'react'
import { useApp } from '../contexts/AppContext.jsx'
import { financialsApi } from '../api/index.js'
import {
  TrendingUp, TrendingDown, DollarSign, BarChart2,
  FileText, Download, RefreshCw, ChevronDown,
  Users, AlertCircle, CheckCircle, PieChart,
  ArrowUpRight, ArrowDownRight, Calendar, Settings
} from 'lucide-react'
import TaxProfileModal from '../components/TaxProfileModal.jsx'
import UnincorporatedTaxPanel from '../components/UnincorporatedTaxPanel.jsx'

// ── 格式化工具 ─────────────────────────────────────────────────
const fmt = (n, ccy = 'HKD') =>
  `${ccy} ${Number(n || 0).toLocaleString('zh-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtPct = (n) => `${Number(n || 0).toFixed(1)}%`

const DEDUCT_BADGE = {
  yes:          { label: '✓ 全額可扣', cls: 'badge-green' },
  partial:      { label: '◑ 部份可扣', cls: 'badge-yellow' },
  depreciation: { label: '↓ 折舊攤銷', cls: 'badge-yellow' },
  no:           { label: '✗ 不可扣',   cls: 'badge-red'   },
  review:       { label: '？待審核',   cls: 'badge-gray'  },
}

// ── KPI 卡片 ──────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color = '#2563EB', trend }) {
  return (
    <div className="kpi-card" style={{ borderTop: `3px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p className="kpi-label">{label}</p>
          <p className="kpi-value" style={{ color }}>{value}</p>
          {sub && <p className="kpi-sub">{sub}</p>}
        </div>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `${color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Icon size={20} color={color} />
        </div>
      </div>
    </div>
  )
}

// ── 分组行 ─────────────────────────────────────────────────────
function SectionRow({ label, value, ccy, isTotal, isNegative, indent }) {
  const color = isNegative && value < 0 ? '#991B1B'
    : isTotal ? '#1E3A8A'
    : 'inherit'
  return (
    <tr className={isTotal ? 'fin-total-row' : 'fin-row'}>
      <td style={{ paddingLeft: indent ? 28 : 12, color, fontWeight: isTotal ? 600 : 'normal' }}>
        {label}
      </td>
      <td style={{ textAlign: 'right', color, fontWeight: isTotal ? 600 : 'normal', paddingRight: 12 }}>
        {value !== undefined ? fmt(value, ccy) : ''}
      </td>
    </tr>
  )
}

// ────────────────────────────────────────────────────────────────
// TAB 1: 损益表
// ────────────────────────────────────────────────────────────────
function PnLTab({ companyId, fiscalYear, ccy }) {
  const { currentCompany } = useApp()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [taxSettingsOpen, setTaxSettingsOpen] = useState(false)

  const handleTaxProfileSaved = () => {
    load()
  }

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true); setError(null); setData(null)
    try {
      const res = await financialsApi.pnl(companyId, fiscalYear)
      setData(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || '加載失敗')
    } finally {
      setLoading(false)
    }
  }, [companyId, fiscalYear])

  useEffect(() => { load() }, [load])

  const handleExport = async (format) => {
    setExporting(true)
    try {
      const res = await financialsApi.pnlExport(companyId, fiscalYear, format)
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `PnL_${fiscalYear}.${format === 'excel' ? 'xlsx' : 'pdf'}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      alert("導出失敗")
      console.error(e)
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <div className="fin-loading"><span className="spinner" /> 計算中...</div>
  if (error) return <div className="fin-error"><AlertCircle size={16} /> {error}</div>
  if (!data) return null

  const netPositive = data.net_profit >= 0

  return (
    <div className="fin-content">
      {/* KPI 行 */}
      <div className="fin-kpi-grid">
        <KpiCard
          label="期間總收入"
          value={fmt(data.total_income, ccy)}
          sub={`發票 ${fmt(data.invoice_income, ccy)} + 佣金 ${fmt(data.commission_income, ccy)}`}
          icon={TrendingUp}
          color="#2563EB"
        />
        <KpiCard
          label="期間總支出"
          value={fmt(data.total_expense, ccy)}
          sub={`可稅扣 ${fmt(data.total_tax_deductible, ccy)}`}
          icon={TrendingDown}
          color="#DC2626"
        />
        <KpiCard
          label={netPositive ? "估算稅後淨利" : "估算淨虧損"}
          value={fmt(Math.abs(data.net_profit), ccy)}
          sub={`有效稅率 ${data.tax_info?.effective_rate ?? 0}%`}
          icon={DollarSign}
          color={netPositive ? "#16A34A" : "#DC2626"}
        />
        <KpiCard
          label="達成目標概率"
          value={`${data.tax_info?.rate_desc ?? '—'}`}
          sub={`估算利得稅 ${fmt(data.tax_info?.estimated_tax, ccy)}`}
          icon={BarChart2}
          color="#7C3AED"
        />
      </div>

      {/* 导出按钮 */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-outline" onClick={() => handleExport('excel')} disabled={exporting}>
          <Download size={14} /> {exporting ? '導出中' : '導出 Excel'}
        </button>
        <button className="btn btn-primary" onClick={() => handleExport('pdf')} disabled={exporting}>
          <FileText size={14} /> {exporting ? '導出中' : '導出 PDF'}
        </button>
      </div>

      {/* 收入表 */}
      <div className="fin-section">
        <h3 className="fin-section-title">
          <TrendingUp size={16} color="#2563EB" /> 一、收入明細 / Income
        </h3>
        <table className="fin-table">
          <thead>
            <tr>
              <th>項目</th>
              <th style={{ textAlign: 'right' }}>金額</th>
            </tr>
          </thead>
          <tbody>
            {data.invoice_income > 0 && (
              <SectionRow label="發票收入 / Invoice Revenue" value={data.invoice_income} ccy={ccy} />
            )}
            {data.commission_income > 0 && (
              <SectionRow
                label={`佣金收入 / Commission Income（${data.commission_source === 'ir56m' ? 'IR56M' : '月結單'}）`}
                value={data.commission_income}
                ccy={ccy}
              />
            )}
            <SectionRow label="合計收入 / Total Income" value={data.total_income} ccy={ccy} isTotal />
          </tbody>
        </table>
      </div>

      {/* 支出表 */}
      <div className="fin-section">
        <h3 className="fin-section-title">
          <TrendingDown size={16} color="#DC2626" /> 二、支出明細 / Expenses
        </h3>
        <table className="fin-table">
          <thead>
            <tr>
              <th>類別</th>
              <th style={{ textAlign: 'center', width: 110 }}>利得稅可扣</th>
              <th style={{ textAlign: 'right', width: 160 }}>金額</th>
            </tr>
          </thead>
          <tbody>
            {data.expense_categories.map((cat) => {
              const badge = DEDUCT_BADGE[cat.hk_tax_deductible] || DEDUCT_BADGE.review
              return (
                <tr key={cat.code} className="fin-row">
                  <td style={{ paddingLeft: 12 }}>{cat.name_zh}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`badge ${badge.cls}`}>{badge.label}</span>
                  </td>
                  <td style={{ textAlign: 'right', paddingRight: 12 }}>{fmt(cat.total_hkd, ccy)}</td>
                </tr>
              )
            })}
            {data.expense_categories.length === 0 && (
              <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '20px 0' }}>本期未有已確認支出記錄</td></tr>
            )}
            <tr className="fin-total-row">
              <td style={{ paddingLeft: 12, fontWeight: 600 }}>合計支出 / Total Expenses</td>
              <td />
              <td style={{ textAlign: 'right', paddingRight: 12, fontWeight: 600 }}>{fmt(data.total_expense, ccy)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 利润表 */}
      <div className="fin-section">
        <h3 className="fin-section-title">
          <DollarSign size={16} color="#7C3AED" /> 三、利潤及稅務估算 / Profit & Tax
        </h3>
        <table className="fin-table">
          <tbody>
            <SectionRow label="毛利潤 / Gross Profit" value={data.gross_profit} ccy={ccy} />
            <SectionRow
              label="扣除可稅扣支出 / Less: Tax-Deductible Expenses"
              value={-data.total_tax_deductible}
              ccy={ccy}
              indent
            />
            <SectionRow label="應評稅利潤 / Assessable Profit" value={data.assessable_profit} ccy={ccy} isTotal />
            
            {data.is_partial_tax ? (
              <tr>
                <td colSpan="2" style={{ padding: '24px 12px', textAlign: 'center', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ color: 'var(--color-text-muted)', marginBottom: 8 }}>
                    🔒 免費版帳戶僅顯示基礎利潤。如需解鎖完整稅務估算及優化方案，請升級帳戶。
                  </div>
                </td>
              </tr>
            ) : (
              data.tax_info?.is_unlimited && data.tax_info?.options ? (
                <tr>
                  <td colSpan="2" style={{ padding: '0 12px' }}>
                    <UnincorporatedTaxPanel taxInfo={data.tax_info} openSettings={() => setTaxSettingsOpen(true)} ccy={ccy} />
                  </td>
                </tr>
              ) : (
                <SectionRow
                  label={`估算利得稅 / Est. Profits Tax（${data.tax_info?.rate_desc || ''}）`}
                  value={-(data.tax_info?.estimated_tax || 0)}
                  ccy={ccy}
                  indent
                  isNegative
                />
              )
            )}

            <tr className={`fin-total-row ${netPositive ? 'fin-profit-row' : 'fin-loss-row'}`}>
              <td style={{ paddingLeft: 12, fontWeight: 700, fontSize: 15 }}>
                估算稅後淨利 / Est. Net Profit After Tax
              </td>
              <td style={{ textAlign: 'right', paddingRight: 12, fontWeight: 700, fontSize: 15 }}>
                {fmt(data.net_profit, ccy)}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="fin-disclaimer">
          ⚠ 稅務估算採用預設框架推演。實際稅務義務以香港稅務局評估為準，建議諮詢持牌會計師。所有預測數據僅供參考，不構成正式財務報告。
        </p>
      </div>

      <TaxProfileModal 
        isOpen={taxSettingsOpen} 
        onClose={() => setTaxSettingsOpen(false)} 
        companyId={currentCompany?.id} 
        onSaveSuccess={handleTaxProfileSaved}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// TAB 2: 应收账款
// ────────────────────────────────────────────────────────────────
function ARTab({ companyId, fiscalYear, ccy }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true); setError(null); setData(null)
    try {
      const res = await financialsApi.ar(companyId, fiscalYear)
      setData(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || '加載失敗')
    } finally {
      setLoading(false)
    }
  }, [companyId, fiscalYear])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="fin-loading"><span className="spinner" /> 計算中...</div>
  if (error) return <div className="fin-error"><AlertCircle size={16} /> {error}</div>
  if (!data) return null

  const s = data.summary || {}

  return (
    <div className="fin-content">
      <div className="fin-kpi-grid">
        <KpiCard label="應收账款總額" value={fmt(s.total_billed, ccy)} icon={DollarSign} color="#2563EB" />
        <KpiCard label="已收款項" value={fmt(s.total_paid, ccy)} icon={CheckCircle} color="#16A34A" />
        <KpiCard label="未收餘額" value={fmt(s.total_balance, ccy)} icon={FileText} color="#D97706" />
        <KpiCard
          label="逾期未收"
          value={fmt(s.total_overdue, ccy)}
          sub={`收款率 ${fmtPct(s.collection_rate)}`}
          icon={AlertCircle}
          color={s.total_overdue > 0 ? '#DC2626' : '#16A34A'}
        />
      </div>

      <div className="fin-section">
        <h3 className="fin-section-title"><Users size={16} color="#2563EB" /> 客戶應收明細</h3>
        <table className="fin-table">
          <thead>
            <tr>
              <th>客戶名稱</th>
              <th style={{ textAlign: 'center', width: 70 }}>發票數</th>
              <th style={{ textAlign: 'right' }}>應收總額</th>
              <th style={{ textAlign: 'right' }}>已收金額</th>
              <th style={{ textAlign: 'right' }}>未收餘額</th>
              <th style={{ textAlign: 'right' }}>逾期未收</th>
            </tr>
          </thead>
          <tbody>
            {data.clients.map((c, i) => (
              <tr key={i} className="fin-row">
                <td style={{ paddingLeft: 12 }}>{c.client_name}</td>
                <td style={{ textAlign: 'center' }}>{c.invoice_count}</td>
                <td style={{ textAlign: 'right', paddingRight: 12 }}>{fmt(c.total_billed, ccy)}</td>
                <td style={{ textAlign: 'right', paddingRight: 12 }}>{fmt(c.total_paid, ccy)}</td>
                <td style={{ textAlign: 'right', paddingRight: 12, fontWeight: c.balance_due > 0 ? 600 : 'normal', color: c.balance_due > 0 ? '#D97706' : 'inherit' }}>
                  {fmt(c.balance_due, ccy)}
                </td>
                <td style={{ textAlign: 'right', paddingRight: 12, color: c.overdue_amount > 0 ? '#DC2626' : 'var(--color-text-muted)' }}>
                  {c.overdue_amount > 0 ? fmt(c.overdue_amount, ccy) : '—'}
                </td>
              </tr>
            ))}
            {data.clients.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '20px 0' }}>本期暫無應收記錄</td></tr>
            )}
            <tr className="fin-total-row">
              <td style={{ paddingLeft: 12, fontWeight: 600 }}>合計</td>
              <td />
              <td style={{ textAlign: 'right', paddingRight: 12, fontWeight: 600 }}>{fmt(s.total_billed, ccy)}</td>
              <td style={{ textAlign: 'right', paddingRight: 12, fontWeight: 600 }}>{fmt(s.total_paid, ccy)}</td>
              <td style={{ textAlign: 'right', paddingRight: 12, fontWeight: 600, color: s.total_balance > 0 ? '#D97706' : 'inherit' }}>{fmt(s.total_balance, ccy)}</td>
              <td style={{ textAlign: 'right', paddingRight: 12, fontWeight: 600, color: s.total_overdue > 0 ? '#DC2626' : 'inherit' }}>{fmt(s.total_overdue, ccy)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// TAB 3: 支出分析
// ────────────────────────────────────────────────────────────────
function ExpenseAnalysisTab({ companyId, fiscalYear, ccy }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true); setError(null); setData(null)
    try {
      const res = await financialsApi.expenseAnalysis(companyId, fiscalYear)
      setData(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || '加載失敗')
    } finally {
      setLoading(false)
    }
  }, [companyId, fiscalYear])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="fin-loading"><span className="spinner" /> 計算中...</div>
  if (error) return <div className="fin-error"><AlertCircle size={16} /> {error}</div>
  if (!data) return null

  // 生成色环
  const COLORS = [
    '#2563EB', '#7C3AED', '#DB2777', '#D97706', '#16A34A',
    '#0891B2', '#DC2626', '#9333EA', '#F59E0B', '#10B981',
  ]

  return (
    <div className="fin-content">
      <div className="fin-kpi-grid">
        <KpiCard label="總支出" value={fmt(data.grand_total, ccy)} icon={TrendingDown} color="#DC2626" />
        <KpiCard label="可稅扣支出" value={fmt(data.deductible_total, ccy)} sub={fmtPct(data.deductible_pct)} icon={CheckCircle} color="#16A34A" />
        <KpiCard label="不可扣支出" value={fmt(data.non_deductible_total, ccy)} icon={AlertCircle} color="#D97706" />
        <KpiCard label="支出分類數" value={`${data.categories.length} 類`} icon={PieChart} color="#7C3AED" />
      </div>

      <div className="fin-two-col">
        {/* 分类表 */}
        <div className="fin-section" style={{ flex: 2 }}>
          <h3 className="fin-section-title"><PieChart size={16} color="#7C3AED" /> 支出分類明細</h3>
          <table className="fin-table">
            <thead>
              <tr>
                <th>類別</th>
                <th style={{ textAlign: 'center', width: 100 }}>可扣稅</th>
                <th style={{ textAlign: 'right', width: 140 }}>金額</th>
                <th style={{ textAlign: 'right', width: 80 }}>佔比</th>
              </tr>
            </thead>
            <tbody>
              {data.categories.map((cat, i) => {
                const badge = DEDUCT_BADGE[cat.hk_tax_deductible] || DEDUCT_BADGE.review
                return (
                  <tr key={cat.code} className="fin-row">
                    <td style={{ paddingLeft: 12 }}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], marginRight: 8 }} />
                      {cat.name_zh}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`badge ${badge.cls}`} style={{ fontSize: 11 }}>{badge.label}</span>
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: 12 }}>{fmt(cat.total, ccy)}</td>
                    <td style={{ textAlign: 'right', paddingRight: 12, color: 'var(--color-text-muted)' }}>{fmtPct(cat.pct)}</td>
                  </tr>
                )
              })}
              {data.categories.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '20px 0' }}>本期未有已確認支出記錄</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 月度趋势 */}
        <div className="fin-section" style={{ flex: 1 }}>
          <h3 className="fin-section-title"><Calendar size={16} color="#2563EB" /> 每月支出走勢</h3>
          {data.monthly.length === 0
            ? <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '40px 0' }}>暫無月度數據</p>
            : (() => {
                const maxVal = Math.max(...data.monthly.map(m => m.total), 1)
                return (
                  <div className="fin-bar-chart">
                    {data.monthly.map((m) => (
                      <div key={m.month} className="fin-bar-row">
                        <span className="fin-bar-label">{m.month}</span>
                        <div className="fin-bar-track">
                          <div
                            className="fin-bar-fill"
                            style={{ width: `${m.total / maxVal * 100}%` }}
                            title={fmt(m.total, ccy)}
                          />
                        </div>
                        <span className="fin-bar-val">{fmt(m.total, ccy)}</span>
                      </div>
                    ))}
                  </div>
                )
              })()
          }
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// 主页面
// ────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'pnl',      label: '損益表',   icon: TrendingUp },
  { id: 'ar',       label: '應收賬款', icon: Users },
  { id: 'expenses', label: '支出分析', icon: PieChart },
]

export default function FinancialsPage() {
  const { currentCompany } = useApp()
  const [activeTab, setActiveTab] = useState('pnl')
  const [fiscalYear, setFiscalYear] = useState(null)
  const [fiscalYears, setFiscalYears] = useState([])

  const companyId = currentCompany?.id
  const ccy = currentCompany?.base_currency || 'HKD'

  // 加载可选财年
  useEffect(() => {
    if (!companyId) return
    financialsApi.fiscalYears(companyId)
      .then(res => {
        setFiscalYears(res.data.fiscal_years || [])
        if (!fiscalYear) setFiscalYear(res.data.current)
      })
      .catch(() => {})
  }, [companyId])

  if (!currentCompany) {
    return (
      <div className="page-empty">
        <BarChart2 size={48} color="var(--color-text-muted)" />
        <p>請先選擇公司</p>
      </div>
    )
  }

  return (
    <div className="page-container">
      {/* 页头 */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <BarChart2 size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            財務報表
          </h1>
          <p className="page-subtitle">{currentCompany.name_zh} · 自動生成財務報告</p>
        </div>

        {/* 财年选择 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>財政年度</span>
          <div className="select-wrapper">
            <select
              className="select-input"
              value={fiscalYear || ''}
              onChange={e => setFiscalYear(e.target.value)}
            >
              {fiscalYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <ChevronDown size={14} className="select-icon" />
          </div>
        </div>
      </div>

      {/* Tab 栏 */}
      <div className="fin-tabs">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              className={`fin-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab 内容 */}
      {fiscalYear && (
        <>
          {activeTab === 'pnl'      && <PnLTab             companyId={companyId} fiscalYear={fiscalYear} ccy={ccy} />}
          {activeTab === 'ar'       && <ARTab              companyId={companyId} fiscalYear={fiscalYear} ccy={ccy} />}
          {activeTab === 'expenses' && <ExpenseAnalysisTab companyId={companyId} fiscalYear={fiscalYear} ccy={ccy} />}
        </>
      )}
    </div>
  )
}
