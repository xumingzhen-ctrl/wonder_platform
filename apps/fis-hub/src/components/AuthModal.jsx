import React, { useState, useEffect, useCallback, useRef } from 'react';
import { authStorage } from '../utils/auth';

const API = '/api';

/* ── 密码强度计算 ─────────────────────────────────────────────────── */
function calcStrength(pwd) {
  if (!pwd) return { score: 0, label: '', color: '#334155' };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const levels = [
    { label: '非常弱', color: '#ef4444' },
    { label: '弱',     color: '#f97316' },
    { label: '一般',   color: '#eab308' },
    { label: '强',     color: '#22c55e' },
    { label: '非常强', color: '#10b981' },
  ];
  const lvl = levels[Math.min(score, 4)];
  return { score, label: lvl.label, color: lvl.color };
}

/* ── 主组件 ──────────────────────────────────────────────────────── */
export default function AuthModal({ onSuccess, onClose }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'

  // ── 登录字段 ──
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPwd,   setLoginPwd]   = useState('');
  const [showLoginPwd, setShowLoginPwd] = useState(false);

  // ── 注册字段 ──
  const [regName,      setRegName]      = useState('');
  const [regEmail,     setRegEmail]     = useState('');
  const [regPwd,       setRegPwd]       = useState('');
  const [regPwd2,      setRegPwd2]      = useState('');
  const [showRegPwd,   setShowRegPwd]   = useState(false);
  const [showRegPwd2,  setShowRegPwd2]  = useState(false);
  const [regType,      setRegType]      = useState('free');    // free | premium
  const [advisorId,    setAdvisorId]    = useState('');        // 选中的顾问 ID
  const [advisors,     setAdvisors]     = useState([]);        // 顾问列表
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [agreedTerms,  setAgreedTerms]  = useState(false);

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');

  const pwdStrength = calcStrength(regPwd);
  const pwdMatch    = regPwd2 ? regPwd === regPwd2 : null; // null = 未输入

  /* ── ESC 关闭 ── */
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  /* ── 拉取顾问列表（注册模式 + 选择 premium 才拉） ── */
  useEffect(() => {
    if (mode !== 'register' || regType !== 'premium') return;
    setAdvisorLoading(true);
    fetch(`${API}/auth/advisors`)
      .then(r => r.ok ? r.json() : [])
      .then(list => setAdvisors(Array.isArray(list) ? list : []))
      .catch(() => setAdvisors([]))
      .finally(() => setAdvisorLoading(false));
  }, [mode, regType]);

  /* ── 切换模式时清空 ── */
  const switchMode = (m) => {
    setMode(m);
    setError('');
    setSuccess('');
  };

  /* ── 校验 ── */
  const validateLogin = () => {
    if (!loginEmail.trim())      return '请输入邮箱地址';
    if (!/\S+@\S+\.\S+/.test(loginEmail)) return '请输入有效的邮箱格式';
    if (!loginPwd)               return '请输入密码';
    return null;
  };

  const validateRegister = () => {
    if (!regName.trim())         return '请输入您的姓名／显示名称';
    if (!regEmail.trim())        return '请输入邮箱地址';
    if (!/\S+@\S+\.\S+/.test(regEmail)) return '请输入有效的邮箱格式';
    if (regPwd.length < 6)       return '密码至少需要 6 位字符';
    if (regPwd !== regPwd2)      return '两次输入的密码不一致';
    if (regType === 'premium' && !advisorId) return '请选择您的专属顾问';
    if (!agreedTerms)             return '请阅读并同意用户服务协议';
    return null;
  };

  /* ── 提交 ── */
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError('');

    const err = mode === 'login' ? validateLogin() : validateRegister();
    if (err) { setError(err); return; }

    setLoading(true);
    try {
      const url  = mode === 'login' ? `${API}/auth/login` : `${API}/auth/register`;
      const body = mode === 'login'
        ? { email: loginEmail.trim(), password: loginPwd }
        : {
            email: regEmail.trim(),
            password: regPwd,
            display_name: regName.trim(),
            invited_by_advisor_id: regType === 'premium' && advisorId ? Number(advisorId) : null,
          };

      const res  = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || (mode === 'login' ? '邮箱或密码错误，请重试' : '注册失败，邮箱可能已存在'));
        return;
      }

      const tokenValue = data.access_token || data.token;
      if (!tokenValue) { setError('未收到登录凭证，请稍后重试'); return; }
      authStorage.setToken(tokenValue);

      // 获取完整用户信息
      let userInfo;
      try {
        const meRes = await fetch(`${API}/auth/me`, {
          headers: { 'Authorization': `Bearer ${tokenValue}` }
        });
        userInfo = meRes.ok ? await meRes.json() : null;
      } catch (_) { userInfo = null; }

      const user = userInfo || {
        id: data.user_id || data.id,
        email: data.email || (mode === 'login' ? loginEmail : regEmail),
        role: data.role,
        display_name: data.display_name,
      };
      authStorage.setUser(user);

      if (mode === 'register') {
        setSuccess(`🎉 账号注册成功！欢迎加入，${user.display_name}`);
        setTimeout(() => onSuccess(user), 1200);
      } else {
        onSuccess(user);
      }
    } catch {
      setError('网络错误，请检查后端服务是否正在运行');
    } finally {
      setLoading(false);
    }
  }, [mode, loginEmail, loginPwd, regEmail, regPwd, regPwd2, regName, regType, advisorId, agreedTerms, onSuccess]);

  /* ═══════════════════════════════════════════════════════════════ */
  return (
    <div onClick={onClose} style={overlayStyle}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          ...panelStyle,
          width: mode === 'register' ? 480 : 400,
          transition: 'width 0.3s ease',
        }}
      >
        {/* 关闭 */}
        <button onClick={onClose} style={closeBtnStyle}>✕</button>

        {/* 顶部标题 */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 4 }}>
            {mode === 'login' ? '🔐' : '✨'}
          </div>
          <h2 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.5px' }}>
            {mode === 'login' ? '欢迎回来' : '创建新账号'}
          </h2>
          <p style={{ margin: '5px 0 0', color: 'rgba(255,255,255,0.38)', fontSize: 13 }}>
            PortfolioHub 财富管理平台
          </p>
        </div>

        {/* ── 模式选项卡 ── */}
        <div style={tabBarStyle}>
          {['login', 'register'].map(m => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              style={{
                ...tabBtnBase,
                background: mode === m ? 'rgba(99,102,241,0.22)' : 'transparent',
                color:       mode === m ? '#818cf8' : 'rgba(255,255,255,0.38)',
                borderBottom: mode === m ? '2px solid #818cf8' : '2px solid transparent',
              }}
            >
              {m === 'login' ? '登 录' : '注 册'}
            </button>
          ))}
        </div>

        {/* ══════════════════ 登录表单 ══════════════════ */}
        {mode === 'login' && (
          <form onSubmit={handleSubmit} noValidate style={{ marginTop: 20 }}>
            <Field label="邮箱地址">
              <input
                autoFocus
                type="email"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                placeholder="your@email.com"
                style={inputStyle}
              />
            </Field>

            <Field label="密码" extra={
              <button type="button" onClick={() => setShowLoginPwd(!showLoginPwd)} style={eyeBtnStyle}>
                {showLoginPwd ? '🙈' : '👁'}
              </button>
            }>
              <input
                type={showLoginPwd ? 'text' : 'password'}
                value={loginPwd}
                onChange={e => setLoginPwd(e.target.value)}
                placeholder="输入密码"
                style={{ ...inputStyle, paddingRight: 40 }}
              />
            </Field>

            <ErrorBox msg={error} />

            <SubmitBtn loading={loading} label="登 录" loadingLabel="登录中…" />
          </form>
        )}

        {/* ══════════════════ 注册表单 ══════════════════ */}
        {mode === 'register' && (
          <form onSubmit={handleSubmit} noValidate style={{ marginTop: 20 }}>

            {/* 姓名 */}
            <Field label="您的姓名 / 显示名称">
              <input
                autoFocus
                type="text"
                value={regName}
                onChange={e => setRegName(e.target.value)}
                placeholder="例：Derek Wong"
                style={inputStyle}
              />
            </Field>

            {/* 邮箱 */}
            <Field label="邮箱地址">
              <input
                type="email"
                value={regEmail}
                onChange={e => setRegEmail(e.target.value)}
                placeholder="your@email.com"
                style={inputStyle}
              />
            </Field>

            {/* 密码 */}
            <Field label="登录密码" extra={
              <button type="button" onClick={() => setShowRegPwd(!showRegPwd)} style={eyeBtnStyle}>
                {showRegPwd ? '🙈' : '👁'}
              </button>
            }>
              <input
                type={showRegPwd ? 'text' : 'password'}
                value={regPwd}
                onChange={e => setRegPwd(e.target.value)}
                placeholder="至少 6 位，建议包含大写字母和数字"
                style={{ ...inputStyle, paddingRight: 40 }}
              />
              {/* 密码强度条 */}
              {regPwd && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[0,1,2,3,4].map(i => (
                      <div key={i} style={{
                        flex: 1, height: 4, borderRadius: 2,
                        background: i < pwdStrength.score ? pwdStrength.color : 'rgba(255,255,255,0.1)',
                        transition: 'background 0.3s',
                      }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 11, color: pwdStrength.color, marginTop: 3, display: 'block' }}>
                    密码强度：{pwdStrength.label}
                  </span>
                </div>
              )}
            </Field>

            {/* 确认密码 */}
            <Field label="确认密码" extra={
              <button type="button" onClick={() => setShowRegPwd2(!showRegPwd2)} style={eyeBtnStyle}>
                {showRegPwd2 ? '🙈' : '👁'}
              </button>
            }>
              <input
                type={showRegPwd2 ? 'text' : 'password'}
                value={regPwd2}
                onChange={e => setRegPwd2(e.target.value)}
                placeholder="再次输入相同密码"
                style={{
                  ...inputStyle,
                  paddingRight: 40,
                  borderColor: pwdMatch === false
                    ? 'rgba(239,68,68,0.6)'
                    : pwdMatch === true
                      ? 'rgba(34,197,94,0.6)'
                      : 'rgba(255,255,255,0.12)',
                }}
              />
              {regPwd2 && (
                <span style={{
                  fontSize: 11, marginTop: 3, display: 'block',
                  color: pwdMatch ? '#4ade80' : '#f87171',
                }}>
                  {pwdMatch ? '✓ 密码一致' : '✗ 两次密码不一致'}
                </span>
              )}
            </Field>

            {/* 账号类型 */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>账号类型</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { value: 'free',    icon: '👤', title: '普通用户',    desc: '免费使用基础功能' },
                  { value: 'premium', icon: '💎', title: '付费用户',    desc: '绑定顾问，解锁全功能' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setRegType(opt.value); setAdvisorId(''); }}
                    style={{
                      background: regType === opt.value
                        ? 'rgba(99,102,241,0.18)'
                        : 'rgba(255,255,255,0.04)',
                      border: `1.5px solid ${regType === opt.value ? '#6366f1' : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: 12,
                      padding: '12px 10px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{opt.icon}</div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: regType === opt.value ? '#a5b4fc' : '#94a3b8' }}>
                      {opt.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                      {opt.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 顾问选择（仅 premium） */}
            {regType === 'premium' && (
              <div style={{
                marginBottom: 16,
                padding: '14px 16px',
                background: 'rgba(99,102,241,0.07)',
                border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: 12,
                animation: 'fadeIn 0.3s ease',
              }}>
                <label style={labelStyle}>
                  选择您的专属顾问 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                {advisorLoading ? (
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: '8px 0' }}>
                    <span style={spinnerStyle} /> 正在加载顾问列表…
                  </div>
                ) : advisors.length === 0 ? (
                  <div style={{ color: '#f87171', fontSize: 13, padding: '6px 0' }}>
                    暂无可用顾问，请联系管理员
                  </div>
                ) : (
                  <select
                    value={advisorId}
                    onChange={e => setAdvisorId(e.target.value)}
                    style={{
                      ...inputStyle,
                      cursor: 'pointer',
                      appearance: 'none',
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23818cf8' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 14px center',
                      paddingRight: 38,
                    }}
                  >
                    <option value="">-- 请选择顾问 --</option>
                    {advisors.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.display_name}（{a.email}）
                      </option>
                    ))}
                  </select>
                )}
                <p style={{ margin: '8px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>
                  💡 绑定顾问后，您将立即获得 <strong style={{ color: '#a5b4fc' }}>Premium</strong> 权限，并可查看顾问为您定制的保险方案
                </p>
              </div>
            )}

            {/* 服务条款 */}
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              cursor: 'pointer', marginBottom: 20,
            }}>
              <input
                type="checkbox"
                checked={agreedTerms}
                onChange={e => setAgreedTerms(e.target.checked)}
                style={{ marginTop: 2, accentColor: '#6366f1', width: 16, height: 16, flexShrink: 0 }}
              />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>
                我已阅读并同意{' '}
                <a href="#" style={{ color: '#818cf8', textDecoration: 'none' }}>《用户服务协议》</a>
                {' '}与{' '}
                <a href="#" style={{ color: '#818cf8', textDecoration: 'none' }}>《隐私政策》</a>
                ，并确认所提交信息真实有效
              </span>
            </label>

            <ErrorBox  msg={error}   />
            <SuccessBox msg={success} />
            <SubmitBtn loading={loading} label="创建账号" loadingLabel="注册中…" />
          </form>
        )}

        {/* 底部切换 */}
        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'rgba(255,255,255,0.38)' }}>
          {mode === 'login' ? (
            <>还没有账号？{' '}
              <button onClick={() => switchMode('register')} style={linkBtnStyle}>免费注册</button>
            </>
          ) : (
            <>已有账号？{' '}
              <button onClick={() => switchMode('login')} style={linkBtnStyle}>返回登录</button>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

/* ── 子组件 ─────────────────────────────────────────────────────── */
function Field({ label, children, extra }) {
  return (
    <div style={{ marginBottom: 14, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <label style={labelStyle}>{label}</label>
        {extra && <div style={{ position: 'absolute', right: 12, bottom: 10 }}>{extra}</div>}
      </div>
      {children}
    </div>
  );
}

function ErrorBox({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      marginBottom: 14, padding: '10px 14px',
      background: 'rgba(239,68,68,0.1)',
      border: '1px solid rgba(239,68,68,0.3)',
      borderRadius: 10, color: '#fca5a5', fontSize: 13, lineHeight: 1.5,
    }}>
      ⚠️ {msg}
    </div>
  );
}

function SuccessBox({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      marginBottom: 14, padding: '10px 14px',
      background: 'rgba(34,197,94,0.1)',
      border: '1px solid rgba(34,197,94,0.3)',
      borderRadius: 10, color: '#4ade80', fontSize: 13,
    }}>
      {msg}
    </div>
  );
}

function SubmitBtn({ loading, label, loadingLabel }) {
  return (
    <button type="submit" disabled={loading} style={{
      width: '100%', padding: '13px',
      background: loading ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg, #6366f1, #818cf8)',
      border: 'none', borderRadius: 11,
      color: '#fff', fontWeight: 700, fontSize: 15,
      cursor: loading ? 'not-allowed' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      boxShadow: loading ? 'none' : '0 4px 24px rgba(99,102,241,0.45)',
      transition: 'all 0.2s',
      letterSpacing: '0.03em',
    }}>
      {loading ? <><span style={spinnerStyle} />{loadingLabel}</> : label}
    </button>
  );
}

/* ── Styles ─────────────────────────────────────────────────────── */
const overlayStyle = {
  position: 'fixed', inset: 0, zIndex: 9000,
  background: 'rgba(0,0,0,0.7)',
  backdropFilter: 'blur(8px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 16,
};

const panelStyle = {
  background: 'linear-gradient(150deg, rgba(15,23,42,0.99), rgba(30,41,59,0.99))',
  border: '1px solid rgba(99,102,241,0.25)',
  borderRadius: 20,
  padding: '36px 32px',
  boxShadow: '0 40px 100px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04)',
  position: 'relative',
  maxHeight: '90vh',
  overflowY: 'auto',
};

const closeBtnStyle = {
  position: 'absolute', top: 16, right: 16,
  background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 8,
  color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
  width: 30, height: 30, fontSize: 16,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const tabBarStyle = {
  display: 'flex',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  marginBottom: 4,
};

const tabBtnBase = {
  flex: 1, padding: '10px 0',
  border: 'none', cursor: 'pointer',
  fontWeight: 700, fontSize: 14,
  letterSpacing: '0.05em',
  transition: 'all 0.2s',
  background: 'transparent',
};

const labelStyle = {
  display: 'block',
  color: 'rgba(255,255,255,0.5)', fontSize: 11.5, fontWeight: 700,
  letterSpacing: '0.08em', textTransform: 'uppercase',
};

const inputStyle = {
  width: '100%', padding: '11px 14px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10, color: '#e2e8f0',
  fontSize: 14, outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
};

const eyeBtnStyle = {
  background: 'none', border: 'none',
  color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
  fontSize: 15, padding: 0, lineHeight: 1,
};

const linkBtnStyle = {
  background: 'none', border: 'none',
  color: '#818cf8', cursor: 'pointer',
  fontWeight: 700, fontSize: 13,
  textDecoration: 'underline', padding: 0,
};

const spinnerStyle = {
  display: 'inline-block',
  width: 15, height: 15,
  border: '2px solid rgba(255,255,255,0.25)',
  borderTop: '2px solid #fff',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
  verticalAlign: 'middle',
};
