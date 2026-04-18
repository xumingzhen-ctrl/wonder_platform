import React, { useState, useEffect, useCallback } from 'react'
import { useApp } from '../contexts/AppContext.jsx'
import { leasesApi } from '../api/index.js'

// ─── Constants & Utils ────────────────────────────────────────────────────────

const STATUS_COLOR = {
  upcoming: '#8B5CF6',
  active: '#10B981',
  expiring: '#F59E0B',
  expired: '#EF4444',
  terminated: '#6B7280',
}

const STATUS_LABEL = {
  upcoming: '未生效', active: '生效中', expiring: '即將到期',
  expired: '已過期', terminated: '已終止'
}

const PAYMENT_STATUS_COLOR = { pending: '#F59E0B', paid: '#10B981', overdue: '#EF4444', void: '#6B7280' }
const PAYMENT_STATUS_LABEL = { pending: '待付', paid: '已付', overdue: '已逾期', void: '作廢' }

const FREQ_LABEL = { monthly: '月付', quarterly: '季付', annual: '年付' }

function fmtHKD(n) {
  return `HK$${Number(n || 0).toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function parseApiError(err) {
  const detail = err?.response?.data?.detail
  if (!detail) return '操作失敗，請稍後再試'
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map(d => `${d.loc?.slice(1)?.join('.')}: ${d.msg}`).join('\n')
  return JSON.stringify(detail)
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '8px 12px',
  border: '1.5px solid var(--color-border)', borderRadius: 8, fontSize: 13,
  background: 'var(--color-bg)', color: 'var(--color-text-primary)'
}

function Modal({ title, onClose, width = 540, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    }}>
      <div style={{
        background: 'var(--color-surface)', borderRadius: 12, width: '100%', maxWidth: width,
        maxHeight: '90vh', overflowY: 'auto', padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FormField({ label, required, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4 }}>
        {label}{required && <span style={{ color: '#EF4444' }}> *</span>}
      </label>
      {children}
    </div>
  )
}


// ══════════════════════════════════════════════════════════════════════════════
// Tab 1: Lease Overview
// ══════════════════════════════════════════════════════════════════════════════

function LeaseForm({ initial = {}, onSave, onClose }) {
  const [form, setForm] = useState({
    property_name: '', property_address: '', property_type: 'office',
    landlord_name: '', landlord_contact: '',
    start_date: '', end_date: '', monthly_rent: '', payment_frequency: 'monthly', rent_due_day: 1,
    deposit_amount: '', deposit_currency: 'HKD', renewal_notice_days: 60,
    ...initial
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const payload = { ...form }
    if (!payload.deposit_amount) delete payload.deposit_amount
    try {
      await onSave(payload)
    } finally { setSaving(false) }
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
        <FormField label="物業名稱" required><input style={inputStyle} value={form.property_name} onChange={set('property_name')} required /></FormField>
        <FormField label="物業地址"><input style={inputStyle} value={form.property_address} onChange={set('property_address')} /></FormField>
        <FormField label="業主名稱"><input style={inputStyle} value={form.landlord_name} onChange={set('landlord_name')} /></FormField>
        <FormField label="業主聯絡方式"><input style={inputStyle} value={form.landlord_contact} onChange={set('landlord_contact')} /></FormField>
        <FormField label="起租日" required><input type="date" style={inputStyle} value={form.start_date} onChange={set('start_date')} required /></FormField>
        <FormField label="退租日" required><input type="date" style={inputStyle} value={form.end_date} onChange={set('end_date')} required /></FormField>
        <FormField label="月租金額" required><input type="number" style={inputStyle} value={form.monthly_rent} onChange={set('monthly_rent')} required /></FormField>
        <FormField label="付款頻率">
          <select style={inputStyle} value={form.payment_frequency} onChange={set('payment_frequency')}>
            <option value="monthly">每月</option>
            <option value="quarterly">每季</option>
            <option value="annual">每年</option>
          </select>
        </FormField>
        <FormField label="每月繳款日 (1-31)"><input type="number" style={inputStyle} value={form.rent_due_day} onChange={set('rent_due_day')} min="1" max="31" /></FormField>
        <FormField label="押金餘額"><input type="number" style={inputStyle} value={form.deposit_amount} onChange={set('deposit_amount')} /></FormField>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>取消</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '保存中...' : '保存'}</button>
      </div>
    </form>
  )
}

function LeaseOverviewTab({ companyId }) {
  const [leases, setLeases] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const res = await leasesApi.list(companyId)
      setLeases(res.data)
    } finally { setLoading(false) }
  }, [companyId])

  useEffect(() => { load() }, [load])

  async function handleSave(data) {
    try {
      if (editItem) await leasesApi.update(companyId, editItem.id, data)
      else await leasesApi.create(companyId, data)
      setShowForm(false)
      load()
    } catch (e) { alert(parseApiError(e)) }
  }

  async function handleDelete(id) {
    if (!window.confirm('確定要刪除這筆租約嗎？相關資料和提醒事項也將被刪除。')) return
    try {
      await leasesApi.delete(companyId, id)
      load()
    } catch (e) { alert(parseApiError(e)) }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>載入中...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => { setEditItem(null); setShowForm(true) }}>＋ 登記新租約</button>
      </div>

      {leases.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: 'var(--color-surface)', borderRadius: 12, border: '1px dashed var(--color-border)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
          <div style={{ fontWeight: 600 }}>暫無租約記錄</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {leases.map(L => (
            <div key={L.id} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{L.property_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{L.lease_number}</div>
                </div>
                <div style={{ background: STATUS_COLOR[L.status] + '20', color: STATUS_COLOR[L.status], padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                  {STATUS_LABEL[L.status]}
                </div>
              </div>
              
              <div style={{ margin: '16px 0', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div>⏱ {L.start_date} 至 {L.end_date}</div>
                <div>💰 {fmtHKD(L.monthly_rent)} / {FREQ_LABEL[L.payment_frequency] || '月'}</div>
                <div>👤 {L.landlord_name || '-'}</div>
              </div>

              <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setEditItem(L); setShowForm(true) }}>編輯</button>
                <button className="btn btn-ghost btn-sm" style={{ color: '#EF4444' }} onClick={() => handleDelete(L.id)}>刪除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title={editItem ? '編輯租約' : '登記新租約'} onClose={() => setShowForm(false)} width={600}>
          <LeaseForm initial={editItem || {}} onSave={handleSave} onClose={() => setShowForm(false)} />
        </Modal>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 2: Rent Payments
// ══════════════════════════════════════════════════════════════════════════════

function PaymentTab({ companyId }) {
  const [leases, setLeases] = useState([])
  const [activeLeaseId, setActiveLeaseId] = useState('')
  const [activeLease, setActiveLease] = useState(null)
  const [loading, setLoading] = useState(false)
  
  useEffect(() => {
    if (!companyId) return
    leasesApi.list(companyId).then(res => {
      setLeases(res.data)
      if (res.data.length > 0) setActiveLeaseId(res.data[0].id)
    })
  }, [companyId])

  useEffect(() => {
    if (!companyId || !activeLeaseId) return
    setLoading(true)
    leasesApi.get(companyId, activeLeaseId).then(res => {
      setActiveLease(res.data)
      setLoading(false)
    })
  }, [companyId, activeLeaseId])

  async function handleGenerate() {
    try {
      await leasesApi.generatePayments(companyId, activeLeaseId, 12) // generate for 12 months/4 quarters
      const res = await leasesApi.get(companyId, activeLeaseId)
      setActiveLease(res.data)
      alert('已成功推演未來付款計劃')
    } catch (e) { alert(parseApiError(e)) }
  }

  async function handlePay(payment) {
    if (!window.confirm(`確認將 ${payment.period_label} 的租金標記為「已付」？\n系統將自動創建支出憑證。`)) return
    try {
      await leasesApi.updatePayment(companyId, payment.id, { status: 'paid' })
      const res = await leasesApi.get(companyId, activeLeaseId)
      setActiveLease(res.data)
    } catch (e) { alert(parseApiError(e)) }
  }

  async function handleDeletePayment(payment) {
    if (!window.confirm(`確定要刪除 ${payment.period_label} 這筆付款記錄嗎？`)) return
    try {
      await leasesApi.deletePayment(companyId, payment.id)
      const res = await leasesApi.get(companyId, activeLeaseId)
      setActiveLease(res.data)
    } catch (e) { alert(parseApiError(e)) }
  }

  return (
    <div>
      {leases.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <select style={{ ...inputStyle, width: 300 }} value={activeLeaseId} onChange={e => setActiveLeaseId(e.target.value)}>
            {leases.map(L => <option key={L.id} value={L.id}>{L.property_name} ({L.lease_number})</option>)}
          </select>
        </div>
      )}

      {!activeLease || loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>載入中...</div>
      ) : (
        <div style={{ background: 'var(--color-surface)', borderRadius: 12, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
          <div style={{ padding: 16, borderBottom: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: 15 }}>租金付款計劃 ({activeLease.property_name})</h4>
            <button className="btn btn-primary btn-sm" onClick={handleGenerate}>推演未來 1 年付款紀錄</button>
          </div>
          
          {activeLease.payments.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>暫無付款計劃。請點擊上方按鈕推演。</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--color-bg)', borderBottom: '1.5px solid var(--color-border)' }}>
                  {['期數/月份', '週期範圍', '到期日', '應付金額', '狀態', '操作/聯動'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--color-text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeLease.payments.sort((a,b) => a.period_start.localeCompare(b.period_start)).map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{p.period_label}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--color-text-muted)', fontSize: 12 }}>{p.period_start} ~ {p.period_end}</td>
                    <td style={{ padding: '12px 16px' }}>{p.due_date}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{fmtHKD(p.amount)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 11, background: PAYMENT_STATUS_COLOR[p.status]+'20', color: PAYMENT_STATUS_COLOR[p.status], padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                        {PAYMENT_STATUS_LABEL[p.status]}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
                      {p.status === 'pending' ? (
                        <button className="btn btn-sm" style={{ background: '#D1FAE5', color: '#065F46', border: 'none', padding: '4px 10px', borderRadius: 6, fontWeight: 600 }} onClick={() => handlePay(p)}>確認已付</button>
                      ) : p.expense_voucher_id ? (
                        <span style={{ fontSize: 12, color: '#2563EB' }}>🔗 支出憑證</span>
                      ) : '-'}
                      <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', color: '#EF4444', border: 'none' }} onClick={() => handleDeletePayment(p)}>刪除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Page
// ══════════════════════════════════════════════════════════════════════════════

export default function LeasesPage() {
  const { currentCompany } = useApp()
  const [tab, setTab] = useState('overview')

  if (!currentCompany) return null
  const cid = currentCompany.id

  const TABS = [
    { id: 'overview', label: '物業租約' },
    { id: 'payments', label: '租金記錄' },
    // { id: 'misc', label: '雜費台賬' },  // Can add later if needed
    // { id: 'deposit', label: '押金管理' }, // Can add later if needed
  ]

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 16px' }}>辦公室租約 (Lease Management)</h2>
        <div style={{ display: 'flex', gap: 24, borderBottom: '1.5px solid var(--color-border-light)' }}>
          {TABS.map(t => (
            <div
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '8px 4px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                color: tab === t.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
                borderBottom: tab === t.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                marginBottom: -1.5,
              }}
            >
              {t.label}
            </div>
          ))}
        </div>
      </div>

      {tab === 'overview' && <LeaseOverviewTab companyId={cid} />}
      {tab === 'payments' && <PaymentTab companyId={cid} />}
    </div>
  )
}
