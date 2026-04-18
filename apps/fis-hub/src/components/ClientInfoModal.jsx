import React, { useState, useEffect } from 'react';

/**
 * ClientInfoModal — 生成报告前的客户信息录入弹窗
 * 用户可选择填写或直接跳过（使用通用模版）
 */
const GOAL_OPTIONS = [
  { value: 'retirement', label: '🏡 退休收入保障' },
  { value: 'education',  label: '🎓 子女教育基金' },
  { value: 'legacy',     label: '🏛️ 遗产传承规划' },
  { value: 'growth',     label: '📈 资产保值增值' },
  { value: 'liquidity',  label: '💧 流动性储备' },
];

const ClientInfoModal = ({ onConfirm, onSkip, onClose }) => {
  const [name, setName]         = useState('');
  const [age, setAge]           = useState('');
  const [goals, setGoals]       = useState([]);
  const [advisor, setAdvisor]   = useState('');

  // ESC 关闭
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const toggleGoal = (val) => {
    setGoals(prev =>
      prev.includes(val) ? prev.filter(g => g !== val) : [...prev, val]
    );
  };

  const handleConfirm = () => {
    onConfirm({ name, age: age ? parseInt(age) : null, goals, advisor });
  };

  const handleSkip = () => {
    onSkip();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: 520 }}>
        <div className="glass-card" style={{ padding: '36px 40px', borderRadius: '20px' }}>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ margin: '0 0 8px', fontSize: '1.4rem', color: '#fff' }}>
              📋 客户信息（选填）
            </h2>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
              填写客户信息后，报告将生成个性化开篇叙述。<br/>
              所有项目均为选填，可直接点击「跳过，使用通用模版」。
            </p>
          </div>

          {/* 姓名 */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 7, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              客户姓名
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例：陈先生 / 林女士"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 10, padding: '10px 14px',
                color: '#fff', fontSize: '0.95rem', outline: 'none'
              }}
            />
          </div>

          {/* 年龄 */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 7, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              当前年龄
            </label>
            <input
              type="number"
              value={age}
              onChange={e => setAge(e.target.value)}
              placeholder="例：45（填写后关键里程碑将显示实际年龄）"
              min={18} max={80}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 10, padding: '10px 14px',
                color: '#fff', fontSize: '0.95rem', outline: 'none'
              }}
            />
            {age && (
              <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#818cf8' }}>
                ✓ 报告将标注：退休（{parseInt(age) < 65 ? 65 - parseInt(age) + '年后' : '已达退休年龄'}）、长寿规划（{80 - parseInt(age) > 0 ? 80 - parseInt(age) + '年后' : '—'}）等关键里程碑
              </p>
            )}
          </div>

          {/* 财务目标 */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 10, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              主要财务目标（可多选）
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {GOAL_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleGoal(opt.value)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 20,
                    border: `1px solid ${goals.includes(opt.value) ? '#818cf8' : 'rgba(255,255,255,0.15)'}`,
                    background: goals.includes(opt.value) ? 'rgba(129,140,248,0.2)' : 'rgba(255,255,255,0.04)',
                    color: goals.includes(opt.value) ? '#c7d2fe' : 'rgba(255,255,255,0.7)',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontWeight: goals.includes(opt.value) ? 600 : 400,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 顾问/机构名称 */}
          <div style={{ marginBottom: 28 }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 7, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              顾问 / 机构名称
            </label>
            <input
              type="text"
              value={advisor}
              onChange={e => setAdvisor(e.target.value)}
              placeholder="例：德盛财富管理 / 您的姓名"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 10, padding: '10px 14px',
                color: '#fff', fontSize: '0.95rem', outline: 'none'
              }}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              onClick={handleConfirm}
              style={{
                flex: 1,
                padding: '12px 0',
                background: 'linear-gradient(135deg, #6366f1, #818cf8)',
                border: 'none', borderRadius: 10,
                color: '#fff', fontWeight: 700, fontSize: '0.95rem',
                cursor: 'pointer',
              }}
            >
              ✅ 确认生成报告
            </button>
            <button
              type="button"
              onClick={handleSkip}
              style={{
                flex: 1,
                padding: '12px 0',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 10,
                color: 'rgba(255,255,255,0.6)', fontWeight: 600, fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              跳过，使用通用模版
            </button>
          </div>

          <p style={{ margin: '16px 0 0', textAlign: 'center', fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)' }}>
            按 ESC 取消 · 客户信息仅用于本次报告生成，不会被上传或储存
          </p>
        </div>
      </div>
    </div>
  );
};

export default ClientInfoModal;
