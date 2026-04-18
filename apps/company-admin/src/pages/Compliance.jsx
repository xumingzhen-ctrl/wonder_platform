import React, { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../contexts/AppContext.jsx'
import { complianceApi } from '../api/index.js'

// ── 工具函数 ─────────────────────────────────────────────────────────────────

function buildFiscalYearOptions() {
  const now = new Date()
  const m = now.getMonth() + 1
  const y = now.getFullYear()
  const currentStart = m >= 4 ? y : y - 1
  return Array.from({ length: 4 }, (_, i) => {
    const start = currentStart - i
    return `${start}-${String(start + 1).slice(-2)}`
  })
}

function daysDiff(dueDateStr) {
  if (!dueDateStr) return null
  const due = new Date(dueDateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  return Math.round((due - today) / (1000 * 60 * 60 * 24))
}

function formatDate(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

// ── 常量映射 ──────────────────────────────────────────────────────────────────

const CATEGORY_META = {
  cr:       { label: '公司註冊處', color: '#6366F1', bg: '#6366F118', icon: '🏛️' },
  ird:      { label: '稅務局',     color: '#F59E0B', bg: '#F59E0B18', icon: '📋' },
  mpfa:     { label: '強積金局',   color: '#10B981', bg: '#10B98118', icon: '🔒' },
  internal: { label: '內部事項',   color: '#8B5CF6', bg: '#8B5CF618', icon: '📁' },
}

const STATUS_META = {
  pending: { label: '待處理',   color: '#2563EB', bg: '#2563EB12', dot: '#2563EB' },
  done:    { label: '已完成',   color: '#10B981', bg: '#10B98112', dot: '#10B981' },
  overdue: { label: '已逾期',   color: '#EF4444', bg: '#EF444412', dot: '#EF4444' },
  snoozed: { label: '已延後',   color: '#F59E0B', bg: '#F59E0B12', dot: '#F59E0B' },
  na:      { label: '事件觸發', color: '#9CA3AF', bg: '#9CA3AF12', dot: '#9CA3AF' },
}

// ── 子组件：操作弹窗 ──────────────────────────────────────────────────────────

function ItemModal({ item, onClose, onUpdate }) {
  const [status, setStatus] = useState(item.status)
  const [manualDate, setManualDate] = useState(
    item.due_date ? item.due_date.slice(0, 10) : ''
  )
  const [notes, setNotes] = useState(item.notes || '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const payload = { status, notes }
    if (manualDate) {
      payload.due_date = manualDate + 'T00:00:00'
    }
    await onUpdate(item.id, payload)
    setSaving(false)
    onClose()
  }

  const catMeta = CATEGORY_META[item.category] || CATEGORY_META.internal

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-xl)',
        width: '100%', maxWidth: 520,
        boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
        overflow: 'hidden',
      }}>
        {/* 顶部 */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--color-border-light)',
          background: catMeta.bg,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{
              padding: '3px 10px', borderRadius: 20,
              fontSize: 11, fontWeight: 700,
              background: catMeta.color + '22', color: catMeta.color,
            }}>{catMeta.icon} {catMeta.label}</span>
            <span style={{
              padding: '3px 10px', borderRadius: 20,
              fontSize: 11, fontWeight: 700,
              background: 'var(--color-primary-light)',
              color: 'var(--color-primary)',
            }}>{item.code}</span>
          </div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>
            {item.title}
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
            {item.title_en}
          </p>
        </div>

        <div style={{ padding: 24 }}>
          {/* 法规信息 */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20,
          }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 3 }}>主管機構</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{item.authority || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 3 }}>法規依據</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{item.legal_ref || '—'}</div>
            </div>
          </div>

          {item.penalty_note && (
            <div style={{
              padding: '10px 14px', borderRadius: 'var(--radius-md)',
              background: '#EF444410', border: '1px solid #EF444430',
              marginBottom: 20, fontSize: 12, color: '#EF4444',
            }}>
              ⚠️ {item.penalty_note}
            </div>
          )}

          {/* 截止日期 */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--color-text-muted)' }}>
              截止日期 {item.is_manual_date && <span style={{ color: '#F59E0B' }}>（手動設定）</span>}
              {item.needs_manual && <span style={{ color: '#EF4444' }}>（請填寫）</span>}
            </label>
            <input
              type="date"
              value={manualDate}
              onChange={e => setManualDate(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                fontSize: 14, background: 'var(--color-bg)',
                color: 'var(--color-text)',
              }}
            />
            {item.needs_manual && (
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4, marginBottom: 0 }}>
                💡 系統缺少所需資料（如公司成立日期），請手動輸入截止日
              </p>
            )}
          </div>

          {/* 状态选择 */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--color-text-muted)' }}>
              處理狀態
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['pending', 'done', 'snoozed', 'na'].map(s => {
                const sm = STATUS_META[s]
                return (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    style={{
                      padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                      border: `2px solid ${status === s ? sm.dot : 'transparent'}`,
                      background: status === s ? sm.bg : 'var(--color-border-light)',
                      color: status === s ? sm.dot : 'var(--color-text-muted)',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {sm.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 备注 */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--color-text-muted)' }}>
              備註
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              style={{
                width: '100%', padding: '8px 12px', resize: 'vertical',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                fontSize: 13, background: 'var(--color-bg)',
                color: 'var(--color-text)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Wonder Hub 引流提示（仅 MPF / EC 保险相关项显示） */}
          {['C06', 'C11', 'C13'].includes(item.code) && (
            <div style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              background: '#F59E0B08',
              border: '1px solid #F59E0B35',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#B45309', marginBottom: 2 }}>
                  🛡️ 需要保險或 MPF 方案協助？
                </div>
                <div style={{ fontSize: 11, color: '#92400E', lineHeight: 1.5 }}>
                  WONDER HUB 提供企業雇員補償、MPF 及團體醫療方案，可免費諮詢報價。
                </div>
              </div>
              <a
                href={`https://wonderhub.hk/insurance?type=${item.code === 'C06' || item.code === 'C11' ? 'mpf' : 'ec'}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flexShrink: 0,
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: '#F59E0B',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                了解方案 →
              </a>
            </div>
          )}

          {/* 操作按钮 */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={onClose}>取消</button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '儲存中…' : '✓ 儲存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 子组件：合规项卡片 ────────────────────────────────────────────────────────

function ComplianceCard({ item, onClick }) {
  const catMeta = CATEGORY_META[item.category] || CATEGORY_META.internal
  const statusMeta = STATUS_META[item.status] || STATUS_META.pending
  const days = daysDiff(item.due_date)
  const isUrgent = days !== null && days >= 0 && days <= 7
  const isWarning = days !== null && days > 7 && days <= 30

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--color-surface)',
        border: `1px solid ${item.status === 'overdue' ? '#EF444440' : isUrgent ? '#F59E0B40' : 'var(--color-border-light)'}`,
        borderLeft: `4px solid ${item.status === 'overdue' ? '#EF4444' : item.status === 'done' ? '#10B981' : isUrgent ? '#F59E0B' : catMeta.color}`,
        borderRadius: 'var(--radius-lg)',
        padding: '16px 18px',
        cursor: 'pointer',
        transition: 'all 0.18s',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        boxShadow: item.status === 'overdue' ? '0 0 0 2px #EF444420' : 'none',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = item.status === 'overdue' ? '0 0 0 2px #EF444420' : 'none'
      }}
    >
      {/* 左侧图标 */}
      <div style={{
        width: 40, height: 40, borderRadius: 'var(--radius-md)',
        background: catMeta.bg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 18, flexShrink: 0,
      }}>
        {item.status === 'done' ? '✅' : catMeta.icon}
      </div>

      {/* 中间内容 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: catMeta.color }}>{item.code}</span>
          <span style={{
            fontSize: 11, padding: '1px 8px', borderRadius: 20,
            background: catMeta.bg, color: catMeta.color, fontWeight: 600,
          }}>{catMeta.label}</span>
          {item.needs_manual && (
            <span style={{
              fontSize: 11, padding: '1px 8px', borderRadius: 20,
              background: '#EF444415', color: '#EF4444', fontWeight: 600,
            }}>需手動輸入日期</span>
          )}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>
          {item.title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          {item.authority}
          {item.legal_ref && <span style={{ marginLeft: 8, opacity: 0.7 }}>· {item.legal_ref}</span>}
        </div>
      </div>

      {/* 右侧状态 + 日期 */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{
          display: 'inline-block',
          padding: '3px 10px', borderRadius: 20,
          background: statusMeta.bg, color: statusMeta.dot,
          fontSize: 11, fontWeight: 700, marginBottom: 6,
        }}>
          {statusMeta.label}
        </div>
        {item.due_date && item.status !== 'na' ? (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>
              {formatDate(item.due_date)}
            </div>
            {days !== null && item.status !== 'done' && (
              <div style={{
                fontSize: 11, fontWeight: 700, marginTop: 2,
                color: item.status === 'overdue' ? '#EF4444'
                     : isUrgent ? '#F59E0B'
                     : isWarning ? '#D97706'
                     : 'var(--color-text-muted)',
              }}>
                {item.status === 'overdue' ? `已逾期 ${Math.abs(days)} 天`
                 : days === 0 ? '今日截止！'
                 : `還有 ${days} 天`}
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {item.status === 'na' ? '等待事件觸發' : '—'}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 子组件：时间轴视图 ────────────────────────────────────────────────────────

function TimelineView({ items, fiscalYear, onItemClick }) {
  const fyStart = fiscalYear ? parseInt(fiscalYear.split('-')[0]) : new Date().getFullYear()
  // 香港财年：4月-3月
  const months = Array.from({ length: 12 }, (_, i) => {
    const monthIndex = ((3 + i) % 12) + 1  // 从4月开始
    const year = i < 9 ? fyStart : fyStart + 1
    return { month: monthIndex, year, label: `${monthIndex}月` }
  })

  const eventsByMonth = useMemo(() => {
    const map = {}
    items.forEach(item => {
      if (!item.due_date || item.status === 'na') return
      const d = new Date(item.due_date)
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`
      if (!map[key]) map[key] = []
      map[key].push(item)
    })
    return map
  }, [items])

  return (
    <div style={{
      background: 'var(--color-surface)',
      borderRadius: 'var(--radius-xl)',
      padding: 24,
      border: '1px solid var(--color-border-light)',
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 20, color: 'var(--color-text-muted)' }}>
        📅 {fiscalYear?.replace('-', '/')} 財年時間軸（4月→3月）
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
        {months.map(({ month, year, label }) => {
          const key = `${year}-${month}`
          const monthItems = eventsByMonth[key] || []
          const hasOverdue = monthItems.some(i => i.status === 'overdue')
          const hasUrgent = monthItems.some(i => {
            const d = daysDiff(i.due_date)
            return d !== null && d >= 0 && d <= 7
          })

          return (
            <div key={key} style={{
              borderRadius: 'var(--radius-md)',
              padding: '12px 10px',
              background: monthItems.length > 0
                ? (hasOverdue ? '#EF444408' : hasUrgent ? '#F59E0B08' : 'var(--color-primary-light)')
                : 'var(--color-bg)',
              border: `1px solid ${monthItems.length > 0
                ? (hasOverdue ? '#EF444430' : hasUrgent ? '#F59E0B30' : 'var(--color-border-light)')
                : 'var(--color-border-light)'}`,
              minHeight: 80,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--color-text-muted)' }}>
                {year} · {label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {monthItems.map(item => {
                  const sm = STATUS_META[item.status] || STATUS_META.pending
                  return (
                    <div
                      key={item.id}
                      onClick={() => onItemClick(item)}
                      title={item.title}
                      style={{
                        padding: '4px 8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                        background: sm.bg, fontSize: 11, fontWeight: 600, color: sm.dot,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        transition: 'opacity 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                    >
                      {item.code} {item.title.slice(0, 8)}…
                    </div>
                  )
                })}
                {monthItems.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', opacity: 0.5 }}>
                    無截止事項
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── 主页面 ─────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export default function Compliance() {
  const { currentCompany } = useApp()
  const navigate = useNavigate()

  const fyOptions = useMemo(() => buildFiscalYearOptions(), [])
  const [selectedFY, setSelectedFY] = useState(() => buildFiscalYearOptions()[0])
  const [view, setView] = useState('list')   // 'list' | 'timeline'
  const [filterStatus, setFilterStatus] = useState('all')

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)

  // 加载数据
  async function loadData(fy = selectedFY) {
    if (!currentCompany) return
    setLoading(true)
    try {
      const res = await complianceApi.list(currentCompany.id, fy)
      setData(res.data)
    } catch (e) {
      console.error('加载合规数据失败', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [currentCompany?.id, selectedFY])

  // 更新单项
  async function handleUpdate(itemId, payload) {
    await complianceApi.update(currentCompany.id, itemId, payload)
    await loadData()
  }

  // 重新生成
  async function handleRegenerate() {
    if (!confirm(`確認重新生成 ${selectedFY} 合規清單？（已完成事件的狀態將被保留）`)) return
    setRefreshing(true)
    try {
      await complianceApi.regenerate(currentCompany.id, selectedFY)
      await loadData()
    } finally {
      setRefreshing(false)
    }
  }

  if (!currentCompany) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🏢</div>
        <h3>尚未選擇公司</h3>
        <p>請先在頂欄選擇或新增公司</p>
      </div>
    )
  }

  const items = data?.items || []
  const hasIncDate = data?.has_incorporation_date
  const legalType = data?.company_legal_type || currentCompany.company_legal_type

  // 统计
  const counts = useMemo(() => {
    const overdue = items.filter(i => i.status === 'overdue').length
    const done = items.filter(i => i.status === 'done').length
    const pending = items.filter(i => i.status === 'pending').length
    const needsDate = items.filter(i => i.needs_manual && i.status !== 'done').length
    return { overdue, done, pending, needsDate }
  }, [items])

  // 筛选列表
  const filteredItems = useMemo(() => {
    if (filterStatus === 'all') return items.filter(i => i.status !== 'na')
    if (filterStatus === 'event') return items.filter(i => i.status === 'na')
    return items.filter(i => i.status === filterStatus)
  }, [items, filterStatus])

  const LEGAL_TYPE_LABEL = {
    limited:   '🏢 有限公司',
    unlimited: '🤝 無限責任公司',
    sole_prop: '👤 獨資經營',
  }

  return (
    <div>
      {/* ── 页头 ── */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">📅 合規日曆</h1>
          <p className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {currentCompany.name_zh}
            <span style={{
              padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: 'var(--color-primary-light)', color: 'var(--color-primary)',
            }}>
              {LEGAL_TYPE_LABEL[legalType] || legalType}
            </span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* 财年选择 */}
          <select
            value={selectedFY}
            onChange={e => setSelectedFY(e.target.value)}
            style={{
              fontSize: 13, fontWeight: 700, padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              color: 'var(--color-primary)', cursor: 'pointer',
            }}
          >
            {fyOptions.map(fy => <option key={fy} value={fy}>{fy} 財年</option>)}
          </select>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleRegenerate}
            disabled={refreshing}
            title="重置並重新計算本財年合規清單"
          >
            {refreshing ? '⟳ 刷新中…' : '🔄 重新生成'}
          </button>
        </div>
      </div>

      {/* ── 缺少成立日期横幅 ── */}
      {!hasIncDate && (
        <div style={{
          padding: '12px 18px', borderRadius: 'var(--radius-lg)',
          background: '#F59E0B10', border: '1px solid #F59E0B40',
          color: '#B45309', fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 12,
          marginBottom: 20,
        }}>
          ⚠️ 公司成立日期（Incorporation Date）未填寫，NAR1 周年申報及利得稅截止日無法自動計算。
          請手動設定截止日，或
          <Link
            to={`/companies/${currentCompany.id}/edit`}
            style={{ color: 'var(--color-primary)', fontWeight: 700, textDecoration: 'none' }}
          >
            前往公司設定完善資料 →
          </Link>
        </div>
      )}

      {/* ── 统计概要 ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24,
      }}>
        {[
          { key: 'overdue', label: '已逾期', color: '#EF4444', icon: '🔴', count: counts.overdue },
          { key: 'pending', label: '待處理', color: '#2563EB', icon: '🟡', count: counts.pending },
          { key: 'done',    label: '已完成', color: '#10B981', icon: '✅', count: counts.done },
          { key: 'nadates', label: '需填截止日', color: '#F59E0B', icon: '📝', count: counts.needsDate },
        ].map(({ key, label, color, icon, count }) => (
          <div key={key} style={{
            background: 'var(--color-surface)',
            border: `1px solid ${color}30`,
            borderTop: `3px solid ${color}`,
            borderRadius: 'var(--radius-lg)',
            padding: '14px 18px',
          }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color }}>{count}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── 视图切换 + 过滤 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        {/* 视图切换 */}
        <div style={{
          display: 'flex', background: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-light)', padding: 3,
        }}>
          {[
            { v: 'list', label: '≡ 清單' },
            { v: 'timeline', label: '🗓 時間軸' },
          ].map(({ v, label }) => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '6px 16px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700,
              border: 'none', cursor: 'pointer', transition: 'all 0.15s',
              background: view === v ? 'var(--color-primary)' : 'transparent',
              color: view === v ? '#fff' : 'var(--color-text-muted)',
            }}>{label}</button>
          ))}
        </div>

        {/* 状态过滤（仅清单模式） */}
        {view === 'list' && (
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { k: 'all',     l: '全部' },
              { k: 'overdue', l: '🔴 逾期' },
              { k: 'pending', l: '🔵 待處理' },
              { k: 'done',    l: '✅ 完成' },
              { k: 'snoozed', l: '⏸ 延後' },
              { k: 'event',   l: '⚡ 事件型' },
            ].map(({ k, l }) => (
              <button key={k} onClick={() => setFilterStatus(k)} style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                border: `1px solid ${filterStatus === k ? 'var(--color-primary)' : 'var(--color-border-light)'}`,
                background: filterStatus === k ? 'var(--color-primary-light)' : 'transparent',
                color: filterStatus === k ? 'var(--color-primary)' : 'var(--color-text-muted)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>{l}</button>
            ))}
          </div>
        )}
      </div>

      {/* ── 内容区 ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <span className="spinner" style={{ width: 32, height: 32 }} />
        </div>
      ) : view === 'timeline' ? (
        <TimelineView
          items={items}
          fiscalYear={selectedFY}
          onItemClick={setSelectedItem}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredItems.length === 0 ? (
            <div className="empty-state" style={{ padding: '60px 0' }}>
              <div className="empty-state-icon">🎉</div>
              <h3>此篩選下無合規事項</h3>
              <p>切換篩選條件查看其他狀態</p>
            </div>
          ) : (
            filteredItems.map(item => (
              <ComplianceCard
                key={item.id}
                item={item}
                onClick={() => setSelectedItem(item)}
              />
            ))
          )}
        </div>
      )}

      {/* ── 操作弹窗 ── */}
      {selectedItem && (
        <ItemModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onUpdate={handleUpdate}
        />
      )}

      {/* ── 图例说明 ── */}
      <div style={{
        marginTop: 32, padding: '16px 20px',
        background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border-light)',
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 12 }}>
          📌 合規義務差異說明
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <span>🏢</span>
            <span><b>有限公司</b>：需提交 NAR1、BIR51、法定核數、公司秘書通知</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <span>🤝</span>
            <span><b>無限/獨資</b>：使用 BIR60 個人報稅表，無需 NAR1 及法定核數</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <span>⚡</span>
            <span><b>事件觸發型</b>（灰色）：董事變更/新員工 MPF 登記等，發生時點開處理</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <span>⚠️</span>
            <span><b>2025年5月1日起</b>：強積金取消抵銷遣散費/長期服務金安排</span>
          </div>
        </div>
      </div>
    </div>
  )
}
