import React, { useState, useEffect, useCallback } from 'react';
import { authHeaders } from '../utils/auth';

const API = '/api';

const formatDate = (dateStr) => {
  if (!dateStr) return '从未登录';
  const d = new Date(dateStr);
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff < 30) return `${diff} 天前`;
  return d.toLocaleDateString('zh-CN');
};

export default function AdvisorClientsPanel({ currentUser }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null); // 展开的客户 id
  const [clientPortfolios, setClientPortfolios] = useState({}); // { clientId: [...portfolios] }
  const [portfolioLoading, setPortfolioLoading] = useState({});

  const fetchClients = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/advisor/clients`, {
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setClients(Array.isArray(data) ? data : (data.clients || []));
    } catch (e) {
      setError('无法加载客户列表：' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleExpandClient = async (clientId) => {
    if (expandedId === clientId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(clientId);
    if (clientPortfolios[clientId]) return; // 已加载，不重复请求

    setPortfolioLoading(prev => ({ ...prev, [clientId]: true }));
    try {
      const res = await fetch(`${API}/advisor/clients/${clientId}/portfolios`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setClientPortfolios(prev => ({
        ...prev,
        [clientId]: Array.isArray(data) ? data : (data.portfolios || [])
      }));
    } catch (e) {
      setClientPortfolios(prev => ({ ...prev, [clientId]: [] }));
    } finally {
      setPortfolioLoading(prev => ({ ...prev, [clientId]: false }));
    }
  };

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* 标题 */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>
          👥 我的客户
        </h2>
        <p style={{ margin: '6px 0 0', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
          {currentUser?.role === 'admin' ? '以管理员身份查看所有顾问客户关系' : '您作为财务顾问管理的客户列表'}
        </p>
      </div>

      {/* 操作栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
          共 <strong style={{ color: '#818cf8' }}>{clients.length}</strong> 位客户
        </span>
        <button onClick={fetchClients} style={refreshBtnStyle}>🔄 刷新</button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#fca5a5', marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.4)' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
          <div>正在加载客户列表…</div>
        </div>
      ) : clients.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.3)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>暂无关联客户</div>
          <div style={{ fontSize: 13, marginTop: 8 }}>请联系系统管理员建立顾问-客户关系</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {clients.map(client => (
            <div
              key={client.id}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 14,
                overflow: 'hidden',
                transition: 'border-color 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
            >
              {/* 客户卡片主体 */}
              <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                {/* 头像 */}
                <div style={{
                  width: 46, height: 46, borderRadius: '50%',
                  background: 'rgba(99,102,241,0.15)',
                  border: '1px solid rgba(99,102,241,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 700, color: '#818cf8', flexShrink: 0,
                }}>
                  {(client.display_name || client.email)[0].toUpperCase()}
                </div>

                {/* 客户信息 */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#f1f5f9' }}>
                      {client.display_name || '未设置名称'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                    📧 {client.email}
                  </div>
                </div>

                {/* 右侧统计与操作 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#818cf8' }}>
                      {client.portfolio_count ?? '—'}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>组合</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>
                      {client.insurance_count ?? '—'}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>保险方案</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>最后活跃</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{formatDate(client.last_login_at)}</div>
                  </div>

                  {/* 展开按钮 */}
                  <button
                    onClick={() => handleExpandClient(client.id)}
                    style={{
                      padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      background: expandedId === client.id ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${expandedId === client.id ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.12)'}`,
                      color: expandedId === client.id ? '#818cf8' : '#94a3b8',
                      cursor: 'pointer', transition: 'all 0.2s',
                    }}
                  >
                    {expandedId === client.id ? '▲ 收起' : '👁 查看组合'}
                  </button>
                </div>
              </div>

              {/* 展开：组合列表 */}
              {expandedId === client.id && (
                <div style={{
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(0,0,0,0.15)',
                  padding: '16px 20px',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.45)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    📁 投资组合列表
                  </div>
                  {portfolioLoading[client.id] ? (
                    <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>⏳ 加载中…</div>
                  ) : (clientPortfolios[client.id] || []).length === 0 ? (
                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>该客户暂无投资组合</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(clientPortfolios[client.id] || []).map(pf => (
                        <div
                          key={pf.id}
                          style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '10px 14px',
                            background: 'rgba(255,255,255,0.04)',
                            borderRadius: 9,
                            border: '1px solid rgba(255,255,255,0.06)',
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 13 }}>{pf.name}</span>
                            <span style={{ marginLeft: 10, color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>{pf.dividend_strategy} · {pf.base_currency}</span>
                          </div>
                          <div style={{ fontSize: 12, color: '#94a3b8' }}>
                            创建于 {pf.created_at ? new Date(pf.created_at).toLocaleDateString('zh-CN') : '—'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Styles ──
const refreshBtnStyle = {
  padding: '7px 16px', borderRadius: 9,
  background: 'rgba(99,102,241,0.1)',
  border: '1px solid rgba(99,102,241,0.3)',
  color: '#818cf8', cursor: 'pointer',
  fontSize: 13, fontWeight: 600,
};
