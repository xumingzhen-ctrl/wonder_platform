import React, { useState, useEffect, useCallback } from 'react';
import { authHeaders } from '../utils/auth';

const API = '/api';

const ROLE_META = {
  admin:   { label: '管理员', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  advisor: { label: '财务顾问', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  premium: { label: '付费会员', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  free:    { label: '普通用户', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
};

export default function AdminPanel({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState(null); // user being edited in modal
  const [saving, setSaving] = useState(false);
  const [filterRole, setFilterRole] = useState('all');
  const [search, setSearch] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/admin/users`, {
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : (data.users || []));
    } catch (e) {
      setError('无法加载用户列表：' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch(`${API}/admin/stats`, {
        headers: authHeaders(),
      });
      if (!res.ok) return;
      setStats(await res.json());
    } catch (_) {}
    finally { setStatsLoading(false); }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchStats();
  }, [fetchUsers, fetchStats]);

  // 更改角色
  const handleRoleChange = async (userId, newRole) => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || '修改失败');
      await fetchUsers();
    } catch (e) {
      alert('修改角色失败：' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // 封禁/激活
  const handleStatusToggle = async (userId, isActive) => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/admin/users/${userId}/status`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || '操作失败');
      await fetchUsers();
    } catch (e) {
      alert('操作失败：' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // 过滤
  const filteredUsers = users.filter(u => {
    const matchRole = filterRole === 'all' || u.role === filterRole;
    const matchSearch = !search.trim() ||
      (u.display_name || '').toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    return matchRole && matchSearch;
  });

  const statCards = stats ? [
    { label: '总用户数', value: stats.total_users ?? '—', icon: '👥', color: '#818cf8' },
    { label: '管理员', value: stats.admin_count ?? '—', icon: '🔴', color: '#ef4444' },
    { label: '财务顾问', value: stats.advisor_count ?? '—', icon: '🔵', color: '#3b82f6' },
    { label: '付费会员', value: stats.premium_count ?? '—', icon: '🟡', color: '#f59e0b' },
    { label: '普通用户', value: stats.free_count ?? '—', icon: '⚫', color: '#6b7280' },
    { label: '组合总数', value: stats.total_portfolios ?? '—', icon: '📁', color: '#10b981' },
  ] : [];

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* 标题 */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>
          👥 用户管理
        </h2>
        <p style={{ margin: '6px 0 0', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
          系统管理员 · 查看与管理所有注册用户
        </p>
      </div>

      {/* 统计卡片 */}
      {!statsLoading && stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 28 }}>
          {statCards.map(c => (
            <div key={c.label} style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12, padding: '14px 16px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{c.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* 筛选 & 搜索 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, alignItems: 'center' }}>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          style={selectStyle}
        >
          <option value="all">全部角色</option>
          <option value="admin">管理员</option>
          <option value="advisor">财务顾问</option>
          <option value="premium">付费会员</option>
          <option value="free">普通用户</option>
        </select>
        <input
          type="text"
          placeholder="搜索姓名或邮箱…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...selectStyle, flex: 1 }}
        />
        <button onClick={fetchUsers} style={refreshBtnStyle}>
          🔄 刷新
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#fca5a5', marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {/* 加载状态 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.4)' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
          <div>正在加载用户列表…</div>
        </div>
      ) : (
        /* 用户表格 */
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                {['ID', '显示名称', '邮箱', '角色', '关联顾问', '状态', '操作'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.3)' }}>
                    暂无用户记录
                  </td>
                </tr>
              ) : filteredUsers.map((u, idx) => (
                <tr
                  key={u.id}
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'}
                >
                  <td style={tdStyle}><span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>#{u.id}</span></td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: `${ROLE_META[u.role]?.color || '#6b7280'}30`,
                        border: `1px solid ${ROLE_META[u.role]?.color || '#6b7280'}50`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700, color: ROLE_META[u.role]?.color || '#6b7280',
                      }}>
                        {(u.display_name || u.email)[0].toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 13 }}>
                        {u.display_name || '—'}
                      </span>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{u.email}</td>
                  <td style={tdStyle}>
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      disabled={saving || u.id === currentUser?.id}
                      style={{
                        padding: '4px 8px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        background: ROLE_META[u.role]?.bg || 'rgba(107,114,128,0.12)',
                        border: `1px solid ${ROLE_META[u.role]?.color || '#6b7280'}50`,
                        color: ROLE_META[u.role]?.color || '#6b7280',
                        cursor: u.id === currentUser?.id ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <option value="admin">管理员</option>
                      <option value="advisor">财务顾问</option>
                      <option value="premium">付费会员</option>
                      <option value="free">普通用户</option>
                    </select>
                  </td>
                  <td style={{ ...tdStyle, color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                    {u.advisor_name || '—'}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                      background: u.is_active ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                      border: `1px solid ${u.is_active ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      color: u.is_active ? '#4ade80' : '#fca5a5',
                    }}>
                      {u.is_active ? '✅ 正常' : '🚫 封禁'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {u.id !== currentUser?.id && (
                      <button
                        onClick={() => handleStatusToggle(u.id, u.is_active)}
                        disabled={saving}
                        style={{
                          padding: '4px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                          background: u.is_active ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                          border: `1px solid ${u.is_active ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                          color: u.is_active ? '#fca5a5' : '#4ade80',
                          cursor: saving ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {u.is_active ? '封禁' : '激活'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, marginTop: 16, textAlign: 'right' }}>
        共 {filteredUsers.length} 条记录
        {currentUser?.role === 'admin' && ' · 以 admin 身份登录（不可修改自身角色）'}
      </p>
    </div>
  );
}

// ── Styles ──
const tdStyle = { padding: '12px 16px', color: '#e2e8f0', fontSize: 13, verticalAlign: 'middle' };
const selectStyle = {
  padding: '8px 12px', borderRadius: 9,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#e2e8f0', fontSize: 13, outline: 'none',
};
const refreshBtnStyle = {
  padding: '8px 16px', borderRadius: 9,
  background: 'rgba(99,102,241,0.1)',
  border: '1px solid rgba(99,102,241,0.3)',
  color: '#818cf8', cursor: 'pointer',
  fontSize: 13, fontWeight: 600,
  whiteSpace: 'nowrap',
};
