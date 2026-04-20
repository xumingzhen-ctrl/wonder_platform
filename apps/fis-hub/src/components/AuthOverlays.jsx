import React, { useState, useEffect } from 'react';

const API = '/api';

export function VerifyEmailOverlay({ token, onClose }) {
  const [status, setStatus] = useState('verifying'); // verifying, success, error
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('無效的驗證連結');
      return;
    }

    fetch(`${API}/auth/verify-email?token=${token}`)
      .then(r => r.json().then(data => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (ok) {
          setStatus('success');
          setMessage(data.message || '驗證成功！您的帳戶已激活。');
        } else {
          setStatus('error');
          setMessage(data.detail || '驗證失敗，連結可能已過期。');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('網絡錯誤，請稍後重試。');
      });
  }, [token]);

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>
          {status === 'verifying' ? '⏳' : status === 'success' ? '✅' : '❌'}
        </div>
        <h2 style={{ color: '#fff', marginBottom: 12 }}>
          {status === 'verifying' ? '正在驗證電郵...' : status === 'success' ? '驗證成功' : '驗證失敗'}
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 24 }}>{message}</p>
        <button onClick={onClose} style={btnStyle}>返回首頁</button>
      </div>
    </div>
  );
}

export function ResetPasswordOverlay({ token, onClose }) {
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleReset = async (e) => {
    e.preventDefault();
    if (pwd.length < 6) { setError('密碼至少需要 6 位'); return; }
    if (pwd !== pwd2) { setError('兩次輸入的密碼不一致'); return; }

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: pwd }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('密碼已重設成功！請使用新密碼登錄。');
      } else {
        setError(data.detail || '重設失敗');
      }
    } catch (err) {
      setError('網絡錯誤');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>🔐</div>
        <h2 style={{ color: '#fff', marginBottom: 12 }}>重設您的密碼</h2>
        
        {success ? (
          <>
            <p style={{ color: '#4ade80', marginBottom: 24 }}>{success}</p>
            <button onClick={onClose} style={btnStyle}>前往登錄</button>
          </>
        ) : (
          <form onSubmit={handleReset} style={{ width: '100%' }}>
            <div style={{ marginBottom: 16, textAlign: 'left' }}>
              <label style={labelStyle}>新密碼</label>
              <input 
                type="password" 
                value={pwd} 
                onChange={e => setPwd(e.target.value)} 
                style={inputStyle} 
                placeholder="輸入 6 位以上密碼"
              />
            </div>
            <div style={{ marginBottom: 20, textAlign: 'left' }}>
              <label style={labelStyle}>確認新密碼</label>
              <input 
                type="password" 
                value={pwd2} 
                onChange={e => setPwd2(e.target.value)} 
                style={inputStyle} 
                placeholder="再次輸入密碼"
              />
            </div>
            {error && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 16 }}>⚠️ {error}</p>}
            <button type="submit" disabled={loading} style={btnStyle}>
              {loading ? '提交中...' : '重設密碼'}
            </button>
            <button type="button" onClick={onClose} style={{ ...btnStyle, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', marginTop: 12 }}>
              取消
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed', inset: 0, zIndex: 10000,
  background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
};

const panelStyle = {
  background: 'linear-gradient(150deg, #0f172a, #1e293b)',
  border: '1px solid rgba(99,102,241,0.25)',
  borderRadius: 20, padding: 40, textAlign: 'center',
  maxWidth: 400, width: '100%', boxShadow: '0 40px 100px rgba(0,0,0,0.5)'
};

const btnStyle = {
  width: '100%', padding: 12, borderRadius: 10, border: 'none',
  background: 'linear-gradient(135deg, #6366f1, #818cf8)',
  color: '#fff', fontWeight: 700, cursor: 'pointer'
};

const labelStyle = { display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 8 };
const inputStyle = { 
  width: '100%', padding: 12, background: 'rgba(255,255,255,0.05)', 
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', outline: 'none' 
};
