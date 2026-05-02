import React, { useState, useMemo } from 'react';
import { useLang } from '../i18n/LangContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, ComposedChart
} from 'recharts';
import {
  Activity, ArrowUpRight, Briefcase, Calendar, Camera, ChevronDown, DollarSign, Edit3, MoreHorizontal, Settings, TrendingUp, Undo2
} from 'lucide-react';
import { COLORS, getCurrencySymbol, fmtMoney, fmtAxis, fmtCompact } from '../utils/currency';
import ILPSummaryCard from './ILPSummaryCard';
import { calcILPMonthlyFee, getEnrollmentBonusRate } from '../utils/ilpImpactUtils';

/**
 * PortfolioView — renders the full portfolio detail tab UI.
 * All state, data, and handlers are passed in as props from App.jsx.
 */
const PortfolioView = ({
  // Core data
  portfolios, activeId, data, historyData, loading,
  // Sub-tab
  activeSubTab, setActiveSubTab,
  // Dividend
  divProjData, divLoading, taxRate, setTaxRate, dripMode, setDripMode,
  // Computed derived data
  sectorData, top10Data, getDaysUntil,
  // Action modals
  setShowDivModal, setShowRenameModal, setRenameDraft,
  // Handlers
  handleExportCSV, handleExportDividendsCSV,
  handleOpenCompModal, handleOpenManageDivModal,
  handleRebalancePreview, handleUndoRebalance,
  // Permissions
  canEdit,
  // ILP
  ilpEnabled, ilpConfig, setIlpConfig, setIlpEnabled,
  onOpenIlpEnrollmentModal,
}) => {
  const { t } = useLang();
  // Re-export the formatter functions for convenience inside JSX
  const fx = data?.usd_to_base_fx || 1;
  const ccy = data?.base_currency || 'USD';

  // ── ILP 应用至历史 NAV ───────────────────────────────────────────────────
  const [applyIlpToChart, setApplyIlpToChart] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const ilpHistoryData = useMemo(() => {
    if (!applyIlpToChart || !ilpEnabled || !(ilpConfig?.totalPremium > 0) || historyData.length === 0) {
      return historyData;
    }
    const firstVal = historyData[0]?.value || 1;

    // ── 关键修正 ────────────────────────────────────────────────────────────
    // 1. 保费基准 = 组合初始投入（而非 ilpConfig.totalPremium），确保完全对齐
    const effectivePremium = firstVal;
    const bonusRate = ilpConfig.enrollmentRate ?? getEnrollmentBonusRate(ilpConfig.totalPremium || effectivePremium);
    const enrollmentBonus = effectivePremium * bonusRate;

    // 2. ILP 初始倍数 > 1：开户奖赏立即以单位方式进入，初始净值高于组合
    //    ilp_value[0] = firstVal × (1 + bonusRate) = firstVal + enrollmentBonus
    const initialMultiplier = (firstVal + enrollmentBonus) / firstVal; // = 1 + bonusRate

    // 3. 累积折扣：每月按费用率递减（从 initialMultiplier 开始）
    let ilpMultiplier = initialMultiplier;

    return historyData.map((d, i) => {
      if (i > 0) {
        const growthFactor = firstVal > 0 ? d.value / firstVal : 1;
        // 用对齐后的 effectivePremium 计算 ILP 账户价值（供 COI / 费率查表）
        const ilpAV = effectivePremium * growthFactor;
        const fees = calcILPMonthlyFee(i + 1, ilpAV, ilpConfig);
        const feeRate = ilpAV > 0 ? fees.netFee / ilpAV : 0;
        ilpMultiplier = ilpMultiplier * (1 - feeRate);
      }
      // ILP 净值 = 组合真实市值 × 当前 ILP 倍数
      const ilp_value = Math.max(0, d.value * ilpMultiplier);
      return { ...d, ilp_value, raw_value: d.value, ilp_bonus: i === 0 ? enrollmentBonus : 0 };
    });
  }, [applyIlpToChart, ilpEnabled, ilpConfig, historyData]);

  const ilpSummary = useMemo(() => {
    if (!applyIlpToChart || ilpHistoryData.length === 0) return null;
    const first = ilpHistoryData[0];
    const last  = ilpHistoryData[ilpHistoryData.length - 1];
    const months = ilpHistoryData.length;
    // 两条线有不同起点（ILP因奖赏更高），各自从自己的起点计算年化
    const rawCagr = first?.value > 0 && last?.raw_value > 0
      ? ((last.raw_value / first.value) ** (12 / months) - 1) * 100 : 0;
    const ilpCagr = first?.ilp_value > 0 && last?.ilp_value > 0
      ? ((last.ilp_value / first.ilp_value) ** (12 / months) - 1) * 100 : 0;
    const drag = last?.raw_value > 0 ? ((last.raw_value - last.ilp_value) / last.raw_value) * 100 : 0;
    const enrollmentBonus = first?.ilp_bonus ?? 0;
    return { rawFinal: last?.raw_value, ilpFinal: last?.ilp_value, rawCagr, ilpCagr, drag, enrollmentBonus };
  }, [applyIlpToChart, ilpHistoryData]);


  if (loading) return <div style={{textAlign: 'center', paddingTop: '100px'}}><h2>{t('empty.analyzingData')}</h2></div>;
  if (!data || !data.details) return null;

  return (
    <div className="portfolio-view-scope">
      <header style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '60px', paddingTop: '10px'}}>
        <div style={{maxWidth: '60%'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px'}}>
            <h1 style={{
              textAlign: 'left', 
              margin: 0, 
              fontSize: '2.4rem', 
              fontWeight: 800, 
              letterSpacing: '-0.02em',
              background: 'linear-gradient(to bottom, #ffffff, #94a3b8)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              {portfolios.find(p => p.id === activeId)?.name}
            </h1>
            {canEdit && (
              <button
                title="Rename portfolio"
                onClick={() => { setRenameDraft(portfolios.find(p => p.id === activeId)?.name || ''); setShowRenameModal(true); }}
                style={{
                  background: 'rgba(129, 140, 248, 0.1)', 
                  border: '1px solid rgba(129, 140, 248, 0.2)', 
                  borderRadius: '8px',
                  cursor: 'pointer', 
                  padding: '6px', 
                  color: '#818cf8', 
                  display: 'flex', 
                  alignItems: 'center',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(129, 140, 248, 0.2)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(129, 140, 248, 0.1)'}
              >
                <Edit3 size={16} />
              </button>
            )}
          </div>
          <div className="header-subtitle" style={{
            display: 'flex', 
            flexWrap: 'wrap', 
            alignItems: 'center', 
            gap: '12px',
            color: 'rgba(255,255,255,0.45)',
            fontSize: '0.9rem',
            lineHeight: 1.6,
            marginTop: '12px'
          }}>
            <span style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
              <Calendar size={14} strokeWidth={2.5} /> 
              {t('portfolio.strategyStart')}: <span style={{color: 'rgba(255,255,255,0.7)'}}>{data.start_date}</span>
            </span>
            <span style={{color: 'rgba(255,255,255,0.15)'}}>|</span>
            <span>{t('portfolio.resultsAsOf')}: <span style={{color: 'rgba(255,255,255,0.7)'}}>{data.report_date}</span></span>
            
            {data.wallet_balance !== undefined && (
              <span style={{
                background: 'rgba(255,255,255,0.05)', 
                padding: '4px 10px', 
                borderRadius: '6px', 
                color: '#818cf8',
                fontWeight: 600,
                fontSize: '0.85rem',
                border: '1px solid rgba(129, 140, 248, 0.2)',
                marginLeft: '8px'
              }}>
                {t('portfolio.wallet')}: {fmtMoney(data.wallet_balance, 1, data.base_currency || 'USD')}
              </span>
            )}
          </div>
        </div>
        
        <div style={{display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'flex-end', maxWidth: '45%'}}>
          {/* Row 1: Core Actions + More */}
          <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
            {canEdit && (
              <>
                <button onClick={handleOpenCompModal} className="action-btn-secondary" title={t('portfolio.tradingManager')}>
                  <Briefcase size={14} /> {t('portfolio.tradingManager')}
                </button>
                <button onClick={handleRebalancePreview} className="action-btn-secondary" title={t('portfolio.rebalance')}>
                  <TrendingUp size={14} /> {t('portfolio.rebalance')}
                </button>
                <button onClick={handleUndoRebalance} className="action-btn-secondary" title={t('portfolio.undo')}>
                  <Undo2 size={14} /> {t('portfolio.undo')}
                </button>
              </>
            )}
            
            {/* More Menu */}
            <div style={{position: 'relative'}}>
              <button 
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="action-btn-secondary"
                style={{padding: '6px 10px', background: showMoreMenu ? 'rgba(255,255,255,0.1)' : 'transparent'}}
              >
                <MoreHorizontal size={16} />
              </button>
              {showMoreMenu && (
                <div style={{
                  position: 'absolute', top: '110%', right: 0, zIndex: 100,
                  background: '#1e1e2f', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px', padding: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                  minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '4px'
                }}>
                  <button onClick={() => { handleExportCSV(); setShowMoreMenu(false); }} className="more-menu-item" style={{display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem', borderRadius: '6px'}}>
                    <Camera size={14} /> {t('portfolio.exportHoldings')}
                  </button>
                  <button onClick={() => { handleExportDividendsCSV(); setShowMoreMenu(false); }} className="more-menu-item" style={{display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem', borderRadius: '6px'}}>
                    <Camera size={14} /> {t('portfolio.exportDiv')}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Dividend Management */}
          {canEdit && (
            <div style={{display: 'flex', gap: '8px'}}>
              <button onClick={handleOpenManageDivModal} className="action-btn-secondary" title={t('portfolio.divManage')}>
                <Settings size={14} /> {t('portfolio.divManage')}
              </button>
              <button onClick={() => setShowDivModal(true)} className="action-btn-secondary" style={{background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)', color: '#10b981'}}>
                <DollarSign size={14} /> {t('portfolio.addDiv')}
              </button>
            </div>
          )}
        </div>
      </header>

              {/* Sub-Tabs Navigation */}
              <div style={{display: 'flex', gap: '20px', marginBottom: '30px', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
                <button 
                  onClick={() => setActiveSubTab('performance')}
                  style={{paddingBottom: '10px', background: 'transparent', border: 'none', borderBottom: activeSubTab === 'performance' ? '2px solid #818cf8' : '2px solid transparent', color: activeSubTab === 'performance' ? '#818cf8' : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontWeight: 500, transition: 'all 0.2s'}}
                >
                   {t('portfolio.tabPerformance')}
                </button>
                <button 
                  onClick={() => setActiveSubTab('dividends')}
                  style={{paddingBottom: '10px', background: 'transparent', border: 'none', borderBottom: activeSubTab === 'dividends' ? '2px solid #818cf8' : '2px solid transparent', color: activeSubTab === 'dividends' ? '#818cf8' : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontWeight: 500, transition: 'all 0.2s'}}
                >
                   {t('portfolio.tabIncome')}
                </button>
              </div>

              {activeSubTab === 'performance' ? (
                <>
                  {/* ILP 状态卡（紧凑模式） */}
                  {ilpEnabled && ilpConfig && ilpConfig.totalPremium > 0 && (
                    <ILPSummaryCard
                      ilpConfig={ilpConfig}
                      currentCV={data?.details?.reduce((sum, h) => sum + (h.market_value || 0), 0) || 0}
                      currentMonth={0}
                      compact={true}
                      onEditConfig={onOpenIlpEnrollmentModal}
                    />
                  )}
                  {/* Existing Performance View (NAV Chart + Summary Stats) */}
                  <section className="glass-card" style={{marginBottom: '40px', padding: '30px', minHeight: '380px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
                  <div className="stat-label" style={{fontSize: '1.2rem', color: '#fff'}}>{t('portfolio.performanceOverTime')}</div>
                  <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                    {historyData.length === 0 && <div style={{fontSize: '0.85rem', color: '#10b981', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'}}>{t('portfolio.syncingData')}</div>}
                    {ilpEnabled && ilpConfig?.totalPremium > 0 && historyData.length > 0 && (
                      <button
                        onClick={() => setApplyIlpToChart(v => !v)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          padding: '6px 14px', borderRadius: '8px', fontSize: '0.78rem',
                          fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                          background: applyIlpToChart ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${applyIlpToChart ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.12)'}`,
                          color: applyIlpToChart ? '#818cf8' : 'rgba(255,255,255,0.55)',
                        }}
                      >
                        🔗 {applyIlpToChart ? t('portfolio.ilpApplied') : t('portfolio.applyIlp')}
                      </button>
                    )}
                  </div>
                </div>
                <div style={{height: '300px', width: '100%'}}>
                  {historyData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      {applyIlpToChart ? (
                        <ComposedChart data={ilpHistoryData} margin={{top: 10, right: 10, left: 10, bottom: 0}}>
                          <defs>
                            <linearGradient id="rawColor" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="ilpColor" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor="#818cf8" stopOpacity={0.25}/>
                              <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.06} />
                          <XAxis dataKey="date" stroke="rgba(255,255,255,0.1)" tick={{fill: '#9ca3af', fontSize: 11}}
                            tickFormatter={(val) => val ? String(val).substring(0, 7) : ''} minTickGap={40} />
                          <YAxis stroke="rgba(255,255,255,0.1)" tick={{fill: '#9ca3af', fontSize: 11}}
                            tickFormatter={(val) => fmtAxis(Number(val), 1, data.base_currency || 'USD')} width={65} />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              const raw = payload.find(p => p.dataKey === 'raw_value')?.value;
                              const ilp = payload.find(p => p.dataKey === 'ilp_value')?.value;
                              const drag = raw > 0 && ilp != null ? ((raw - ilp) / raw * 100).toFixed(2) : null;
                              return (
                                <div style={{background: 'rgba(13,18,35,0.97)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '10px', padding: '12px 16px', fontSize: '0.8rem', minWidth: '200px'}}>
                                  <div style={{fontWeight: 800, color: '#818cf8', marginBottom: '8px'}}>{label}</div>
                                  {raw != null && <div style={{display: 'flex', justifyContent: 'space-between', gap: '14px', marginBottom: '4px'}}>
                                     <span style={{color: '#10b981'}}>{t('portfolio.ilpTooltipRaw')}</span>
                                    <span style={{color: '#10b981', fontWeight: 700, fontFamily: 'monospace'}}>{fmtMoney(raw, 1, data.base_currency || 'USD')}</span>
                                  </div>}
                                  {ilp != null && <div style={{display: 'flex', justifyContent: 'space-between', gap: '14px', marginBottom: '4px'}}>
                                     <span style={{color: '#818cf8'}}>{t('portfolio.ilpTooltipNet')}</span>
                                    <span style={{color: '#818cf8', fontWeight: 700, fontFamily: 'monospace'}}>{fmtMoney(ilp, 1, data.base_currency || 'USD')}</span>
                                  </div>}
                                  {drag != null && <div style={{marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed rgba(255,255,255,0.1)', color: 'rgba(255,160,60,0.9)', fontSize: '0.72rem'}}>
                                     {t('portfolio.ilpTooltipDrag')}：{drag}%
                                  </div>}
                                </div>
                              );
                            }}
                          />
                          <Legend formatter={v => <span style={{fontSize: '0.73rem', color: 'rgba(255,255,255,0.65)'}}>{v}</span>} />
                           <Area type="monotone" dataKey="raw_value" stroke="#10b981" strokeWidth={2} name={t('portfolio.ilpTooltipRaw')}
                             fill="url(#rawColor)" dot={false} />
                          <Area type="monotone" dataKey="ilp_value" stroke="#818cf8" strokeWidth={2.5}
                             strokeDasharray="4 3" fill="url(#ilpColor)" dot={false} name={t('portfolio.ilpTooltipNet')} />
                        </ComposedChart>
                      ) : (
                        <AreaChart data={historyData} margin={{top: 10, right: 10, left: 10, bottom: 0}}>
                          <defs>
                            <linearGradient id="navColor" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.5}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="date" stroke="rgba(255,255,255,0.1)" tick={{fill: '#9ca3af', fontSize: 11}}
                            tickFormatter={(val) => val ? String(val).substring(0, 7) : ''} minTickGap={40} />
                          <YAxis
                            domain={([dataMin, dataMax]) => {
                              if (isNaN(dataMin) || isNaN(dataMax)) return [0, 1000];
                              if (dataMin === dataMax) {
                                if (dataMin === 0) return [0, 1000];
                                const padding = Math.abs(dataMin * 0.1);
                                return [dataMin - padding, dataMax + padding];
                              }
                              return [dataMin, dataMax];
                            }}
                            stroke="rgba(255,255,255,0.1)" tick={{fill: '#9ca3af', fontSize: 11}}
                            tickFormatter={(val) => fmtAxis(Number(val), 1, data.base_currency || 'USD')} width={60}
                          />
                          <Tooltip
                            contentStyle={{backgroundColor: '#1e1e2f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'}}
                            itemStyle={{color: '#10b981', fontWeight: 'bold'}}
                            formatter={(value) => [fmtMoney(Number(value), 1, data.base_currency || 'USD'), '资产市值']}
                            labelStyle={{color: '#9ca3af', marginBottom: '8px'}}
                          />
                          <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={3}
                            fill="url(#navColor)" animationDuration={1500} />
                        </AreaChart>
                      )}
                    </ResponsiveContainer>
                  ) : (
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'gray', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px'}}>
                      {t('portfolio.buildingTimeSeries')}
                    </div>
                  )}
                </div>

                {/* ILP 对比摘要条 */}
                {applyIlpToChart && ilpSummary && (
                  <div style={{
                    marginTop: '16px', padding: '14px 16px', borderRadius: '10px',
                    background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)',
                  }}>
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '10px'}}>
                      {[
                        { label: '🎁 开户奖赏（期初计入）', val: `+${fmtMoney(ilpSummary.enrollmentBonus, 1, ccy)}`, color: '#f59e0b', sub: 'ILP曲线期初高于原始曲线' },
                        { label: '当前原始市值', val: fmtMoney(ilpSummary.rawFinal, 1, ccy), color: '#10b981' },
                        { label: '当前 ILP 净值', val: fmtMoney(ilpSummary.ilpFinal, 1, ccy), color: '#818cf8' },
                        { label: '历史年化（原始）', val: `${ilpSummary.rawCagr.toFixed(2)}%`, color: '#60a5fa' },
                        { label: '历史年化（ILP）', val: `${ilpSummary.ilpCagr.toFixed(2)}%`, color: '#a78bfa' },
                        { label: 'ILP 净值拖累', val: `${ilpSummary.drag >= 0 ? '-' : '+'}${Math.abs(ilpSummary.drag).toFixed(2)}%`, color: ilpSummary.drag >= 0 ? '#fca5a5' : '#34d399' },
                      ].map((c, i) => (
                        <div key={i}>
                          <div style={{fontSize: '0.67rem', color: 'rgba(255,255,255,0.4)', marginBottom: '4px'}}>{c.label}</div>
                          <div style={{fontSize: '0.9rem', fontWeight: 700, color: c.color}}>{c.val}</div>
                          {c.sub && <div style={{fontSize: '0.6rem', color: 'rgba(255,255,255,0.28)', marginTop: '2px'}}>{c.sub}</div>}
                        </div>
                      ))}
                    </div>
                    <div style={{fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px', lineHeight: 1.5}}>
                      📌 ILP 曲线期初值 = 组合初始投入 + 开户奖赏（以基金单位计入）· 之后逐月扣减前期费 / 户口价值费 / COI（账户价值 ≥ 保额后 COI = 0）· 第6年起享有长期客户奖赏
                    </div>
                  </div>
                )}
              </section>


              <section className="stats-grid">
                <div className="glass-card" title={fmtMoney(data.total_market_value || data.total_nav, 1, data.base_currency || 'USD')}>
                  <div className="stat-label">{t('portfolio.statMarketValue')} <span style={{fontSize:'0.7rem', color:'#818cf8', marginLeft:'4px'}}>{data.base_currency || 'USD'}</span></div>
                  <div className="stat-value">{fmtCompact(data.total_market_value || data.total_nav, 1, data.base_currency || 'USD')}</div>
                  <div className="positive"><TrendingUp size={16} /> {t('portfolio.statMarketValueSub')}</div>
                </div>
                <div className="glass-card">
                  <div className="stat-label">{t('portfolio.sectorExposure')}</div>
                  <div className="stat-value" style={{color: '#818cf8'}}>{data.cumulative_roi}%</div>
                  <div className="positive"><TrendingUp size={16} /> Growth</div>
                </div>
                <div className="glass-card" title={fmtMoney(data.total_divs || 0, 1, data.base_currency || 'USD')}>
                  <div className="stat-label">Total Dividends <span style={{fontSize:'0.7rem', color:'#818cf8', marginLeft:'4px'}}>{data.base_currency || 'USD'}</span></div>
                  <div className="stat-value" style={{color: '#fbbf24'}}>{fmtCompact(data.total_divs || 0, 1, data.base_currency || 'USD')}</div>
                  <div className="positive"><DollarSign size={16} /> Passive Income</div>
                </div>
                <div className="glass-card">
                  <div className="stat-label">Annualized Return</div>
                  <div className="stat-value" style={{color: '#10b981'}}>{data.annualized_return}%</div>
                  <div className="positive"><TrendingUp size={16} /> CAGR</div>
                </div>
              </section>

              {/* Ghostfolio Prototyping: Intelligence Widgets */}
              <section style={{display: 'flex', gap: '20px', marginBottom: '40px', marginTop: '40px'}}>
                <div className="glass-card" style={{flex: 1}}>
                  <div className="stat-label" style={{marginBottom: '20px'}}>Sector Exposure</div>
                  <div style={{height: '250px'}}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={sectorData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {sectorData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(val, name, props) => [
                            `${props.payload.pct.toFixed(1)}% ($${val.toLocaleString()})`,
                            name
                          ]}
                          contentStyle={{
                            backgroundColor: '#1e1e2f',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '10px',
                            fontSize: '0.8rem',
                            color: '#fff'
                          }}
                          itemStyle={{ color: '#fff' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '10px'}}>
                    {sectorData.map((entry, index) => (
                      <div key={index} style={{fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px'}}>
                        <div style={{width: 10, height: 10, borderRadius: '50%', background: COLORS[index % COLORS.length]}}></div>
                        <span>{entry.name}</span>
                        <span style={{color: 'rgba(255,255,255,0.5)'}}>{entry.pct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="glass-card" style={{flex: 1}}>
                  <div className="stat-label" style={{marginBottom: '20px'}}>{t('portfolio.top10Holdings')}</div>
                  <div style={{height: '250px'}}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={top10Data}
                        layout="vertical"
                        margin={{top: 0, right: 50, left: 0, bottom: 0}}
                      >
                        <XAxis
                          type="number"
                          hide
                          domain={[0, 'dataMax']}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={140}
                          tick={{fill: '#9ca3af', fontSize: 10}}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          cursor={{fill: 'rgba(255,255,255,0.04)'}}
                          contentStyle={{
                            backgroundColor: '#1e1e2f',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '10px',
                            fontSize: '0.8rem',
                            color: '#fff'
                          }}
                          itemStyle={{ color: '#fff' }}
                          formatter={(val, name, props) => [
                            `${props.payload.pct.toFixed(1)}%  (${fmtMoney(val, 1, ccy)})`,
                            props.payload.fullName
                          ]}
                          labelFormatter={() => ''}
                        />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={14}>
                          {top10Data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px'}}>
                    {top10Data.map((entry, index) => (
                      <div key={index} style={{fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '5px'}}>
                        <div style={{width: 8, height: 8, borderRadius: '2px', background: COLORS[index % COLORS.length], flexShrink: 0}}></div>
                        <span style={{color: 'rgba(255,255,255,0.7)'}}>{entry.name}</span>
                        <span style={{color: 'rgba(255,255,255,0.4)'}}>{entry.pct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="glass-card">
                <div className="stat-label" style={{marginBottom: '20px'}}>Asset Holdings ({portfolios.find(p => p.id === activeId)?.dividend_strategy} mode)</div>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>ASSET / ISIN</th>
                        <th>ALLOCATION (%)</th>
                        <th>SHARES</th>
                        <th>AVG COST</th>
                        <th>PRICE</th>
                        <th>VALUE</th>
                        <th>DIVIDENDS</th>
                        <th>PNL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.details.map((asset, i) => (
                        <tr key={asset.isin} style={asset.isin.startsWith('CASH_') ? {background: 'rgba(99,102,241,0.1)'} : {}}>
                          <td>
                            <div style={{display: 'flex', flexDirection: 'column'}}>
                              <span style={{color: asset.isin.startsWith('CASH_') ? '#818cf8' : COLORS[i % COLORS.length], fontWeight: 600}}>{asset.name}</span>
                              <span className="isin-badge">{asset.isin}</span>
                            </div>
                          </td>
                          <td style={{fontWeight: 600, color: '#818cf8'}}>
                            {(asset.market_value / data.total_nav * 100).toFixed(1)}%
                          </td>
                          <td>{asset.isin.startsWith('CASH_') ? asset.shares.toLocaleString() : Math.floor(asset.shares)}</td>
                          <td>{asset.total_cost ? fmtMoney(asset.total_cost / (asset.isin.startsWith('CASH_') ? 1 : asset.shares), 1, data.base_currency || 'USD') : '-'}</td>
                          <td>{fmtMoney(asset.price, 1, data.base_currency || 'USD')}</td>
                          <td>{fmtMoney(asset.market_value, 1, data.base_currency || 'USD')}</td>
                          <td>{fmtMoney(asset.dividends, 1, data.base_currency || 'USD')}</td>
                          <td className={asset.yield >= 0 ? 'positive' : 'negative'}>
                            {asset.yield.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <div className="dividend-analytics">
              {/* Toolbar */}
              <div style={{display: 'flex', gap: '20px', marginBottom: '20px', alignItems: 'center'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <label style={{fontSize: '0.85rem', color: '#9ca3af'}}>{t('portfolio.withholdingTax')}:</label>
                  <select 
                    style={{background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '6px 12px', borderRadius: '8px', outline: 'none'}}
                    value={taxRate} 
                    onChange={e => setTaxRate(parseFloat(e.target.value))}
                  >
                    <option value={0.0}>Gross (0%)</option>
                    <option value={0.30}>US (30%)</option>
                    <option value={0.20}>China (20%)</option>
                    <option value={0.10}>China R (10%)</option>
                  </select>
                </div>
                
                <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <label style={{fontSize: '0.85rem', color: '#9ca3af'}}>{t('portfolio.dripSimulation')}:</label>
                  <label className="switch">
                    <input type="checkbox" checked={dripMode} onChange={e => setDripMode(e.target.checked)} />
                    <span className="slider round"></span>
                  </label>
                </div>
              </div>

              {divLoading ? (
                <div style={{textAlign: 'center', padding: '100px'}}><h2>{t('portfolio.calcProjections')}</h2></div>
              ) : divProjData && (divProjData.portfolio_metrics?.total_annual_income > 0 || divProjData.assets?.some(a => a.est_annual_income > 0 || a.source === 'manual_extrapolation')) ? (
                <>
                  {/* Dividend Summary Cards */}
                  <section className="stats-grid" style={{marginBottom: '40px'}}>
                    <div className="glass-card" title={fmtMoney(divProjData?.portfolio_metrics?.total_annual_income || 0, 1, data?.base_currency || 'USD')}>
                      <div className="stat-label">{t('portfolio.estAnnualIncome')} <span style={{fontSize:'0.7rem', color:'#818cf8', marginLeft:'4px'}}>{data?.base_currency || 'USD'}</span></div>
                      <div className="stat-value" style={{color: '#10b981'}}>{fmtCompact(divProjData?.portfolio_metrics?.total_annual_income || 0, 1, data?.base_currency || 'USD')}</div>
                      <div className="positive"><DollarSign size={16} /> {t('portfolio.projected12m')}</div>
                    </div>
                    <div className="glass-card">
                      <div className="stat-label">{t('portfolio.portfolioYoc')}</div>
                      <div className="stat-value" style={{color: '#818cf8'}}>{divProjData?.portfolio_metrics?.portfolio_yoc || '0'}%</div>
                      <div className="positive"><ArrowUpRight size={16} /> {t('portfolio.yieldOnCost')}</div>
                    </div>
                    <div className="glass-card">
                      <div className="stat-label">{t('portfolio.currentYield')}</div>
                      <div className="stat-value" style={{color: '#f59e0b'}}>{divProjData?.portfolio_metrics?.portfolio_current_yield || '0'}%</div>
                      <div className="positive"><Activity size={16} /> {t('portfolio.marketPricing')}</div>
                    </div>
                  </section>

                  {/* Projection Chart */}
                  <section className="glass-card" style={{marginBottom: '40px', padding: '30px'}}>
                    {/* ── Historical Dividend Section ──────────────────────────── */}
                    {divProjData.historical_dividends && (
                      <div style={{marginBottom: '32px'}}>
                        <div className="stat-label" style={{fontSize: '1rem', color: '#fff', marginBottom: '20px'}}>
                          📊 Dividend History
                        </div>

                        {/* Past 12 months — monthly bar chart */}
                        {divProjData.historical_dividends.monthly?.length > 0 && (
                          <>
                            <div style={{fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', marginBottom: '10px', letterSpacing: '0.05em', textTransform: 'uppercase'}}>
                              Past 12 Months (by month)
                            </div>
                            <div style={{height: '200px', width: '100%', marginBottom: '24px'}}>
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={divProjData.historical_dividends.monthly}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                  <XAxis dataKey="month" stroke="rgba(255,255,255,0.15)" tick={{fill: '#9ca3af', fontSize: 10}} />
                                  <YAxis stroke="rgba(255,255,255,0.15)" tick={{fill: '#9ca3af', fontSize: 10}}
                                    tickFormatter={(val) => fmtAxis(Number(val), 1, data?.base_currency || 'USD')} />
                                  <Tooltip
                                    cursor={{fill: 'rgba(255,255,255,0.04)'}}
                                    contentStyle={{backgroundColor: '#1e1e2f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', fontSize: '0.82rem'}}
                                    formatter={(val) => [fmtMoney(Number(val), 1, data?.base_currency || 'USD'), 'Received']}
                                  />
                                  <Bar dataKey="amount" fill="#10b981" radius={[3, 3, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </>
                        )}

                        {/* Earlier years — annual summary cards */}
                        {divProjData.historical_dividends.annual?.length > 0 && (
                          <>
                            <div style={{fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', marginBottom: '10px', letterSpacing: '0.05em', textTransform: 'uppercase'}}>
                              Previous Calendar Years (Full Year Total)
                            </div>
                            <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '8px'}}>
                              {divProjData.historical_dividends.annual.map(yr => (
                                <div key={yr.year} style={{
                                  flex: '1', minWidth: '110px', maxWidth: '160px',
                                  padding: '12px 14px', borderRadius: '10px',
                                  background: 'rgba(255,255,255,0.03)',
                                  border: '1px solid rgba(255,255,255,0.07)'
                                }}>
                                  <div style={{fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginBottom: '6px'}}>{yr.year}</div>
                                  <div style={{fontSize: '1rem', fontWeight: 700, color: '#fbbf24'}}>
                                    {fmtMoney(yr.amount, 1, data?.base_currency || 'USD')}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        {/* Divider before projection */}
                        <div style={{borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '24px', marginBottom: '0'}} />
                      </div>
                    )}

                    {/* ── 12-Month Projection ──────────────────────────────────── */}
                    <div className="stat-label" style={{fontSize: '1.2rem', color: '#fff', marginBottom: '20px'}}>12-Month Expected Cash Flow</div>

                    <div style={{height: '300px', width: '100%'}}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={divProjData.chart_data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                          <XAxis 
                            dataKey="month" 
                            stroke="rgba(255,255,255,0.3)" 
                            tick={{fill: '#9ca3af', fontSize: 11}} 
                          />
                          <YAxis 
                            stroke="rgba(255,255,255,0.3)" 
                            tick={{fill: '#9ca3af', fontSize: 11}} 
                            tickFormatter={(val) => fmtAxis(Number(val), 1, data?.base_currency || 'USD')}
                          />
                          <Tooltip 
                            cursor={{fill: 'rgba(255,255,255,0.05)'}}
                            contentStyle={{backgroundColor: '#1e1e2f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px'}}
                            formatter={(val) => [fmtMoney(Number(val), 1, data?.base_currency || 'USD'), 'Expected Dividend']}
                          />
                          <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>

                  {/* Assets Table */}
                  <section className="glass-card">
                    <div className="stat-label" style={{marginBottom: '20px'}}>Asset Dividend breakdown</div>
                    <div className="table-container">
                      <table>
                        <thead>
                          <tr>
                            <th>ASSET / NAME</th>
                            <th>SHARES</th>
                            <th title="Yield on Cost: Based on your average purchase price">YIELD ON COST (YOC)</th>
                            <th title="Current Yield: Based on today's market price">CURRENT YIELD</th>
                            <th>EST. ANNUAL INCOME</th>
                            <th>NEXT DIVIDEND</th>
                          </tr>
                        </thead>
                        <tbody>
                          {divProjData.assets.map((asset, i) => (
                            <tr key={asset.isin}>
                              <td>
                                <div style={{display: 'flex', flexDirection: 'column'}}>
                                  <span style={{color: COLORS[i % COLORS.length], fontWeight: 600}}>{asset.name}</span>
                                  <span className="isin-badge">{asset.isin}</span>
                                </div>
                              </td>
                              <td>{Math.floor(asset.shares)}</td>
                              <td style={{fontWeight: 600, color: '#818cf8'}}>
                                {asset.yoc}%
                                {asset.source === 'manual_extrapolation' && (
                                  <span title={`Extrapolated from manual history. Frequency: ${asset.manual_freq}. Assumed growth: ${asset.manual_growth_pct ?? 0}% per period.`}
                                    style={{marginLeft: '6px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', cursor: 'help', whiteSpace: 'nowrap'}}
                                  >★ Manual Est.</span>
                                )}
                              </td>
                              <td style={{fontWeight: 600, color: '#f59e0b'}}>{asset.current_yield}%</td>
                              <td>{fmtMoney(asset.est_annual_income, 1, data?.base_currency || 'USD')}</td>
                              <td>
                                {asset.next_date ? (
                                  <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                                    <span style={{color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', width: 'fit-content'}}>
                                      {asset.next_date}
                                    </span>
                                    {getDaysUntil(asset.next_date) !== null && getDaysUntil(asset.next_date) >= 0 && (
                                      <span style={{color: '#f59e0b', fontSize: '0.75rem', fontWeight: 600}}>
                                        🗓️ Ex-div in {getDaysUntil(asset.next_date)} days
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span style={{color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem'}}>TBD / TTM Shifted</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Footnote if any asset uses manual extrapolation */}
                    {divProjData.assets?.some(a => a.source === 'manual_extrapolation') && (
                      <div style={{
                        marginTop: '16px', padding: '12px 16px',
                        background: 'rgba(245,158,11,0.08)', borderLeft: '3px solid #f59e0b',
                        borderRadius: '0 8px 8px 0', fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)',
                        lineHeight: 1.6
                      }}>
                        <span style={{color: '#f59e0b', fontWeight: 600}}>★ Manual Extrapolation</span>
                        {' — Assets marked with ★ have no automatic dividend feed (e.g. LU-ISIN funds). '}
                        Projected payouts are extrapolated from your manually recorded dividends based on detected payment frequency and historical growth rate.
                        <br/>
                        {divProjData.assets
                          .filter(a => a.source === 'manual_extrapolation')
                          .map(a => (
                            <span key={a.isin} style={{display: 'inline-block', marginTop: '4px', marginRight: '12px'}}>
                              <strong style={{color: '#f59e0b'}}>{a.name}</strong>:
                              {' '}{a.manual_freq} payments,
                              {' '}{a.manual_growth_pct !== null ? `${a.manual_growth_pct > 0 ? '+' : ''}${a.manual_growth_pct}% growth/period assumed` : 'flat rate assumed'}
                            </span>
                          ))
                        }
                      </div>
                    )}
                  </section>
                </>
              ) : (
                <div style={{
                  textAlign: 'center', padding: '80px 40px',
                  background: 'rgba(255,255,255,0.02)', borderRadius: '16px',
                  border: '1px dashed rgba(255,255,255,0.1)'
                }}>
                  <div style={{fontSize: '2.5rem', marginBottom: '16px'}}>📭</div>
                   <h3 style={{color: '#9ca3af', marginBottom: '8px'}}>{t('portfolio.noDivTitle')}</h3>
                  <p style={{color: 'rgba(255,255,255,0.3)', maxWidth: '480px', margin: '0 auto 20px', fontSize: '0.9rem', lineHeight: 1.6}}>
                    This portfolio's holdings (e.g. LU-ISIN funds) are not covered by the automatic dividend data source (yfinance).
                    {canEdit && <><br/>You can manually record dividends using the <strong style={{color: '#818cf8'}}>Dividends → Add Dividend</strong> button above.</>}
                  </p>
                  {canEdit && (
                    <button
                      onClick={() => setShowDivModal(true)}
                      style={{background: 'linear-gradient(135deg, #6366f1, #a855f7)', border: 'none', borderRadius: '8px', padding: '10px 24px', color: '#fff', cursor: 'pointer', fontWeight: 600}}
                    >
                      {t('portfolio.addManualDiv')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
    </div>
  );
};

export default PortfolioView;
