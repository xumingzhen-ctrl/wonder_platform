import React, { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '../api'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!token) {
      setError('無效的重置連結')
      return
    }
    if (password !== confirmPassword) {
      setError('兩次輸入的密碼不一致')
      return
    }
    
    setLoading(true)
    setError('')
    try {
      const res = await authApi.resetPassword(token, password)
      setMessage(res.data.message)
      setTimeout(() => navigate('/login'), 3000)
    } catch (err) {
      setError(err.response?.data?.detail || '重置失敗，連結可能已過期')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="login-page">
        <div className="login-card animate-in" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ marginBottom: 12 }}>連結無效</h1>
          <p style={{ marginBottom: 24, color: 'var(--color-text-muted)' }}>您的重置密碼連結無效或已過期。</p>
          <button className="btn btn-primary w-full btn-lg" onClick={() => navigate('/login')}>
            返回登錄
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card animate-in">
        <div className="login-logo">
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔐</div>
          <h1>重設密碼</h1>
          <p>請輸入您的新密碼</p>
        </div>

        {message ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ 
              background: 'rgba(34, 197, 94, 0.1)', 
              color: 'rgb(21, 128, 61)', 
              padding: '16px', 
              borderRadius: '12px', 
              marginBottom: '24px',
              fontSize: '14px'
            }}>
              {message}
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>3 秒後自動跳轉到登錄頁...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">新密碼</label>
              <input
                className="form-input"
                type="password"
                placeholder="至少 8 位字元"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">確認新密碼</label>
              <input
                className="form-input"
                type="password"
                placeholder="再次輸入密碼"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
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
              {loading ? <span className="spinner" /> : '重設密碼'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
