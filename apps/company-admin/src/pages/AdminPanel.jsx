import React, { useEffect, useState } from 'react'
import { adminApi } from '../api'

export default function AdminPanel() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    try {
      setLoading(true)
      const r = await adminApi.listUsers()
      console.log('listUsers response:', r.data)
      if (Array.isArray(r.data)) {
        setUsers(r.data)
      } else if (r.data && Array.isArray(r.data.users)) {
        setUsers(r.data.users)
      } else if (r.data && Array.isArray(r.data.items)) {
        setUsers(r.data.items)
      } else if (r.data && Array.isArray(r.data.data)) {
        setUsers(r.data.data)
      } else {
        setUsers([])
        console.error('Expected array but got:', typeof r.data, r.data)
      }
    } catch (err) {
      alert('獲取用戶列表失敗: ' + (err.response?.data?.detail || err.message))
    } finally {
      setLoading(false)
    }
  }

  async function handleTogglePremium(userId, currentRole) {
    const newIsPremium = currentRole !== 'premium'
    try {
      setProcessing(userId)
      await adminApi.togglePremium(userId, newIsPremium)
      setUsers(users.map(u => u.id === userId ? { ...u, role: newIsPremium ? 'premium' : 'free' } : u))
    } catch (err) {
      alert('操作失敗: ' + (err.response?.data?.detail || err.message))
    } finally {
      setProcessing(null)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">系統用戶管理</h1>
          <p className="page-subtitle">管理所有註冊用戶及其權限級別</p>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" /></div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>名稱</th>
                  <th>電郵</th>
                  <th>角色</th>
                  <th>註冊時間</th>
                  <th>權限操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td className="td-muted">{u.email}</td>
                    <td>
                      <span className={`badge ${u.role === 'admin' ? 'badge-primary' : u.role === 'premium' ? 'badge-success' : 'badge-light'}`}>
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="td-muted">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td>
                      {u.role !== 'admin' && (
                        <button 
                          className={`btn btn-sm ${u.role === 'premium' ? 'btn-ghost' : 'btn-secondary'}`}
                          onClick={() => handleTogglePremium(u.id, u.role)}
                          disabled={processing === u.id}
                        >
                          {processing === u.id ? <span className="spinner spinner-sm" /> : 
                           u.role === 'premium' ? '取消 Premium' : '授予 Premium'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
