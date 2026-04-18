import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../contexts/AppContext.jsx'
import { authApi } from '../api/index.js'

export default function LoginPage() {
  const { login } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  
  const [form, setForm] = useState({ email: location.state?.registeredEmail || '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await authApi.login(form.email, form.password)
      await login(data.access_token, { id: data.user_id, name: data.name })
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || '登入失敗，請檢查電郵或密碼')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card animate-in">
        <div className="login-logo">
          <div style={{ fontSize: 40, marginBottom: 8 }}>🏢</div>
          <h1>港行政管理系統</h1>
          <p>香港小企業一站式行政助手</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">電郵地址</label>
            <input
              className="form-input"
              type="email"
              placeholder="your@email.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              required
              id="login-email"
            />
          </div>

          <div className="form-group">
            <label className="form-label">密碼</label>
            <input
              className="form-input"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required
              id="login-password"
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
            id="login-submit"
          >
            {loading ? <span className="spinner" /> : '登入'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)', marginTop: 24 }}>
          沒有帳戶？ <a href="#" onClick={(e) => { e.preventDefault(); navigate('/register'); }} style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500 }}>立即免費註冊</a>
        </p>
      </div>
    </div>
  )
}
