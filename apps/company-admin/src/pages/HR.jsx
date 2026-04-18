import React, { useState, useEffect, useCallback } from 'react'
import { useApp } from '../contexts/AppContext.jsx'
import api from '../api/index.js'

// ─── API 调用层 ──────────────────────────────────────────────────────────────
const hrApi = {
  // 员工
  listEmployees: (cid, params) => api.get(`/companies/${cid}/hr/employees`, { params }),
  createEmployee: (cid, data) => api.post(`/companies/${cid}/hr/employees`, data),
  updateEmployee: (cid, id, data) => api.put(`/companies/${cid}/hr/employees/${id}`, data),
  terminateEmployee: (cid, id, data) => api.post(`/companies/${cid}/hr/employees/${id}/terminate`, data),
  // 薪资
  listPayroll: (cid, params) => api.get(`/companies/${cid}/hr/payroll`, { params }),
  generatePayroll: (cid, month) => api.post(`/companies/${cid}/hr/payroll/generate`, null, { params: { month } }),
  createPayroll: (cid, data) => api.post(`/companies/${cid}/hr/payroll`, data),
  updatePayroll: (cid, id, data) => api.put(`/companies/${cid}/hr/payroll/${id}`, data),
  confirmPayroll: (cid, id) => api.post(`/companies/${cid}/hr/payroll/${id}/confirm`),
  laborCostSummary: (cid, month) => api.get(`/companies/${cid}/hr/payroll/labor-cost`, { params: { month } }),
  mpfSummary: (cid, month) => api.get(`/companies/${cid}/hr/payroll/mpf-summary`, { params: { month } }),
  payslipPdfUrl: (cid, id) => `/api/companies/${cid}/hr/payroll/${id}/pdf`,
  empfExportUrl: (cid, month) => `/api/companies/${cid}/hr/payroll/mpf-export?month=${month}`,
  // 假期
  leaveBalances: (cid, year) => api.get(`/companies/${cid}/hr/leave/balances`, { params: year ? { year } : {} }),
  listLeave: (cid, params) => api.get(`/companies/${cid}/hr/leave`, { params }),
  createLeave: (cid, data) => api.post(`/companies/${cid}/hr/leave`, data),
  approveLeave: (cid, id, data) => api.put(`/companies/${cid}/hr/leave/${id}/approve`, data),
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────
const EMPLOYMENT_TYPE_LABEL = { full_time: '全職', part_time: '兼職', contract: '合約' }
const LEAVE_TYPE_LABEL = {
  annual: '年假', sick: '病假', statutory: '法定假日',
  no_pay: '無薪假', maternity: '產假', paternity: '侍產假',
}
const LEAVE_STATUS_COLOR = { pending: '#F59E0B', approved: '#10B981', rejected: '#EF4444' }
const LEAVE_STATUS_LABEL = { pending: '待審批', approved: '已批准', rejected: '已駁回' }

function fmtHKD(n) {
  return `HK$${Number(n || 0).toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function getInitials(name) {
  if (!name) return '?'
  return name.charAt(0).toUpperCase()
}
function getAvatarColor(name) {
  const colors = ['#6366F1','#8B5CF6','#EC4899','#10B981','#F59E0B','#2563EB','#EF4444']
  const idx = (name || '').charCodeAt(0) % colors.length
  return colors[idx]
}

/**
 * 统一解析 FastAPI 错误响应为可读字符串。
 * FastAPI 422 的 detail 是数组：[{loc, msg, type}, ...]
 */
function parseApiError(err) {
  const detail = err?.response?.data?.detail
  if (!detail) return '操作失敗，請稍後再試'
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map(d => {
        const field = Array.isArray(d.loc) ? d.loc.slice(1).join(' → ') : ''
        return field ? `${field}：${d.msg}` : d.msg
      })
      .join('\n')
  }
  return JSON.stringify(detail)
}

// ─── 通用组件 ─────────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const styles = {
    draft:     { bg: '#F3F4F6', color: '#6B7280', label: '草稿' },
    confirmed: { bg: '#D1FAE5', color: '#065F46', label: '已確認' },
    active:    { bg: '#DBEAFE', color: '#1D4ED8', label: '在職' },
    inactive:  { bg: '#FEE2E2', color: '#991B1B', label: '離職' },
  }
  const s = styles[status] || { bg: '#F3F4F6', color: '#6B7280', label: status }
  return (
    <span style={{
      background: s.bg, color: s.color, fontSize: 11, fontWeight: 600,
      padding: '2px 8px', borderRadius: 20, display: 'inline-block',
    }}>{s.label}</span>
  )
}

function Modal({ title, onClose, children, width = 540 }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--color-surface)', borderRadius: 16, width: '100%', maxWidth: width,
        maxHeight: '90vh', overflowY: 'auto', padding: 28,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 20, cursor: 'pointer',
            color: 'var(--color-text-muted)', lineHeight: 1,
          }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FormField({ label, children, required }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4 }}>
        {label}{required && <span style={{ color: '#EF4444' }}> *</span>}
      </label>
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '8px 12px',
  border: '1.5px solid var(--color-border)', borderRadius: 8, fontSize: 14,
  background: 'var(--color-bg)', color: 'var(--color-text-primary)',
  outline: 'none', transition: 'border-color .2s',
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 1 — 员工档案
// ══════════════════════════════════════════════════════════════════════════════

function EmployeeForm({ initial = {}, onSave, onClose }) {
  const [form, setForm] = useState({
    name_zh: '', name_en: '', hkid: '', gender: '', date_of_birth: '',
    position: '', department: '', employment_type: 'full_time',
    hire_date: '', base_salary: '', salary_type: 'monthly',
    is_continuous_contract: true, mpf_scheme: '', mpf_member_no: '',
    bank_name: '', email: '', phone: '', emergency_contact: '', notes: '',
    ...initial,
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      // 清理空字符串：日期/数字字段不可发空串给FastAPI，否则触发422
      const payload = {
        ...form,
        base_salary:    form.base_salary ? Number(form.base_salary) : null,
        date_of_birth:  form.date_of_birth  || null,
        hire_date:      form.hire_date      || null,
        gender:         form.gender         || null,
        name_en:        form.name_en        || null,
        hkid:           form.hkid           || null,
        position:       form.position       || null,
        department:     form.department     || null,
        mpf_scheme:     form.mpf_scheme     || null,
        mpf_member_no:  form.mpf_member_no  || null,
        bank_name:      form.bank_name      || null,
        bank_account:   form.bank_account   || null,
        email:          form.email          || null,
        phone:          form.phone          || null,
        emergency_contact: form.emergency_contact || null,
        notes:          form.notes          || null,
      }
      await onSave(payload)
      onClose()
    } catch (err) {
      alert(parseApiError(err))
    } finally {
      setSaving(false)
    }
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
        <FormField label="中文姓名" required>
          <input style={inputStyle} value={form.name_zh} onChange={set('name_zh')} required />
        </FormField>
        <FormField label="English Name">
          <input style={inputStyle} value={form.name_en} onChange={set('name_en')} />
        </FormField>
        <FormField label="HKID 號碼">
          <input style={inputStyle} value={form.hkid} onChange={set('hkid')} placeholder="A123456(7)" />
        </FormField>
        <FormField label="性別">
          <select style={inputStyle} value={form.gender} onChange={set('gender')}>
            <option value="">請選擇</option>
            <option value="male">男</option>
            <option value="female">女</option>
          </select>
        </FormField>
        <FormField label="出生日期">
          <input type="date" style={inputStyle} value={form.date_of_birth} onChange={set('date_of_birth')} />
        </FormField>
        <FormField label="入職日期">
          <input type="date" style={inputStyle} value={form.hire_date} onChange={set('hire_date')} />
        </FormField>
        <FormField label="職位">
          <input style={inputStyle} value={form.position} onChange={set('position')} />
        </FormField>
        <FormField label="部門">
          <input style={inputStyle} value={form.department} onChange={set('department')} />
        </FormField>
        <FormField label="僱傭類型">
          <select style={inputStyle} value={form.employment_type} onChange={set('employment_type')}>
            <option value="full_time">全職</option>
            <option value="part_time">兼職</option>
            <option value="contract">合約</option>
          </select>
        </FormField>
        <FormField label="基本月薪 (HKD)">
          <input type="number" style={inputStyle} value={form.base_salary} onChange={set('base_salary')} min="0" step="100" />
        </FormField>
        <FormField label="強積金計劃">
          <input style={inputStyle} value={form.mpf_scheme} onChange={set('mpf_scheme')} placeholder="如：宏利強積金" />
        </FormField>
        <FormField label="eMPF 成員編號">
          <input style={inputStyle} value={form.mpf_member_no} onChange={set('mpf_member_no')} />
        </FormField>
        <FormField label="銀行名稱">
          <input style={inputStyle} value={form.bank_name} onChange={set('bank_name')} />
        </FormField>
        <FormField label="電郵">
          <input type="email" style={inputStyle} value={form.email} onChange={set('email')} />
        </FormField>
        <FormField label="電話">
          <input style={inputStyle} value={form.phone} onChange={set('phone')} />
        </FormField>
        <FormField label="緊急聯絡人">
          <input style={inputStyle} value={form.emergency_contact} onChange={set('emergency_contact')} placeholder="姓名/關係/電話" />
        </FormField>
      </div>
      <FormField label="備注">
        <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={form.notes} onChange={set('notes')} />
      </FormField>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <input type="checkbox" id="continuous" checked={form.is_continuous_contract}
          onChange={set('is_continuous_contract')} style={{ width: 16, height: 16, cursor: 'pointer' }} />
        <label htmlFor="continuous" style={{ fontSize: 13, cursor: 'pointer' }}>
          符合「468規則」連續性合約（4週工時≥68小時）
        </label>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>取消</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </form>
  )
}

function EmployeeCard({ emp, onEdit, onTerminate }) {
  const avatarColor = getAvatarColor(emp.name_zh)
  return (
    <div style={{
      background: 'var(--color-surface)', borderRadius: 12, padding: 20,
      border: '1px solid var(--color-border)', display: 'flex', gap: 16,
      alignItems: 'flex-start', transition: 'box-shadow .2s',
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* 头像 */}
      <div style={{
        width: 48, height: 48, borderRadius: '50%', background: avatarColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 20, fontWeight: 700, flexShrink: 0,
      }}>
        {getInitials(emp.name_zh)}
      </div>

      {/* 信息 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{emp.name_zh}</span>
          {emp.name_en && <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{emp.name_en}</span>}
          <StatusBadge status={emp.is_active ? 'active' : 'inactive'} />
          <span style={{
            fontSize: 11, background: '#EFF6FF', color: '#1D4ED8',
            padding: '1px 6px', borderRadius: 10, fontWeight: 600,
          }}>{emp.employee_number}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {emp.position && <span>💼 {emp.position}</span>}
          {emp.department && <span>🏢 {emp.department}</span>}
          {emp.base_salary && <span>💰 {fmtHKD(emp.base_salary)}/月</span>}
          {emp.employment_type && <span>⏱ {EMPLOYMENT_TYPE_LABEL[emp.employment_type]}</span>}
          {emp.hire_date && <span>📅 {emp.hire_date}</span>}
        </div>
        {emp.mpf_scheme && (
          <div style={{ fontSize: 12, color: '#6366F1', marginTop: 4 }}>🏦 MPF: {emp.mpf_scheme}</div>
        )}
      </div>

      {/* 操作 */}
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => onEdit(emp)}>編輯</button>
        {emp.is_active && (
          <button className="btn btn-sm" style={{
            background: '#FEE2E2', color: '#991B1B', border: 'none', padding: '4px 10px',
            borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 600,
          }} onClick={() => onTerminate(emp)}>離職</button>
        )}
      </div>
    </div>
  )
}

function EmployeeTab({ companyId }) {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeOnly, setActiveOnly] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editEmp, setEditEmp] = useState(null)
  const [terminateEmp, setTerminateEmp] = useState(null)
  const [terminateDate, setTerminateDate] = useState(new Date().toISOString().slice(0, 10))

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const res = await hrApi.listEmployees(companyId, { active_only: activeOnly })
      setEmployees(res.data)
    } catch { } finally { setLoading(false) }
  }, [companyId, activeOnly])

  useEffect(() => { load() }, [load])

  async function handleSave(data) {
    if (editEmp) {
      await hrApi.updateEmployee(companyId, editEmp.id, data)
    } else {
      await hrApi.createEmployee(companyId, data)
    }
    load()
  }

  async function handleTerminate() {
    await hrApi.terminateEmployee(companyId, terminateEmp.id, { termination_date: terminateDate })
    setTerminateEmp(null)
    load()
  }

  const filtered = employees.filter(e =>
    !search ||
    e.name_zh.includes(search) ||
    (e.name_en || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.position || '').includes(search) ||
    (e.department || '').includes(search)
  )

  return (
    <div>
      {/* 工具栏 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          style={{ ...inputStyle, maxWidth: 240, flex: 1 }}
          placeholder="🔍 搜索員工姓名/職位/部門"
          value={search} onChange={e => setSearch(e.target.value)}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)}
            style={{ width: 15, height: 15 }} />
          僅顯示在職
        </label>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => { setEditEmp(null); setShowForm(true) }}>
          ＋ 新增員工
        </button>
      </div>

      {/* 员工列表 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>載入中...</div>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, color: 'var(--color-text-muted)',
          background: 'var(--color-surface)', borderRadius: 12, border: '1px dashed var(--color-border)',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>尚無員工記錄</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>點擊「新增員工」開始管理員工檔案</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(emp => (
            <EmployeeCard
              key={emp.id} emp={emp}
              onEdit={e => { setEditEmp(e); setShowForm(true) }}
              onTerminate={e => setTerminateEmp(e)}
            />
          ))}
        </div>
      )}

      {/* 员工新增/编辑弹窗 */}
      {showForm && (
        <Modal
          title={editEmp ? `編輯員工 — ${editEmp.name_zh}` : '新增員工'}
          onClose={() => setShowForm(false)}
          width={620}
        >
          <EmployeeForm
            initial={editEmp || {}}
            onSave={handleSave}
            onClose={() => setShowForm(false)}
          />
        </Modal>
      )}

      {/* 离职确认弹窗 */}
      {terminateEmp && (
        <Modal title={`標記離職 — ${terminateEmp.name_zh}`} onClose={() => setTerminateEmp(null)} width={400}>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 16 }}>
            此操作將把員工標記為離職狀態，不會刪除任何歷史數據。
          </p>
          <FormField label="離職日期" required>
            <input type="date" style={inputStyle} value={terminateDate} onChange={e => setTerminateDate(e.target.value)} />
          </FormField>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setTerminateEmp(null)}>取消</button>
            <button className="btn" style={{ background: '#EF4444', color: '#fff' }} onClick={handleTerminate}>
              確認離職
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 2 — 薪资管理
// ══════════════════════════════════════════════════════════════════════════════

function PayrollTab({ companyId }) {
  const currentMonth = new Date().toISOString().slice(0, 7)
  const [month, setMonth] = useState(currentMonth)
  const [records, setRecords] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  const load = useCallback(async () => {
    if (!companyId || !month) return
    setLoading(true)
    try {
      const [res, sumRes] = await Promise.all([
        hrApi.listPayroll(companyId, { month }),
        hrApi.laborCostSummary(companyId, month)
      ])
      setRecords(res.data)
      setSummary(sumRes.data)
    } catch { } finally { setLoading(false) }
  }, [companyId, month])

  useEffect(() => { load() }, [load])

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await hrApi.generatePayroll(companyId, month)
      alert(res.data.message)
      load()
    } catch (err) {
      alert(parseApiError(err))
    } finally { setGenerating(false) }
  }

  async function handleConfirm(id) {
    if (!window.confirm('確認此薪資单？確認後不可修改，將自動生成支出憑證。')) return
    try {
      const res = await hrApi.confirmPayroll(companyId, id)
      load()
      const sync = res.data.expense_sync
      if (sync && !sync.skipped) {
        alert(
          `✅ 薪資单已確認，已自動寫入支出憑證：\n` +
          `\n💰 員工薪資：${sync.salary_voucher}（${fmtHKD(sync.salary_amount)}）` +
          `\n🏦 雇主MPF：${sync.mpf_voucher}（${fmtHKD(sync.mpf_amount)}）` +
          `\n\n公司實際成本已記入「支出管理」`
        )
      }
    } catch (err) { alert(parseApiError(err)) }
  }

  function downloadPdf(id) {
    const token = localStorage.getItem('token')
    fetch(hrApi.payslipPdfUrl(companyId, id), {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.blob()).then(blob => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `payslip_${month}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  // 汇总数据
  const totalGross   = records.reduce((s, r) => s + (r.gross_pay || 0), 0)
  const totalEmpMPF  = records.reduce((s, r) => s + (r.employee_mpf || 0), 0)
  const totalErMPF   = records.reduce((s, r) => s + (r.employer_mpf || 0), 0)
  const totalNet     = records.reduce((s, r) => s + (r.net_pay || 0), 0)
  const totalCost    = totalGross + totalErMPF  // 公司實務全部成本
  const confirmedCnt = records.filter(r => r.status === 'confirmed').length

  return (
    <div>
      {/* 控制栏 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
            薪資月份
          </label>
          <input type="month" style={{ ...inputStyle, width: 160 }} value={month} onChange={e => setMonth(e.target.value)} />
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
          {generating ? '生成中...' : `⚡ 批量生成 ${month} 草稿薪資單`}
        </button>
      </div>

      {/* 汇总卡片 */}
      {records.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 12 }}>
            {[
              { label: '應發合計', value: totalGross, icon: '💵', sub: '底薪+獎金+津購' },
              { label: '雇員MPF', value: totalEmpMPF, icon: '👤', sub: '員工自付' },
              { label: '雇主MPF', value: totalErMPF, icon: '🏢', sub: '公司額外成本' },
              { label: '實發合計', value: totalNet, icon: '✅', sub: '實际到手' },
              { label: '公司總成本', value: totalCost, icon: '📊', sub: '薪酸+雇主MPF', accent: true },
            ].map(({ label, value, icon, sub, accent }) => (
              <div key={label} style={{
                background: accent ? 'linear-gradient(135deg, #4F46E5, #7C3AED)' : 'var(--color-surface)',
                color: accent ? '#fff' : 'var(--color-text-primary)',
                borderRadius: 12, padding: '14px 16px',
                border: accent ? 'none' : '1px solid var(--color-border)',
              }}>
                <div style={{ fontSize: 18, marginBottom: 2 }}>{icon}</div>
                <div style={{ fontSize: 10, opacity: .75, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtHKD(value)}</div>
                <div style={{ fontSize: 10, opacity: .65, marginTop: 2 }}>{sub}</div>
              </div>
            ))}
          </div>
          {/* 公司成本转入支出提示 */}
          {confirmedCnt > 0 && (
            <div style={{
              background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10,
              padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#1D4ED8',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>🔗</span>
              <span>
                {confirmedCnt} 張已確認薪資單的成本已自動寫入「支出管理」。
                查看方法：點擊左側選單「<strong>支出管理</strong>」，
                篩選條件選<strong>已確認</strong> + 分類選<strong>👥 員工津貼福利</strong>，
                即可看到所有薪資及 MPF 憑證（凭证号前綴 PAY- / MPF-）。
              </span>
            </div>
          )}
        </>
      )}

      {/* 薪资单表格 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>載入中...</div>
      ) : records.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, color: 'var(--color-text-muted)',
          background: 'var(--color-surface)', borderRadius: 12, border: '1px dashed var(--color-border)',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>本月無薪資記錄</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>點擊「批量生成草稿薪資單」為所有在職員工建立記錄</div>
        </div>
      ) : (
        <div style={{ background: 'var(--color-surface)', borderRadius: 12, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)', borderBottom: '1.5px solid var(--color-border)' }}>
                {['員工', '底薪', '獎金/津貼', '應發', '雇員MPF', '雇主MPF', '實發', '狀態', '操作'].map(h => (
                  <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border-light)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,.015)' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }}>{r.employee_name}</td>
                  <td style={{ padding: '12px 14px' }}>{fmtHKD(r.base_salary)}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--color-text-muted)' }}>
                    {fmtHKD((r.bonus || 0) + (r.allowances || 0) + (r.overtime_pay || 0))}
                  </td>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }}>{fmtHKD(r.gross_pay)}</td>
                  <td style={{ padding: '12px 14px', color: '#DC2626' }}>-{fmtHKD(r.employee_mpf)}</td>
                  <td style={{ padding: '12px 14px', color: '#7C3AED' }}>{fmtHKD(r.employer_mpf)}</td>
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: '#059669' }}>{fmtHKD(r.net_pay)}</td>
                  <td style={{ padding: '12px 14px' }}><StatusBadge status={r.status} /></td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {r.status === 'draft' && (
                        <button className="btn btn-sm" style={{
                          background: '#D1FAE5', color: '#065F46', border: 'none',
                          padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 600,
                        }} onClick={() => handleConfirm(r.id)}>確認</button>
                      )}
                      {r.status === 'confirmed' && (
                        <button className="btn btn-sm" style={{
                          background: '#DBEAFE', color: '#1D4ED8', border: 'none',
                          padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 600,
                        }} onClick={() => downloadPdf(r.id)}>📄 PDF</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 3 — 假期管理
// ══════════════════════════════════════════════════════════════════════════════

function LeaveTab({ companyId }) {
  const currentYear = new Date().getFullYear()
  const [balances, setBalances] = useState([])
  const [requests, setRequests] = useState([])
  const [employees, setEmployees] = useState([])
  const [showLeaveForm, setShowLeaveForm] = useState(false)
  const [leaveForm, setLeaveForm] = useState({ employee_id: '', leave_type: 'annual', start_date: '', end_date: '', days: 1, reason: '' })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [balRes, reqRes, empRes] = await Promise.all([
        hrApi.leaveBalances(companyId, currentYear),
        hrApi.listLeave(companyId, {}),
        hrApi.listEmployees(companyId, { active_only: true }),
      ])
      setBalances(balRes.data)
      setRequests(reqRes.data)
      setEmployees(empRes.data)
    } catch { } finally { setLoading(false) }
  }, [companyId, currentYear])

  useEffect(() => { load() }, [load])

  async function handleApprove(id, approved) {
    const notes = approved ? '' : prompt('請輸入驳回原因（可選）：') || ''
    try {
      await hrApi.approveLeave(companyId, id, { approved, notes })
      load()
    } catch (err) { alert(parseApiError(err)) }
  }

  async function handleSubmitLeave(e) {
    e.preventDefault()
    try {
      await hrApi.createLeave(companyId, leaveForm)
      setShowLeaveForm(false)
      load()
    } catch (err) { alert(parseApiError(err)) }
  }

  const setLF = (k) => (e) => setLeaveForm(f => ({ ...f, [k]: e.target.value }))

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>載入中...</div>

  return (
    <div>
      {/* 假期余额卡片区 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>📊 {currentYear}年 假期餘額</h4>
        <button className="btn btn-primary btn-sm" onClick={() => setShowLeaveForm(true)}>＋ 新增申請</button>
      </div>

      {balances.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 40, color: 'var(--color-text-muted)',
          background: 'var(--color-surface)', borderRadius: 12, border: '1px dashed var(--color-border)', marginBottom: 24,
        }}>尚無假期餘額記錄，請先在「員工檔案」中新增員工</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 28 }}>
          {balances.map(b => (
            <div key={b.id} style={{
              background: 'var(--color-surface)', borderRadius: 12, padding: 18,
              border: '1px solid var(--color-border)',
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>👤 {b.employee_name}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { icon: '🌴', label: '年假', entitled: b.annual_leave_entitled, taken: b.annual_leave_taken, balance: b.annual_leave_balance, color: '#10B981' },
                  { icon: '🏥', label: '有薪病假', entitled: b.sick_leave_entitled, taken: b.sick_leave_taken, balance: b.sick_leave_entitled - b.sick_leave_taken, color: '#6366F1' },
                  { icon: '🎌', label: '法定假日', entitled: b.statutory_holidays, taken: 0, balance: b.statutory_holidays, color: '#F59E0B' },
                ].map(({ icon, label, entitled, taken, balance, color }) => (
                  <div key={label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>{icon} {label}</span>
                      <span style={{ fontWeight: 700 }}>
                        <span style={{ color }}>{balance}</span>
                        <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>/{entitled}天</span>
                      </span>
                    </div>
                    <div style={{ background: '#F3F4F6', borderRadius: 4, height: 4, overflow: 'hidden' }}>
                      <div style={{
                        background: color, height: '100%',
                        width: `${entitled > 0 ? ((balance / entitled) * 100) : 0}%`,
                        transition: 'width .4s',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 假期申请列表 */}
      <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>📋 假期申請記錄</h4>
      {requests.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 40, color: 'var(--color-text-muted)',
          background: 'var(--color-surface)', borderRadius: 12, border: '1px dashed var(--color-border)',
        }}>尚無假期申請</div>
      ) : (
        <div style={{ background: 'var(--color-surface)', borderRadius: 12, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)', borderBottom: '1.5px solid var(--color-border)' }}>
                {['員工', '假期類型', '開始日', '結束日', '天數', '原因', '狀態', '操作'].map(h => (
                  <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border-light)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,.015)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{r.employee_name}</td>
                  <td style={{ padding: '10px 14px' }}>{LEAVE_TYPE_LABEL[r.leave_type] || r.leave_type}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--color-text-muted)' }}>{String(r.start_date)}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--color-text-muted)' }}>{String(r.end_date)}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{r.days}天</td>
                  <td style={{ padding: '10px 14px', color: 'var(--color-text-muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason || '-'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      background: LEAVE_STATUS_COLOR[r.status] + '20',
                      color: LEAVE_STATUS_COLOR[r.status],
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                    }}>{LEAVE_STATUS_LABEL[r.status]}</span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {r.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={{
                          background: '#D1FAE5', color: '#065F46', border: 'none',
                          padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 600,
                        }} onClick={() => handleApprove(r.id, true)}>批准</button>
                        <button style={{
                          background: '#FEE2E2', color: '#991B1B', border: 'none',
                          padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 600,
                        }} onClick={() => handleApprove(r.id, false)}>駁回</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 新增假期申请弹窗 */}
      {showLeaveForm && (
        <Modal title="新增假期申請" onClose={() => setShowLeaveForm(false)} width={420}>
          <form onSubmit={handleSubmitLeave}>
            <FormField label="員工" required>
              <select style={inputStyle} value={leaveForm.employee_id} onChange={setLF('employee_id')} required>
                <option value="">請選擇員工</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name_zh}</option>)}
              </select>
            </FormField>
            <FormField label="假期類型" required>
              <select style={inputStyle} value={leaveForm.leave_type} onChange={setLF('leave_type')}>
                {Object.entries(LEAVE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <FormField label="開始日期" required>
                <input type="date" style={inputStyle} value={leaveForm.start_date} onChange={setLF('start_date')} required />
              </FormField>
              <FormField label="結束日期" required>
                <input type="date" style={inputStyle} value={leaveForm.end_date} onChange={setLF('end_date')} required />
              </FormField>
            </div>
            <FormField label="天數" required>
              <input type="number" style={inputStyle} value={leaveForm.days} onChange={setLF('days')} min="0.5" step="0.5" required />
            </FormField>
            <FormField label="原因">
              <textarea style={{ ...inputStyle, minHeight: 60 }} value={leaveForm.reason} onChange={setLF('reason')} />
            </FormField>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowLeaveForm(false)}>取消</button>
              <button type="submit" className="btn btn-primary">提交申請</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 4 — MPF 报表
// ══════════════════════════════════════════════════════════════════════════════

function MPFTab({ companyId }) {
  const currentMonth = new Date().toISOString().slice(0, 7)
  const [month, setMonth] = useState(currentMonth)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  async function loadSummary() {
    if (!month) return
    setLoading(true)
    try {
      const res = await hrApi.mpfSummary(companyId, month)
      setSummary(res.data)
    } catch (err) {
      if (err.response?.status === 404) setSummary({ records: [], total_employer_mpf: 0, total_employee_mpf: 0, total_mpf: 0, total_gross_pay: 0, total_employees: 0 })
      else alert(parseApiError(err))
    } finally { setLoading(false) }
  }

  useEffect(() => { if (companyId) loadSummary() }, [companyId, month])

  async function handleEmpfExport() {
    setExporting(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(hrApi.empfExportUrl(companyId, month), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.detail || '導出失敗')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `eMPF_Contribution_${month}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch { alert('導出失敗') } finally { setExporting(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>查詢月份</label>
          <input type="month" style={{ ...inputStyle, width: 160 }} value={month} onChange={e => setMonth(e.target.value)} />
        </div>
        <div style={{ flex: 1 }} />
        {summary && summary.total_employees > 0 && (
          <button className="btn btn-primary" onClick={handleEmpfExport} disabled={exporting}>
            {exporting ? '導出中...' : '📤 導出積金易文件 (eMPF CSV)'}
          </button>
        )}
      </div>

      {/* eMPF说明横幅 */}
      <div style={{
        background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
        border: '1px solid #BFDBFE', borderRadius: 12, padding: '14px 18px',
        marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <span style={{ fontSize: 20 }}>ℹ️</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#1D4ED8', marginBottom: 4 }}>關於積金易（eMPF）批量上傳</div>
          <div style={{ fontSize: 12, color: '#3B82F6', lineHeight: 1.6 }}>
            導出的 CSV 文件符合積金易平台 Bulk Upload 標準格式。上傳前請登入
            <a href="https://www.empf.org.hk" target="_blank" rel="noreferrer" style={{ color: '#1D4ED8', fontWeight: 600 }}> empf.org.hk </a>
            確認您的 <b>Payroll Group ID</b> 並填入 CSV 文件中的對應欄位後，再提交至積金易平台。
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>載入中...</div>
      ) : !summary || summary.total_employees === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, color: 'var(--color-text-muted)',
          background: 'var(--color-surface)', borderRadius: 12, border: '1px dashed var(--color-border)',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏦</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>本月無已確認薪資記錄</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>請先在「薪資管理」頁面確認本月所有薪資單</div>
        </div>
      ) : (
        <>
          {/* 汇总卡片 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: '雇員供款合計', value: summary.total_employee_mpf, icon: '👤', color: '#DC2626' },
              { label: '雇主供款合計', value: summary.total_employer_mpf, icon: '🏢', color: '#7C3AED' },
              { label: 'MPF 總供款', value: summary.total_mpf, icon: '🏦', color: '#059669', primary: true },
            ].map(({ label, value, icon, color, primary }) => (
              <div key={label} style={{
                background: primary ? '#D1FAE5' : 'var(--color-surface)',
                borderRadius: 12, padding: '16px 20px',
                border: `1px solid ${primary ? '#6EE7B7' : 'var(--color-border)'}`,
              }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>{icon}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color }}>{fmtHKD(value)}</div>
              </div>
            ))}
          </div>

          {/* 明细表 */}
          <div style={{ background: 'var(--color-surface)', borderRadius: 12, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--color-bg)', borderBottom: '1.5px solid var(--color-border)' }}>
                  {['員工姓名', 'eMPF成員編號', '相關入息', '雇員供款 (5%)', '雇主供款 (5%)', '合計供款', '豁免'].map(h => (
                    <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.records.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border-light)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,.015)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{r.employee_name}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--color-text-muted)', fontSize: 12 }}>–</td>
                    <td style={{ padding: '10px 14px' }}>{fmtHKD(r.gross_pay)}</td>
                    <td style={{ padding: '10px 14px', color: '#DC2626', fontWeight: 600 }}>{fmtHKD(r.employee_mpf)}</td>
                    <td style={{ padding: '10px 14px', color: '#7C3AED', fontWeight: 600 }}>{fmtHKD(r.employer_mpf)}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700 }}>{fmtHKD((r.employee_mpf || 0) + (r.employer_mpf || 0))}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {r.mpf_exempt && (
                        <span style={{
                          background: '#FEF3C7', color: '#92400E', fontSize: 10,
                          padding: '2px 6px', borderRadius: 10, fontWeight: 700,
                        }}>豁免</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 主页面
// ══════════════════════════════════════════════════════════════════════════════

const TABS = [
  { id: 'employees', label: '👤 員工檔案' },
  { id: 'payroll',   label: '💰 薪資管理' },
  { id: 'leave',     label: '🌴 假期管理' },
  { id: 'mpf',       label: '🏦 MPF報表' },
]

export default function HRPage() {
  const { currentCompany } = useApp()
  const [activeTab, setActiveTab] = useState('employees')
  const companyId = currentCompany?.id

  return (
    <div>
      {/* 页面标题 */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>👨‍💼 員工管理</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: 13 }}>
          員工檔案 · 薪資管理 · 假期追蹤 · 強積金供款 · 積金易導出
        </p>
      </div>

      {/* Tab 导航 */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 24,
        background: 'var(--color-surface)', borderRadius: 12, padding: 6,
        border: '1px solid var(--color-border)', width: 'fit-content',
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, transition: 'all .2s',
              background: activeTab === tab.id ? 'var(--color-primary)' : 'transparent',
              color: activeTab === tab.id ? '#fff' : 'var(--color-text-muted)',
              boxShadow: activeTab === tab.id ? '0 2px 8px rgba(37,99,235,.4)' : 'none',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      {!companyId ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--color-text-muted)' }}>
          請先選擇公司
        </div>
      ) : (
        <>
          {activeTab === 'employees' && <EmployeeTab companyId={companyId} />}
          {activeTab === 'payroll'   && <PayrollTab  companyId={companyId} />}
          {activeTab === 'leave'     && <LeaveTab    companyId={companyId} />}
          {activeTab === 'mpf'       && <MPFTab      companyId={companyId} />}
        </>
      )}
    </div>
  )
}
