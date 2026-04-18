import React, { useEffect, useState } from 'react'
import { useApp } from '../contexts/AppContext.jsx'
import { clientsApi } from '../api/index.js'

export default function ClientsPage() {
  const { currentCompany } = useApp()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  function load() {
    if (!currentCompany) return
    setLoading(true)
    clientsApi.list(currentCompany.id, search ? { search } : {})
      .then(r => setClients(r.data))
      .finally(() => setLoading(false))
  }

  useEffect(load, [currentCompany?.id, search])

  function openCreate() { setEditing(null); setForm(emptyForm()); setShowModal(true) }
  function openEdit(c) {
    setEditing(c)
    setForm({ name_zh: c.name_zh, name_en: c.name_en || '', contact_person: c.contact_person || '', email: c.email || '', phone: c.phone || '', address: c.address || '' })
    setShowModal(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      if (editing) {
        await clientsApi.update(currentCompany.id, editing.id, form)
      } else {
        await clientsApi.create(currentCompany.id, form)
      }
      setShowModal(false)
      load()
    } catch (err) {
      alert('儲存失敗：' + (err.response?.data?.detail || err.message))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(c) {
    if (!confirm(`確定刪除客戶「${c.name_zh}」？`)) return
    await clientsApi.delete(currentCompany.id, c.id)
    load()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">客戶管理</h1>
          <p className="page-subtitle">管理公司客戶資料庫</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate} id="new-client-btn">＋ 新增客戶</button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div className="search-bar">
          <span style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>🔍</span>
          <input
            placeholder="搜索客戶名稱、聯絡人..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            id="client-search"
          />
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" style={{ width: 28, height: 28 }} /></div>
        ) : clients.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <h3>{search ? '未找到匹配客戶' : '尚無客戶資料'}</h3>
            <p>新增客戶後，開具發票時可快速選取</p>
            <button className="btn btn-primary" onClick={openCreate}>＋ 新增客戶</button>
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>客戶名稱</th>
                  <th>英文名稱</th>
                  <th>聯絡人</th>
                  <th>電郵</th>
                  <th>電話</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 700 }}>{c.name_zh}</td>
                    <td className="td-muted">{c.name_en || '—'}</td>
                    <td>{c.contact_person || '—'}</td>
                    <td className="td-muted">{c.email || '—'}</td>
                    <td className="td-muted">{c.phone || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>編輯</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => handleDelete(c)}>刪除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 新增/编辑弹窗 */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <form className="modal animate-in" onSubmit={handleSave}>
            <div className="modal-header">
              <span className="modal-title">{editing ? '編輯客戶' : '新增客戶'}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">客戶名稱（中文）*</label>
                  <input className="form-input" value={form.name_zh}
                    onChange={e => setForm(f => ({ ...f, name_zh: e.target.value }))}
                    placeholder="客戶公司名稱" required id="client-name-zh" />
                </div>
                <div className="form-group">
                  <label className="form-label">英文名稱</label>
                  <input className="form-input" value={form.name_en}
                    onChange={e => setForm(f => ({ ...f, name_en: e.target.value }))}
                    placeholder="Client Company Name" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">聯絡人</label>
                <input className="form-input" value={form.contact_person}
                  onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))}
                  placeholder="聯絡人姓名" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">電郵</label>
                  <input className="form-input" type="email" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="email@example.com" />
                </div>
                <div className="form-group">
                  <label className="form-label">電話</label>
                  <input className="form-input" value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="電話號碼" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">地址</label>
                <textarea className="form-textarea" value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="客戶地址" rows={2} />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>取消</button>
              <button type="submit" className="btn btn-primary" disabled={saving} id="save-client-btn">
                {saving ? <span className="spinner" /> : '儲存'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function emptyForm() {
  return { name_zh: '', name_en: '', contact_person: '', email: '', phone: '', address: '' }
}
