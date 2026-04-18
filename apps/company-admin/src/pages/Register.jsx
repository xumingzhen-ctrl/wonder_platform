import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api/index.js'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    
    if (form.password !== form.confirmPassword) {
      setError('兩次輸入的密碼不一致')
      return
    }
    
    setLoading(true)
    try {
      await authApi.register(form)
      // Pass email to login page via state
      navigate('/login', { state: { registeredEmail: form.email } })
    } catch (err) {
      setError(err.response?.data?.detail || '註冊失敗，請重試')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card animate-in">
        <div className="login-logo">
          <div style={{ fontSize: 40, marginBottom: 8 }}>🏢</div>
          <h1>建立您的帳戶</h1>
          <p>開始使用香港小企業一站式行政助手</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">您的姓名</label>
            <input
              className="form-input"
              type="text"
              placeholder="Chan Tai Man"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">電郵地址</label>
            <input
              className="form-input"
              type="email"
              placeholder="your@email.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">設定密碼</label>
            <input
              className="form-input"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">確認密碼</label>
            <input
              className="form-input"
              type="password"
              placeholder="••••••••"
              value={form.confirmPassword}
              onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
              required
            />
          </div>

          {error && (
            <div style={{
              background: 'var(--color-danger-light)',
              color: 'var(--color-danger)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: 13,
              marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full btn-lg"
            disabled={loading}
          >
            {loading ? <span className="spinner" /> : '註冊帳戶 (免費)'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)', marginTop: 24 }}>
          已經有帳戶？ <a href="#" onClick={(e) => { e.preventDefault(); navigate('/login'); }} style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500 }}>登入</a>
        </p>
      </div>
    </div>
  )
}
