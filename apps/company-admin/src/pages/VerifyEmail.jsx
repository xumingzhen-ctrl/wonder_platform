import React, { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { authApi } from '../api'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')
  const [status, setStatus] = useState('verifying') // verifying, success, error
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('無效的驗證連結')
      return
    }

    authApi.verifyEmail(token)
      .then(res => {
        setStatus('success')
        setMessage(res.data.message)
        setTimeout(() => navigate('/login'), 3000)
      })
      .catch(err => {
        setStatus('error')
        setMessage(err.response?.data?.detail || '驗證失敗')
      })
  }, [token, navigate])

  return (
    <div className="login-page">
      <div className="login-card animate-in" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>
          {status === 'verifying' && <span className="spinner" style={{ width: 40, height: 40, borderLevel: 4 }} />}
          {status === 'success' && '✅'}
          {status === 'error' && '❌'}
        </div>
        <h2 style={{ marginBottom: 12 }}>
          {status === 'verifying' ? '正在驗證您的電郵' : status === 'success' ? '驗證成功' : '驗證失敗'}
        </h2>
        <p style={{ marginBottom: 24, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          {message || '請稍候，我們正在處理您的請求...'}
        </p>
        
        {status === 'success' && (
          <p style={{ fontSize: 13, marginBottom: 20, color: 'var(--color-success)' }}>
            🎉 您的帳戶已激活，現在可以開始使用了。
          </p>
        )}
        
        <button className="btn btn-primary w-full btn-lg" onClick={() => navigate('/login')}>
          返回登錄
        </button>
      </div>
    </div>
  )
}
