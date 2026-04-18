import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
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

const PAYMENT_METHODS_ZH = {
  fps: '轉數快 FPS', bank_transfer: '銀行轉帳',
  cheque: '支票', cash: '現金', other: '其他',
}

export default function InvoiceDetailPage() {
  const { id } = useParams()
  const { currentCompany } = useApp()
  const navigate = useNavigate()

  const [invoice, setInvoice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [payment, setPayment] = useState({ amount: '', method: 'fps', reference: '', notes: '' })
  const [saving, setSaving] = useState(false)

  function load() {
    if (!currentCompany) return
    setLoading(true)
    invoicesApi.get(currentCompany.id, id)
      .then(r => setInvoice(r.data))
      .finally(() => setLoading(false))
  }

  useEffect(load, [currentCompany?.id, id])

  async function handleSend() {
    await invoicesApi.send(currentCompany.id, id)
    load()
  }

  async function handleVoid() {
    if (!confirm('確定要作廢此發票？此操作不可撤銷。')) return
    await invoicesApi.void(currentCompany.id, id)
    load()
  }

  async function handlePayment(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await invoicesApi.addPayment(currentCompany.id, id, {
        ...payment,
        amount: Number(payment.amount),
        payment_date: new Date().toISOString(),
      })
      setShowPaymentModal(false)
      setPayment({ amount: '', method: 'fps', reference: '', notes: '' })
      load()
    } catch (err) {
      alert('登記失敗：' + (err.response?.data?.detail || err.message))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" style={{ width: 28, height: 28 }} /></div>
  if (!invoice) return <div>發票不存在</div>

  const balanceDue = (invoice.total_amount || 0) - (invoice.paid_amount || 0)

  return (
    <div>
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <h1 className="page-title">{invoice.invoice_number}</h1>
            <span className={`badge ${STATUS_CLASS[invoice.status]}`} style={{ fontSize: 12 }}>
              {STATUS_ZH[invoice.status]}
            </span>
          </div>
          <p className="page-subtitle">{invoice.client_name}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/invoices" className="btn btn-secondary">← 返回列表</Link>
          {['draft', 'sent', 'partial', 'overdue'].includes(invoice.status) && (
            <Link to={`/invoices/${id}/edit`} className="btn btn-secondary">✏️ 編輯</Link>
          )}
          <a
            href={invoicesApi.pdfUrl(currentCompany.id, id) + `?token=${localStorage.getItem('token')}`}
            target="_blank" rel="noreferrer"
            className="btn btn-secondary"
          >
            📄 下載PDF
          </a>
          {invoice.status === 'draft' && (
            <button className="btn btn-primary" onClick={handleSend} id="send-invoice-btn">📤 發出</button>
          )}
          {['sent', 'partial', 'overdue'].includes(invoice.status) && (
            <button className="btn btn-primary" onClick={() => setShowPaymentModal(true)} id="record-payment-btn">
              💰 登記收款
            </button>
          )}
          {invoice.status !== 'void' && (
            <button className="btn btn-danger btn-sm" onClick={handleVoid}>作廢</button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
        {/* 发票正文 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 客户 + 金额概要 */}
          <div className="card">
            <div className="card-body">
              <div className="grid-2">
                <div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>帳單客戶</div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{invoice.client_name}</div>
                  {invoice.client_address && <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>{invoice.client_address}</div>}
                  {invoice.client_email && <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{invoice.client_email}</div>}
                </div>
                <div>
                  <div className="grid-2" style={{ gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>開票日</div>
                      <div style={{ fontWeight: 600 }}>{invoice.issue_date?.slice(0, 10)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>到期日</div>
                      <div style={{ fontWeight: 600, color: invoice.status === 'overdue' ? 'var(--color-danger)' : undefined }}>
                        {invoice.due_date?.slice(0, 10) || '收票即付'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 明细 */}
          <div className="card">
            <div className="card-header"><span className="card-title">服務項目</span></div>
            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>描述</th>
                    <th>數量</th>
                    <th style={{ textAlign: 'right' }}>單價</th>
                    <th style={{ textAlign: 'right' }}>金額</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoice.items || []).sort((a, b) => a.sort_order - b.sort_order).map(item => (
                    <tr key={item.id}>
                      <td>{item.description}</td>
                      <td>{item.quantity}</td>
                      <td style={{ textAlign: 'right' }}>
                        {invoice.currency} {Number(item.unit_price).toLocaleString('en-HK', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {invoice.currency} {Number(item.amount).toLocaleString('en-HK', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card-body" style={{ paddingTop: 12 }}>
              <div className="amount-summary">
                <div className="amount-row">
                  <span style={{ color: 'var(--color-text-muted)' }}>小計</span>
                  <span>{invoice.currency} {Number(invoice.subtotal).toLocaleString('en-HK', { minimumFractionDigits: 2 })}</span>
                </div>
                {Number(invoice.discount_amount) > 0 && (
                  <div className="amount-row">
                    <span style={{ color: 'var(--color-text-muted)' }}>折扣</span>
                    <span style={{ color: 'var(--color-danger)' }}>- {invoice.currency} {Number(invoice.discount_amount).toLocaleString('en-HK', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="amount-row total">
                  <span>總額</span>
                  <span>{invoice.currency} {Number(invoice.total_amount).toLocaleString('en-HK', { minimumFractionDigits: 2 })}</span>
                </div>
                {Number(invoice.paid_amount) > 0 && (
                  <div className="amount-row">
                    <span style={{ color: 'var(--color-success)' }}>已收款</span>
                    <span style={{ color: 'var(--color-success)' }}>- {invoice.currency} {Number(invoice.paid_amount).toLocaleString('en-HK', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {balanceDue > 0 && (
                  <div className="amount-row" style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-danger)', paddingTop: 6, borderTop: '2px solid var(--color-danger)', marginTop: 4 }}>
                    <span>尚欠</span>
                    <span>{invoice.currency} {balanceDue.toLocaleString('en-HK', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 右栏 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 收款记录 */}
          <div className="card">
            <div className="card-header"><span className="card-title">收款記錄</span></div>
            <div className="card-body" style={{ padding: invoice.payments?.length ? 0 : undefined }}>
              {invoice.payments?.length > 0 ? (
                invoice.payments.map(p => (
                  <div key={p.id} style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--color-border-light)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {invoice.currency} {Number(p.amount).toLocaleString('en-HK', { minimumFractionDigits: 2 })}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        {PAYMENT_METHODS_ZH[p.method] || p.method} · {p.payment_date?.slice(0, 10)}
                      </div>
                      {p.reference && <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Ref: {p.reference}</div>}
                    </div>
                    <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>✓</span>
                  </div>
                ))
              ) : (
                <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>尚未登記任何收款</p>
              )}
            </div>
          </div>

          {/* 备注 */}
          {(invoice.bank_info || invoice.terms || invoice.notes) && (
            <div className="card">
              <div className="card-header"><span className="card-title">備註</span></div>
              <div className="card-body" style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {invoice.bank_info && <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>收款資料</div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{invoice.bank_info}</div>
                </div>}
                {invoice.terms && <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>付款條款</div>
                  <div>{invoice.terms}</div>
                </div>}
                {invoice.notes && <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>備注</div>
                  <div>{invoice.notes}</div>
                </div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 收款弹窗 ── */}
      {showPaymentModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowPaymentModal(false)}>
          <form className="modal animate-in" onSubmit={handlePayment}>
            <div className="modal-header">
              <span className="modal-title">登記收款</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPaymentModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">收款金額 *</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>{invoice.currency}</span>
                  <input
                    className="form-input"
                    type="number" min="0.01" step="0.01"
                    value={payment.amount}
                    onChange={e => setPayment(p => ({ ...p, amount: e.target.value }))}
                    placeholder={balanceDue.toFixed(2)}
                    required
                    id="payment-amount"
                  />
                </div>
                <small style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
                  尚欠：{invoice.currency} {balanceDue.toLocaleString('en-HK', { minimumFractionDigits: 2 })}
                </small>
              </div>
              <div className="form-group">
                <label className="form-label">付款方式</label>
                <select className="form-select" value={payment.method}
                  onChange={e => setPayment(p => ({ ...p, method: e.target.value }))}>
                  <option value="fps">轉數快 FPS</option>
                  <option value="bank_transfer">銀行轉帳</option>
                  <option value="cheque">支票</option>
                  <option value="cash">現金</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">交易參考號</label>
                <input className="form-input" value={payment.reference}
                  onChange={e => setPayment(p => ({ ...p, reference: e.target.value }))}
                  placeholder="例如：FPS交易確認號" id="payment-reference" />
              </div>
              <div className="form-group">
                <label className="form-label">備注</label>
                <textarea className="form-textarea" value={payment.notes}
                  onChange={e => setPayment(p => ({ ...p, notes: e.target.value }))} rows={2} />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowPaymentModal(false)}>取消</button>
              <button type="submit" className="btn btn-primary" disabled={saving} id="confirm-payment-btn">
                {saving ? <span className="spinner" /> : '確認收款'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
