import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const res = await authApi.forgotPassword(email)
      setMessage(res.data.message)
    } catch (err) {
      setError(err.response?.data?.detail || '請求失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card animate-in">
        <div className="login-logo">
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔑</div>
          <h1>忘記密碼？</h1>
          <p>輸入您的註冊電郵，我們將發送重置連結</p>
        </div>

        {message ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ 
              background: 'rgba(34, 197, 94, 0.1)', 
              color: 'rgb(21, 128, 61)', 
              padding: '16px', 
              borderRadius: '12px', 
              marginBottom: '24px',
              fontSize: '14px',
              lineHeight: '1.5'
            }}>
              {message}
            </div>
            <button className="btn btn-primary w-full btn-lg" onClick={() => navigate('/login')}>
              返回登錄
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">電郵地址</label>
              <input
                className="form-input"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            {error && (
              <div style={{ 
                background: 'rgba(239, 68, 68, 0.1)', 
                color: 'rgb(185, 28, 28)', 
                padding: '10px 14px', 
                borderRadius: '8px', 
                fontSize: '13px', 
                marginBottom: '16px' 
              }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary w-full btn-lg" disabled={loading}>
              {loading ? <span className="spinner" /> : '發送重置郵件'}
            </button>
            
            <p style={{ textAlign: 'center', fontSize: 13, marginTop: 24 }}>
              <a href="#" onClick={(e) => { e.preventDefault(); navigate('/login'); }} style={{ color: 'var(--color-text-muted)', textDecoration: 'none', fontWeight: 500 }}>
                ← 返回登錄
              </a>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
