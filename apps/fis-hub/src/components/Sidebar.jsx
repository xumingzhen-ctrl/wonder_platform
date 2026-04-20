import React, { useState, useRef } from 'react';
import { Briefcase, Activity, Plus, Trash2, Users, UserCheck, GripVertical } from 'lucide-react';

/**
 * Sidebar component — tabs, portfolio list (with drag-to-reorder), actions, scenarios drawer, and role-aware nav.
 */
const Sidebar = ({
  activeTab, setActiveTab,
  portfolios, setPortfolios, activeId, setActiveId,
  setShowModal, setShowBrokerImport, setShowBrokerSync,
  setDeleteCandidate, setShowDeleteModal,
  savedScenarios, handleLoadScenario, handleDeleteScenario,
  currentUser, canEditPortfolio
}) => {
  const isAdmin   = currentUser?.role === 'admin';
  const isAdvisor = currentUser?.role === 'advisor' || isAdmin;

  // ── 拖拽排序状态 ──────────────────────────────────────────────
  const dragId    = useRef(null);   // 正在拖动的组合 id
  const dragOver  = useRef(null);   // 当前悬停目标 id
  const [dropTarget, setDropTarget] = useState(null); // 用于高亮插入线

  const handleDragStart = (e, id) => {
    dragId.current = id;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== dragOver.current) {
      dragOver.current = id;
      setDropTarget(id);
    }
  };

  const handleDragLeave = () => {
    // 不立即清除，避免子元素触发 leave
  };

  const handleDrop = async (e, targetId) => {
    e.preventDefault();
    setDropTarget(null);
    const fromId = dragId.current;
    if (!fromId || fromId === targetId) return;

    // 重新排序本地列表
    const newList = [...portfolios];
    const fromIdx = newList.findIndex(p => p.id === fromId);
    const toIdx   = newList.findIndex(p => p.id === targetId);
    newList.splice(fromIdx, 1);
    newList.splice(toIdx, 0, portfolios[fromIdx]);

    // 立即更新 UI
    setPortfolios(newList);

    // 持久化到后端
    try {
      await fetch('/api/portfolios/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordered_ids: newList.map(p => p.id) })
      });
    } catch (err) {
      console.error('排序保存失败:', err);
    }

    dragId.current   = null;
    dragOver.current = null;
  };

  const handleDragEnd = () => {
    dragId.current   = null;
    dragOver.current = null;
    setDropTarget(null);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">Portfolio<span style={{fontWeight:300}}>Hub</span></div>

      {/* ── 主 Tab 切换 ── */}
      <div style={{display: 'flex', gap: '10px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px'}}>
        <button
          onClick={() => setActiveTab('portfolios')}
          style={tabBtnStyle(activeTab === 'portfolios')}
        >
          <Briefcase size={14} /> 组合
        </button>
        <button
          onClick={() => setActiveTab('lab')}
          style={tabBtnStyle(activeTab === 'lab')}
        >
          <Activity size={14} /> 实验室
        </button>
      </div>

      {/* ── 角色专属入口 ── */}
      {(isAdmin || isAdvisor) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {isAdvisor && (
            <button
              onClick={() => setActiveTab('advisor')}
              style={roleNavBtnStyle(activeTab === 'advisor', '#3b82f6')}
            >
              <UserCheck size={14} />
              {isAdmin ? '顾问客户管理' : '我的客户'}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setActiveTab('admin')}
              style={roleNavBtnStyle(activeTab === 'admin', '#ef4444')}
            >
              <Users size={14} />
              👥 用户管理
            </button>
          )}
        </div>
      )}

      {/* ── 组合列表（支持拖拽排序）── */}
      <nav className="portfolio-list" style={{display: activeTab === 'portfolios' ? 'flex' : 'none', flexDirection: 'column', gap: 6}}>
        <div className="stat-label" style={{marginBottom: '4px', fontSize: '0.7rem'}}>
          我的组合
          <span style={{ marginLeft: 6, color: 'rgba(255,255,255,0.25)', fontSize: '0.62rem', fontWeight: 400 }}>
            可拖拽排序
          </span>
        </div>

        {portfolios.map(pf => {
          const isDropTarget = dropTarget === pf.id;
          return (
            <div
              key={pf.id}
              draggable
              onDragStart={(e) => handleDragStart(e, pf.id)}
              onDragOver={(e) => handleDragOver(e, pf.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, pf.id)}
              onDragEnd={handleDragEnd}
              className={`portfolio-item ${activeId === pf.id ? 'active' : ''}`}
              onClick={() => {setActiveId(pf.id); setActiveTab('portfolios');}}
              style={{
                position: 'relative',
                outline: isDropTarget ? '2px solid rgba(99,102,241,0.8)' : 'none',
                transition: 'outline 0.1s',
                cursor: 'grab',
              }}
            >
              {/* 拖拽手柄 */}
              <div
                style={{
                  display: 'flex', alignItems: 'center',
                  color: 'rgba(255,255,255,0.2)',
                  marginRight: 6, flexShrink: 0,
                  cursor: 'grab',
                }}
                title="拖拽调整顺序"
              >
                <GripVertical size={13} />
              </div>

              <div style={{flex: 1, minWidth: 0}}>
                <div className="name" style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                  {pf.name}
                </div>
                <div className="date">{pf.dividend_strategy} Strategy</div>
              </div>

              <div className="actions">
                {canEditPortfolio && canEditPortfolio(pf) && (
                  <Trash2 size={14} className="action-icon" onClick={(e) => { e.stopPropagation(); setDeleteCandidate(pf.id); setShowDeleteModal(true); }} />
                )}
              </div>
            </div>
          );
        })}
      </nav>

      {/* ── 组合操作按钮 ── */}
      {activeTab === 'portfolios' && (
        <>
          <button className="create-btn" onClick={() => setShowModal(true)}>
            <Plus size={18} /> New Strategy
          </button>
        </>
      )}

      {/* ── 策略实验室：历史方案 ── */}
      {activeTab === 'lab' && (
        <nav className="scenarios-list" style={{display: 'block', marginTop: '6px'}}>
          <div className="stat-label" style={{marginBottom: '8px', fontSize: '0.75rem', fontWeight: 'bold', color: 'rgba(255, 255, 255, 0.7)'}}>💾 历史方案</div>
          {savedScenarios.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: '30px 0' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>📭</div>
              <div style={{ fontSize: '0.75rem' }}>暂无保存的方案</div>
            </div>
          ) : savedScenarios.map(sc => (
            <div key={sc.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px', marginBottom: '10px', cursor: 'pointer', transition: 'border-color 0.2s', position: 'relative' }}
                 onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)'}
                 onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                 onClick={() => handleLoadScenario(sc.id)}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#10b981', marginBottom: '4px', paddingRight: '24px', lineHeight: 1.2 }}>{sc.name}</div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', marginBottom: '8px' }}>{new Date(sc.created_at).toLocaleDateString('zh-CN')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                {sc.assets.map(a => <span key={a} style={{ background: 'rgba(129,140,248,0.12)', color: '#818cf8', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600 }}>{a}</span>)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem' }}>
                <div><span style={{color: 'rgba(255,255,255,0.4)'}}>本金: </span><span>${(sc.summary.capital/1000).toFixed(0)}k</span></div>
                <div><span style={{color: 'rgba(255,255,255,0.4)'}}>年提: </span><span style={{color: '#f59e0b'}}>${((sc.summary.withdrawal||0)/1000).toFixed(0)}k</span></div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteScenario(sc.id); }}
                style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.2)', border: 'none', borderRadius: '6px', color: 'rgba(244,63,94,0.6)', cursor: 'pointer', padding: '4px' }}
                title="删除">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </nav>
      )}
    </aside>
  );
};

// ── Styles ──
const tabBtnStyle = (active) => ({
  flex: 1, padding: '8px',
  background: active ? 'rgba(99,102,241,0.2)' : 'transparent',
  border: '1px solid ' + (active ? '#818cf8' : 'transparent'),
  borderRadius: '6px',
  color: active ? '#fff' : 'rgba(255,255,255,0.6)',
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  fontSize: '0.82rem',
});

const roleNavBtnStyle = (active, accentColor) => ({
  width: '100%', padding: '9px 12px',
  background: active ? `${accentColor}20` : 'rgba(255,255,255,0.04)',
  border: `1px solid ${active ? accentColor + '60' : 'rgba(255,255,255,0.08)'}`,
  borderRadius: 9, color: active ? '#fff' : 'rgba(255,255,255,0.6)',
  cursor: 'pointer', fontSize: '0.82rem', fontWeight: active ? 700 : 400,
  display: 'flex', alignItems: 'center', gap: 8,
  transition: 'all 0.2s',
});

export default Sidebar;
