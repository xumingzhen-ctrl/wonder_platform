import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../contexts/AppContext.jsx'
import { invoicesApi } from '../api/index.js'

const STATUS_ZH = {
  draft: '草稿', sent: '已發出', paid: '已收款',
  partial: '部分收款', overdue: '逾期', void: '已作廢'
}
const STATUS_CLASS = {
  draft: 'badge-draft', sent: 'badge-sent', paid: 'badge-paid',
  partial: 'badge-partial', overdue: 'badge-overdue', void: 'badge-void',
}
const STATUS_FILTERS = ['全部', 'draft', 'sent', 'overdue', 'partial', 'paid', 'void']

export default function InvoicesPage() {
  const { currentCompany } = useApp()
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('全部')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!currentCompany) return
    setLoading(true)
    const params = {}
    if (statusFilter !== '全部') params.status = statusFilter
    if (search) params.search = search

    invoicesApi.list(currentCompany.id, params)
      .then(r => setInvoices(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [currentCompany?.id, statusFilter, search])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">發票管理</h1>
          <p className="page-subtitle">管理所有發票、報價單及收款記錄</p>
        </div>
        <Link to="/invoices/new" className="btn btn-primary" id="new-invoice-btn">
          ＋ 新增發票
        </Link>
      </div>

      {/* 筛选栏 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* 状态筛选 */}
        <div style={{ display: 'flex', gap: 6 }}>
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === '全部' ? '全部' : STATUS_ZH[s]}
            </button>
          ))}
        </div>

        {/* 搜索 */}
        <div className="search-bar" style={{ marginLeft: 'auto' }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>🔍</span>
          <input
            placeholder="搜索發票號、客戶名..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            id="invoice-search"
          />
        </div>
      </div>

      {/* 发票列表 */}
      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" style={{ width: 28, height: 28 }} /></div>
        ) : invoices.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🧾</div>
            <h3>沒有符合條件的發票</h3>
            <p>嘗試調整篩選條件，或新增一張發票</p>
            <Link to="/invoices/new" className="btn btn-primary">＋ 新增發票</Link>
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>發票號碼</th>
                  <th>客戶</th>
                  <th>狀態</th>
                  <th>開票日</th>
                  <th>到期日</th>
                  <th style={{ textAlign: 'right' }}>金額</th>
                  <th style={{ textAlign: 'right' }}>待收</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <InvoiceRow
                    key={inv.id}
                    inv={inv}
                    companyId={currentCompany.id}
                    onRefresh={() => {
                      invoicesApi.list(currentCompany.id, {}).then(r => setInvoices(r.data))
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function InvoiceRow({ inv, companyId, onRefresh }) {
  const navigate = useNavigate()
  const [acting, setActing] = useState(false)

  async function handleSend(e) {
    e.stopPropagation()
    setActing(true)
    await invoicesApi.send(companyId, inv.id).catch(() => {})
    onRefresh()
    setActing(false)
  }

  function handlePdf(e) {
    e.stopPropagation()
    window.open(invoicesApi.pdfUrl(companyId, inv.id) + `?token=${localStorage.getItem('token')}`, '_blank')
  }

  const balanceDue = (inv.total_amount || 0) - (inv.paid_amount || 0)

  return (
    <tr onClick={() => navigate(`/invoices/${inv.id}`)} style={{ cursor: 'pointer' }}>
      <td>
        <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>{inv.invoice_number}</span>
      </td>
      <td>{inv.client_name}</td>
      <td><span className={`badge ${STATUS_CLASS[inv.status]}`}>{STATUS_ZH[inv.status]}</span></td>
      <td className="td-muted">{inv.issue_date?.slice(0, 10)}</td>
      <td className="td-muted">{inv.due_date?.slice(0, 10) || '—'}</td>
      <td className="td-amount" style={{ textAlign: 'right' }}>
        {inv.currency} {Number(inv.total_amount).toLocaleString('en-HK', { minimumFractionDigits: 2 })}
      </td>
      <td style={{ textAlign: 'right' }}>
        {balanceDue > 0 ? (
          <span style={{ color: 'var(--color-danger)', fontWeight: 700 }}>
            {inv.currency} {balanceDue.toLocaleString('en-HK', { minimumFractionDigits: 2 })}
          </span>
        ) : (
          <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>✓ 全額收訖</span>
        )}
      </td>
      <td onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-secondary btn-sm" onClick={handlePdf} title="下載PDF">PDF</button>
          {inv.status === 'draft' && (
            <button className="btn btn-primary btn-sm" onClick={handleSend} disabled={acting}>
              {acting ? '...' : '發出'}
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
