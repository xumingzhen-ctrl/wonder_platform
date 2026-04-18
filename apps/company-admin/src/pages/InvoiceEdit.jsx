import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useApp } from '../contexts/AppContext.jsx'
import { invoicesApi, clientsApi } from '../api/index.js'

const CURRENCIES = ['HKD', 'USD', 'CNY', 'EUR', 'GBP']
const PAYMENT_METHODS = [
  { value: 'fps', label: '轉數快 FPS' },
  { value: 'bank_transfer', label: '銀行轉帳' },
  { value: 'cheque', label: '支票' },
  { value: 'cash', label: '現金' },
  { value: 'other', label: '其他' },
]

const emptyItem = () => ({ description: '', quantity: 1, unit_price: '', amount: 0 })

export default function InvoiceEditPage() {
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const { currentCompany } = useApp()

  const [form, setForm] = useState({
    invoice_type: 'invoice',
    client_id: '',
    client_name: '',
    client_address: '',
    client_email: '',
    issue_date: today(),
    due_date: '',
    currency: 'HKD',
    discount_amount: 0,
    notes: '',
    terms: '請於到期日前以轉數快或銀行轉帳方式付款。',
    bank_info: '',
    items: [emptyItem()],
  })
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)

  // 加载编辑数据
  useEffect(() => {
    if (!currentCompany) return
    clientsApi.list(currentCompany.id).then(r => setClients(r.data))

    if (!isNew) {
      invoicesApi.get(currentCompany.id, id).then(({ data }) => {
        setForm({
          invoice_type: data.invoice_type,
          client_id: data.client_id || '',
          client_name: data.client_name,
          client_address: data.client_address || '',
          client_email: data.client_email || '',
          issue_date: data.issue_date?.slice(0, 10) || today(),
          due_date: data.due_date?.slice(0, 10) || '',
          currency: data.currency,
          discount_amount: Number(data.discount_amount) || 0,
          notes: data.notes || '',
          terms: data.terms || '',
          bank_info: data.bank_info || '',
          items: data.items?.map(i => ({
            description: i.description,
            quantity: Number(i.quantity),
            unit_price: Number(i.unit_price),
            amount: Number(i.amount),
          })) || [emptyItem()],
        })
      }).finally(() => setLoading(false))
    }
  }, [currentCompany?.id, id])

  // 选择客户自动填入
  function handleClientSelect(e) {
    const clientId = e.target.value
    const client = clients.find(c => c.id === clientId)
    setForm(f => ({
      ...f,
      client_id: clientId,
      client_name: client ? client.name_zh : f.client_name,
      client_address: client?.address || f.client_address,
      client_email: client?.email || f.client_email,
    }))
  }

  // 明细行计算
  function updateItem(idx, field, value) {
    setForm(f => {
      const items = [...f.items]
      items[idx] = { ...items[idx], [field]: value }
      if (field === 'quantity' || field === 'unit_price') {
        const q = field === 'quantity' ? Number(value) : Number(items[idx].quantity)
        const p = field === 'unit_price' ? Number(value) : Number(items[idx].unit_price)
        items[idx].amount = parseFloat((q * p).toFixed(2))
      }
      return { ...f, items }
    })
  }

  function addItem() { setForm(f => ({ ...f, items: [...f.items, emptyItem()] })) }
  function removeItem(idx) { setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) })) }

  // 计算合计
  const subtotal = form.items.reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const discount = Number(form.discount_amount) || 0
  const total = subtotal - discount

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        discount_amount: discount,
        items: form.items.map((item, i) => ({
          ...item,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          amount: Number(item.amount),
          sort_order: i,
        })),
      }
      if (isNew) {
        const { data } = await invoicesApi.create(currentCompany.id, payload)
        navigate(`/invoices/${data.id}`)
      } else {
        await invoicesApi.update(currentCompany.id, id, payload)
        navigate(`/invoices/${id}`)
      }
    } catch (err) {
      alert('儲存失敗：' + (err.response?.data?.detail || err.message))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" style={{ width: 28, height: 28 }} /></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isNew ? '新增發票' : '編輯發票'}</h1>
          <p className="page-subtitle">{currentCompany?.name_zh}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/invoices" className="btn btn-secondary">取消</Link>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} id="save-invoice-btn">
            {saving ? <span className="spinner" /> : '儲存發票'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
        {/* ── 左栏：发票详情 ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 基本信息 */}
          <div className="card">
            <div className="card-header"><span className="card-title">基本資料</span></div>
            <div className="card-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">單據類型</label>
                  <select className="form-select" value={form.invoice_type}
                    onChange={e => setForm(f => ({ ...f, invoice_type: e.target.value }))}>
                    <option value="invoice">發票 Invoice</option>
                    <option value="quotation">報價單 Quotation</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">貨幣</label>
                  <select className="form-select" value={form.currency}
                    onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">開票日期</label>
                  <input className="form-input" type="date" value={form.issue_date}
                    onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">付款截止日</label>
                  <input className="form-input" type="date" value={form.due_date}
                    onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>

          {/* 客户信息 */}
          <div className="card">
            <div className="card-header"><span className="card-title">客戶資料</span></div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">從已有客戶選取</label>
                <select className="form-select" value={form.client_id} onChange={handleClientSelect}>
                  <option value="">— 手動輸入 —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name_zh}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">客戶名稱 *</label>
                <input className="form-input" value={form.client_name}
                  onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                  placeholder="客戶公司名稱" required />
              </div>
              <div className="form-group">
                <label className="form-label">客戶地址</label>
                <textarea className="form-textarea" value={form.client_address}
                  onChange={e => setForm(f => ({ ...f, client_address: e.target.value }))}
                  placeholder="客戶地址（顯示在發票上）" rows={2} />
              </div>
              <div className="form-group">
                <label className="form-label">客戶電郵</label>
                <input className="form-input" type="email" value={form.client_email}
                  onChange={e => setForm(f => ({ ...f, client_email: e.target.value }))}
                  placeholder="client@example.com" />
              </div>
            </div>
          </div>

          {/* 服务明细 */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">服務項目</span>
              <button className="btn btn-secondary btn-sm" onClick={addItem}>＋ 新增行</button>
            </div>
            <div className="card-body">
              <table className="invoice-items-table">
                <thead>
                  <tr>
                    <th style={{ width: '45%' }}>服務描述</th>
                    <th style={{ width: '12%' }}>數量</th>
                    <th style={{ width: '18%' }}>單價</th>
                    <th style={{ width: '18%', textAlign: 'right' }}>金額</th>
                    <th style={{ width: '7%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((item, idx) => (
                    <tr key={idx}>
                      <td>
                        <input
                          value={item.description}
                          onChange={e => updateItem(idx, 'description', e.target.value)}
                          placeholder="服務描述..."
                        />
                      </td>
                      <td>
                        <input
                          type="number" min="0" step="0.01"
                          value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', e.target.value)}
                          style={{ width: '100%', textAlign: 'right' }}
                        />
                      </td>
                      <td>
                        <input
                          type="number" min="0" step="0.01"
                          value={item.unit_price}
                          onChange={e => updateItem(idx, 'unit_price', e.target.value)}
                          style={{ width: '100%', textAlign: 'right' }}
                          placeholder="0.00"
                        />
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {form.currency} {Number(item.amount).toLocaleString('en-HK', { minimumFractionDigits: 2 })}
                      </td>
                      <td>
                        {form.items.length > 1 && (
                          <button onClick={() => removeItem(idx)}
                            style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 16 }}>
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* 金额汇总 */}
              <div className="amount-summary">
                <div className="amount-row">
                  <span style={{ color: 'var(--color-text-muted)' }}>小計</span>
                  <span>{form.currency} {subtotal.toLocaleString('en-HK', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="amount-row" style={{ alignItems: 'center' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>折扣</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{form.currency}</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={form.discount_amount}
                      onChange={e => setForm(f => ({ ...f, discount_amount: e.target.value }))}
                      style={{ width: 90, textAlign: 'right', padding: '3px 6px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }}
                    />
                  </div>
                </div>
                <div className="amount-row total">
                  <span>應付總額</span>
                  <span>{form.currency} {total.toLocaleString('en-HK', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 右栏：备注/付款信息 ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">備註及付款</span></div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">收款銀行資料</label>
                <textarea className="form-textarea" value={form.bank_info}
                  onChange={e => setForm(f => ({ ...f, bank_info: e.target.value }))}
                  placeholder={`例如：&#10;匯豐銀行 025-xxxxxxx&#10;FPS ID: xxxxxxx`} rows={4} />
              </div>
              <div className="form-group">
                <label className="form-label">付款條款</label>
                <textarea className="form-textarea" value={form.terms}
                  onChange={e => setForm(f => ({ ...f, terms: e.target.value }))} rows={3} />
              </div>
              <div className="form-group">
                <label className="form-label">備註</label>
                <textarea className="form-textarea" value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="其他備注..." rows={3} />
              </div>
            </div>
          </div>

          {/* 提示 */}
          <div style={{
            background: 'var(--color-info-light)',
            borderRadius: 'var(--radius-md)',
            padding: '14px 16px',
            fontSize: 12,
            color: '#1D4ED8',
          }}>
            <strong>💡 提示</strong><br />
            儲存後可下載繁體中文發票 PDF，並支援 FPS 二維碼收款（需在公司設定中填入 FPS ID）。
          </div>
        </div>
      </div>
    </div>
  )
}

function today() {
  return new Date().toISOString().slice(0, 10)
}
