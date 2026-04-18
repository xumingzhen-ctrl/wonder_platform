import React from 'react';
import { hasRole } from '../utils/auth';

const MIN_ROLE_LABELS = {
  premium: '付费会员',
  advisor: '财务顾问',
  admin: '管理员',
};

const UPGRADE_BENEFITS = {
  premium: [
    '蒙特卡洛终值模拟',
    '有效前沿组合优化',
    '保险底座叠加分析',
    '财富规划 PDF 报告',
    '无限组合创建',
  ],
  advisor: [
    '客户组合管理',
    '为客户上传保险方案',
    '客户演示模式（Showcase）',
    '高级数据导出',
  ],
  admin: ['系统级管理权限'],
};

/**
 * FeatureLock — 包裹高级功能区域
 *
 * Props:
 *   minRole      - 'premium' | 'advisor' | 'admin'   最低角色要求
 *   currentUser  - 当前登录用户对象（或 null）
 *   children     - 真实内容（有权限时渲染）
 *   featureName  - 功能名称，用于展示
 *   onLoginClick - 可选：点击"登录"时的回调
 */
export default function FeatureLock({
  minRole = 'premium',
  currentUser,
  children,
  featureName = '此功能',
  onLoginClick,
}) {
  // 有权限 → 直接渲染子内容
  if (currentUser && hasRole(currentUser.role, minRole)) {
    return children;
  }

  const benefits = UPGRADE_BENEFITS[minRole] || [];
  const requiredLabel = MIN_ROLE_LABELS[minRole] || minRole;
  const isLoggedIn = !!currentUser;
  const isFree = currentUser?.role === 'free';

  return (
    <div style={{
      position: 'relative',
      borderRadius: 16,
      overflow: 'hidden',
      border: '1px solid rgba(245,158,11,0.25)',
      background: 'linear-gradient(135deg, rgba(15,23,42,0.97), rgba(30,27,75,0.97))',
      padding: '40px 32px',
      textAlign: 'center',
      boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
    }}>
      {/* 顶部发光圈 */}
      <div style={{
        position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
        width: 120, height: 120, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* 锁图标 */}
      <div style={{
        fontSize: 44, marginBottom: 16,
        filter: 'drop-shadow(0 0 12px rgba(245,158,11,0.4))',
      }}>
        🔒
      </div>

      {/* 标题 */}
      <h3 style={{
        margin: '0 0 8px',
        fontSize: 20, fontWeight: 800,
        color: '#f1f5f9',
      }}>
        {featureName} 需要升级
      </h3>

      <p style={{ margin: '0 0 24px', color: 'rgba(255,255,255,0.45)', fontSize: 14, lineHeight: 1.6 }}>
        此功能仅对 <span style={{ color: '#f59e0b', fontWeight: 700 }}>{requiredLabel}</span> 及以上开放
        {isFree && '，您当前为普通用户'}
      </p>

      {/* 升级权益列表 */}
      {benefits.length > 0 && (
        <div style={{
          background: 'rgba(245,158,11,0.06)',
          border: '1px solid rgba(245,158,11,0.15)',
          borderRadius: 12, padding: '16px 20px',
          marginBottom: 24, textAlign: 'left',
          display: 'inline-block', minWidth: 260,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            升级后可使用
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {benefits.map(b => (
              <li key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, color: '#e2e8f0' }}>
                <span style={{ color: '#4ade80', flexShrink: 0 }}>✅</span>
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CTA 区域 */}
      {!isLoggedIn ? (
        <div>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 14 }}>
            请先登录后查看
          </p>
          {onLoginClick && (
            <button
              onClick={onLoginClick}
              style={ctaBtnStyle('#6366f1', '#818cf8')}
            >
              🔑 立即登录
            </button>
          )}
        </div>
      ) : (
        <div>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginBottom: 14 }}>
            请联系您的财务顾问为您的账号升级
          </p>
          <a
            href="mailto:support@wonderhub.hk"
            style={{ ...ctaBtnStyle('#f59e0b', '#fbbf24'), textDecoration: 'none', display: 'inline-block' }}
          >
            💬 联系顾问了解更多
          </a>
        </div>
      )}
    </div>
  );
}

// ── Styles ──
function ctaBtnStyle(from, to) {
  return {
    padding: '10px 24px', borderRadius: 10,
    background: `linear-gradient(135deg, ${from}, ${to})`,
    border: 'none', color: '#fff',
    fontWeight: 700, fontSize: 14, cursor: 'pointer',
    boxShadow: `0 4px 16px ${from}55`,
    transition: 'all 0.2s',
  };
}
