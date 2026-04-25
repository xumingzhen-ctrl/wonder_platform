import React, { useMemo, useState } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Area,
} from 'recharts';
import { applyILPToMCChart, getEnrollmentBonusRate } from '../utils/ilpImpactUtils';

// ════════════════════════════════════════════════════════════════════════
//  ILPImpactPanel v2
//  展示 ILP 费用对组合的月度影响（修正账户价值基准、COI归零逻辑）
// ════════════════════════════════════════════════════════════════════════

const fmtAmt = v => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return (v < 0 ? '-' : '') + '$' + (abs / 1_000_000).toFixed(2) + 'M';
  if (abs >= 1_000)     return (v < 0 ? '-' : '') + '$' + (abs / 1_000).toFixed(1) + 'k';
  return (v < 0 ? '-' : '') + '$' + Math.round(abs).toLocaleString();
};
const fmt = v => '$' + Math.round(Math.abs(v)).toLocaleString();

const CUSTOM_TOOLTIP_STYLE = {
  background: 'rgba(13,18,35,0.97)',
  border: '1px solid rgba(99,102,241,0.3)',
  borderRadius: '10px',
  padding: '12px 16px',
  fontSize: '0.8rem',
  minWidth: '240px',
  color: '#f1f5f9',
};

export default function ILPImpactPanel({ mcChart, ilpConfig, labMcSettings }) {
  const [view, setView] = useState('chart');

  const processed = useMemo(() => {
    if (!mcChart || !ilpConfig || !(ilpConfig.totalPremium > 0)) return null;
    return applyILPToMCChart(mcChart, ilpConfig);
  }, [mcChart, ilpConfig]);

  if (!processed) return null;

  const { chart: ilpChart, annualBreakdown, enrollmentBonus, effectivePrincipal } = processed;
  const years = parseInt(labMcSettings?.years) || 20;
  const totalPremium = ilpConfig.totalPremium || 0;
  const sumAssured = totalPremium * 1.05;

  const last = ilpChart[ilpChart.length - 1] || {};
  const totalFees  = annualBreakdown.reduce((s, r) => s + r.netFee, 0);
  const grossFinal = last.ilp_gross_p50 || 0;
  const netFinal   = last.ilp_net_p50  || 0;
  const dragAmt    = grossFinal - netFinal;
  const dragPct    = grossFinal > 0 ? (dragAmt / grossFinal) * 100 : 0;

  // ── 前5年奖赏抵扣分析 ────────────────────────────────────────────────
  // 奖赏以单位方式进入，随基金增值
  // 奖赏在第N年末的价值 = enrollmentBonus × growthFactor[N]
  const mc0 = ilpChart[0]?.ilp_gross_p50 || effectivePrincipal;
  const early5 = annualBreakdown.filter(r => r.year <= 5);
  const fees5yr = early5.reduce((s, r) => s + r.netFee, 0);     // 前5年累计净费用
  // 奖赏在第5年末的价值（按P50增长率）
  const yr5entry = ilpChart.find(d => d.year === 5) || ilpChart[Math.min(5, ilpChart.length - 1)];
  const growthFactor5 = yr5entry?.ilp_gross_p50 && effectivePrincipal > 0
    ? yr5entry.ilp_gross_p50 / effectivePrincipal
    : 1;
  const bonusValueAt5 = enrollmentBonus * growthFactor5;         // 奖赏5年末价值
  const bonusOffsetRatio = fees5yr > 0 ? bonusValueAt5 / fees5yr : 0; // 奖赏抵扣率
  const netCostAfterBonus5 = Math.max(0, fees5yr - bonusValueAt5); // 5年净成本（费用-奖赏价值）
  // 每年奖赏增值（用于表格）
  const bonusValueByYear = {};
  annualBreakdown.forEach(r => {
    const yrEntry = ilpChart.find(d => d.year === r.year);
    const gf = yrEntry?.ilp_gross_p50 && effectivePrincipal > 0
      ? yrEntry.ilp_gross_p50 / effectivePrincipal : 1;
    bonusValueByYear[r.year] = enrollmentBonus * gf;
  });
  // 前5年每年「奖赏增值 vs 年费」覆盖率
  // 覆盖率 = 当年奖赏增值额 / 当年净费用（用奖赏增量对比，而非累计）
  const bonusGrowthByYear = {};
  annualBreakdown.forEach((r, i) => {
    const prevBonusVal = i === 0 ? enrollmentBonus : bonusValueByYear[r.year - 1] ?? enrollmentBonus;
    bonusGrowthByYear[r.year] = (bonusValueByYear[r.year] ?? enrollmentBonus) - prevBonusVal;
  });


  const tabBtn = (active) => ({
    padding: '6px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem',
    fontWeight: active ? 700 : 400, transition: 'all 0.2s',
    border: `1px solid ${active ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}`,
    background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
    color: active ? '#818cf8' : 'rgba(255,255,255,0.5)',
  });

  const summaryCards = [
    { icon: '🎁', label: '开户奖赏（单位方式进入）', val: `+${fmt(enrollmentBonus)}`, color: '#f59e0b' },
    { icon: '📊', label: '有效初始账户价值', val: fmtAmt(effectivePrincipal), color: '#60a5fa',
      sub: `保费 ${fmtAmt(totalPremium)} + 奖赏 ${fmtAmt(enrollmentBonus)}` },
    { icon: '🛡️', label: '身故保障额（SA）', val: fmtAmt(sumAssured), color: '#34d399',
      sub: '已缴保费 × 105%（AV > SA 后 COI = 0）' },
    { icon: '📈', label: `${years}年理论账户价值（P50）`, val: fmtAmt(grossFinal), color: '#3b82f6' },
    { icon: '🔗', label: `${years}年净账户价值（含ILP费）`, val: fmtAmt(netFinal), color: '#818cf8' },
    { icon: '💸', label: `${years}年累计净费用`, val: `-${fmtAmt(totalFees)}`, color: '#f43f5e',
      sub: `拖累率 ${dragPct.toFixed(1)}%` },
  ];

  return (
    <div style={{
      marginTop: '24px',
      background: 'rgba(99,102,241,0.04)',
      border: '1px solid rgba(99,102,241,0.2)',
      borderRadius: '14px',
      padding: '20px 22px',
    }}>
      {/* 标题栏 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#818cf8', fontWeight: 700 }}>
            🔗 ILP 投连险费用影响分析
          </h4>
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.38)', marginTop: '3px' }}>
            账户价值基于实际保费 × MC 增长率 · 逐月扣减前期费/户口价值费/COI · 奖赏以基金单位计入
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button style={tabBtn(view === 'chart')} onClick={() => setView('chart')}>📈 对比图</button>
          <button style={tabBtn(view === 'table')} onClick={() => setView('table')}>📋 年度费用</button>
        </div>
      </div>

      {/* 摘要卡 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '18px' }}>
        {summaryCards.map((c, i) => (
          <div key={i} style={{
            background: 'rgba(255,255,255,0.03)', borderRadius: '10px',
            padding: '11px 14px', border: '1px solid rgba(255,255,255,0.07)',
          }}>
            <div style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.4)', marginBottom: '5px' }}>{c.icon} {c.label}</div>
            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: c.color }}>{c.val}</div>
            {c.sub && <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', marginTop: '3px' }}>{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* ══ 前5年奖赏抵扣分析 ══ */}
      <div style={{
        marginBottom: '18px',
        padding: '16px 18px',
        borderRadius: '12px',
        background: 'linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(99,102,241,0.06) 100%)',
        border: '1px solid rgba(245,158,11,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <span style={{ fontSize: '1rem' }}>🎁</span>
          <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#fbbf24' }}>前5年：开户奖赏抵扣分析</span>
          <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', marginLeft: '4px' }}>
            奖赏以基金单位增值，用第5年末价值对比累计费用
          </span>
        </div>

        {/* 三列数据 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
          {[
            {
              label: '前5年累计净费用', val: `-${fmtAmt(fees5yr)}`,
              sub: '前期费 + 户口价值费 + COI',
              color: '#f43f5e',
            },
            {
              label: `开户奖赏（第5年末增值后）`, val: `+${fmtAmt(bonusValueAt5)}`,
              sub: `奖赏 ${fmtAmt(enrollmentBonus)} × ${growthFactor5.toFixed(3)}（5年增长率）`,
              color: '#f59e0b',
            },
            {
              label: '奖赏抵扣后 5年净成本',
              val: netCostAfterBonus5 < 0.01 ? '✓ 完全覆盖' : `-${fmtAmt(netCostAfterBonus5)}`,
              sub: `奖赏抵扣率 ${(bonusOffsetRatio * 100).toFixed(1)}%`,
              color: bonusOffsetRatio >= 1 ? '#10b981' : bonusOffsetRatio >= 0.7 ? '#f59e0b' : '#f43f5e',
            },
          ].map((c, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.03)', borderRadius: '9px',
              padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.42)', marginBottom: '6px' }}>{c.label}</div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: c.color }}>{c.val}</div>
              <div style={{ fontSize: '0.61rem', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* 进度条：奖赏抵扣率可视化 */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)', marginBottom: '5px' }}>
            <span>奖赏抵扣率（第5年末奖赏价值 / 前5年总费用）</span>
            <span style={{ fontWeight: 700, color: bonusOffsetRatio >= 1 ? '#10b981' : '#f59e0b' }}>
              {(bonusOffsetRatio * 100).toFixed(1)}%
            </span>
          </div>
          <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, bonusOffsetRatio * 100).toFixed(1)}%`,
              borderRadius: '4px',
              background: bonusOffsetRatio >= 1
                ? 'linear-gradient(90deg, #10b981, #34d399)'
                : bonusOffsetRatio >= 0.7
                  ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                  : 'linear-gradient(90deg, #ef4444, #f97316)',
              transition: 'width 0.8s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)', marginTop: '4px' }}>
            <span>0%</span>
            <span style={{ color: 'rgba(245,158,11,0.5)' }}>70%（参考线）</span>
            <span style={{ color: 'rgba(16,185,129,0.5)' }}>100%（完全覆盖）</span>
          </div>
        </div>

        {/* 结论文字 */}
        <div style={{
          marginTop: '12px', padding: '10px 12px',
          borderRadius: '7px', fontSize: '0.75rem', lineHeight: 1.6,
          background: bonusOffsetRatio >= 1 ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.07)',
          border: `1px solid ${bonusOffsetRatio >= 1 ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.15)'}`,
          color: 'rgba(255,255,255,0.7)',
        }}>
          {bonusOffsetRatio >= 1 ? (
            <>✅ <strong style={{ color: '#34d399' }}>开户奖赏已完全覆盖前5年费用</strong>。
              奖赏增值后为 {fmtAmt(bonusValueAt5)}，超出费用 {fmtAmt(bonusValueAt5 - fees5yr)}，
              投资人在前5年享受保险保障的同时，<strong>净成本为零</strong>。
            </>
          ) : (
            <>📊 开户奖赏可抵扣前5年费用的 <strong style={{ color: '#fbbf24' }}>{(bonusOffsetRatio * 100).toFixed(1)}%</strong>。
              5年末奖赏增值为 {fmtAmt(bonusValueAt5)}，
              尚余 {fmtAmt(netCostAfterBonus5)} 为净费用成本
              （约为保费的 {totalPremium > 0 ? ((netCostAfterBonus5 / totalPremium) * 100).toFixed(2) : 0}%）。
            </>
          )}
        </div>
      </div>

      {/* 对比图 */}
      {view === 'chart' && (
        <>
          <div style={{ height: '380px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={ilpChart}>
                <defs>
                  <linearGradient id="grossGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01} />
                  </linearGradient>
                  <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#818cf8" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                <XAxis dataKey="year" stroke="rgba(255,255,255,0.3)" fontSize={11}
                  label={{ value: '年', position: 'insideBottomRight', fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} />
                <YAxis stroke="rgba(255,255,255,0.3)" fontSize={11}
                  tickFormatter={v => fmtAmt(v)} width={80} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload || {};
                    const coi0 = annualBreakdown.find(r => r.year === label)?.coiZeroMonths || 0;
                    return (
                      <div style={CUSTOM_TOOLTIP_STYLE}>
                        <div style={{ fontWeight: 800, color: '#818cf8', marginBottom: '10px' }}>第 {label} 年</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          {[
                            { k: 'ilp_gross_p90', label: '理论账户 P90（乐观）', color: '#10b981' },
                            { k: 'ilp_gross_p50', label: '理论账户 P50（中性）', color: '#3b82f6' },
                            { k: 'ilp_gross_p10', label: '理论账户 P10（悲观）', color: '#f43f5e' },
                            { k: 'ilp_net_p90',   label: 'ILP净值 P90',  color: '#34d399', dash: true },
                            { k: 'ilp_net_p50',   label: 'ILP净值 P50',  color: '#818cf8', dash: true },
                            { k: 'ilp_net_p10',   label: 'ILP净值 P10',  color: '#fb7185', dash: true },
                          ].map(row => d[row.k] != null && (
                            <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', gap: '14px' }}>
                              <span style={{ color: row.color, opacity: row.dash ? 0.8 : 1, fontSize: '0.75rem' }}>
                                {row.dash ? '‥ ' : ''}{row.label}
                              </span>
                              <span style={{ fontWeight: 700, color: row.color, fontFamily: 'monospace' }}>
                                {fmtAmt(d[row.k])}
                              </span>
                            </div>
                          ))}
                          {d.ilp_net_fee != null && label > 0 && (
                            <>
                              <div style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', marginTop: '6px', paddingTop: '6px' }} />
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px' }}>
                                <span style={{ color: '#fca5a5', fontSize: '0.75rem' }}>本年 ILP 净费用</span>
                                <span style={{ fontWeight: 700, color: '#fca5a5', fontFamily: 'monospace' }}>
                                  -{fmtAmt(d.ilp_net_fee)}
                                </span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px' }}>
                                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>费用拖累率</span>
                                <span style={{ fontWeight: 700, color: d.ilp_drag_pct > 5 ? '#ef4444' : '#f59e0b', fontFamily: 'monospace' }}>
                                  {d.ilp_drag_pct?.toFixed(2)}%
                                </span>
                              </div>
                              {coi0 > 0 && (
                                <div style={{ color: '#34d399', fontSize: '0.7rem', marginTop: '2px' }}>
                                  ✓ COI 为零 {coi0} 个月（账户价值 ≥ 保额）
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend formatter={v => <span style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.7)' }}>{v}</span>} />
                {/* 理论账户价值（实线，表示无费用假设）*/}
                <Area type="monotone" dataKey="ilp_gross_p50" stroke="#3b82f6" strokeWidth={2.5}
                  fill="url(#grossGrad)" dot={false} name="理论账户 P50（无费用）" />
                <Line type="monotone" dataKey="ilp_gross_p90" stroke="#10b981" strokeWidth={1.5}
                  strokeDasharray="6 3" dot={false} name="理论账户 P90" />
                <Line type="monotone" dataKey="ilp_gross_p10" stroke="#f43f5e" strokeWidth={1.5}
                  strokeDasharray="6 3" dot={false} name="理论账户 P10" />
                {/* ILP 净值曲线（虚线，表示实际扣费后）*/}
                <Area type="monotone" dataKey="ilp_net_p50" stroke="#818cf8" strokeWidth={2.5}
                  strokeDasharray="4 3" fill="url(#netGrad)" dot={false} name="ILP 净值 P50" />
                <Line type="monotone" dataKey="ilp_net_p90" stroke="#34d399" strokeWidth={1.5}
                  strokeDasharray="3 3" dot={false} name="ILP 净值 P90" />
                <Line type="monotone" dataKey="ilp_net_p10" stroke="#fb7185" strokeWidth={1.5}
                  strokeDasharray="3 3" dot={false} name="ILP 净值 P10" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div style={{ textAlign: 'center', fontSize: '0.68rem', color: 'rgba(255,255,255,0.28)', marginTop: '8px' }}>
            实色区域 = 理论账户价值（未扣费） &nbsp;·&nbsp; 虚色区域 = ILP 净值（已扣月度净费用）
          </div>
        </>
      )}

      {/* 年度费用明细表 */}
      {view === 'table' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.79rem' }}>
            <colgroup>
              <col style={{ width: '70px' }} />
              <col /><col /><col /><col /><col /><col />
              <col style={{ width: '80px' }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                {['年', '理论账户值(P50)', '前期费', '户口价值费', '保险费(COI)', '长期客户奖赏', '年净费用', '奖赏增值', '奖赏覆盖率', '费用率'].map((h, i) => (
                  <th key={h} style={{
                    padding: '8px 10px', color: 'rgba(255,255,255,0.5)', fontWeight: 600,
                    fontSize: '0.71rem', whiteSpace: 'nowrap',
                    textAlign: i === 0 ? 'left' : 'right',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {annualBreakdown.map((row, i) => {
                const inEarlyPhase = row.year <= 5;
                const inLoyaltyPhase = row.year >= 6;
                const dragPctRow = row.ilp_drag_pct ?? (row.grossAV_p50 > 0 ? (row.netFee / row.grossAV_p50) * 100 : 0);
                return (
                  <tr key={row.year} style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                  }}>
                    {/* 年 */}
                    <td style={{ padding: '8px 10px', color: '#f1f5f9', fontWeight: 700 }}>
                      Year {row.year}
                      {row.year === 1 && row.enrollmentBonus > 0 && (
                        <div style={{ fontSize: '0.62rem', color: '#f59e0b', marginTop: '2px' }}>
                          🎁 +{fmt(row.enrollmentBonus)}
                        </div>
                      )}
                    </td>
                    {/* 理论账户值 P50 */}
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#60a5fa', fontWeight: 600 }}>
                      {fmtAmt(row.grossAV_p50)}
                      {row.coiZeroMonths > 0 && (
                        <div style={{ fontSize: '0.6rem', color: '#34d399' }}>COI=0 × {row.coiZeroMonths}月</div>
                      )}
                    </td>
                    {/* 前期费 */}
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: inEarlyPhase ? '#fca5a5' : 'rgba(255,255,255,0.25)' }}>
                      {inEarlyPhase ? `-${fmtAmt(row.initialCharge)}` : '—'}
                    </td>
                    {/* 户口价值费 */}
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#fca5a5' }}>
                      -{fmtAmt(row.accountCharge)}
                    </td>
                    {/* COI */}
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: row.coi > 0 ? '#fb923c' : 'rgba(255,255,255,0.25)' }}>
                      {row.coi > 0 ? `-${fmtAmt(row.coi)}` : '—'}
                    </td>
                    {/* 长期客户奖赏 */}
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: inLoyaltyPhase && row.loyaltyBonus > 0 ? '#34d399' : 'rgba(255,255,255,0.25)' }}>
                      {inLoyaltyPhase && row.loyaltyBonus > 0 ? `+${fmtAmt(row.loyaltyBonus)}` : '—'}
                    </td>
                    {/* 年净费用 */}
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700,
                      color: row.netFee > 0 ? '#f43f5e' : '#10b981' }}>
                      {row.netFee > 0 ? `-${fmtAmt(row.netFee)}` : `+${fmtAmt(-row.netFee)}`}
                    </td>
                    {/* 奖赏增值（前5年专项列）*/}
                    {(() => {
                      const bv = bonusValueByYear[row.year] ?? enrollmentBonus;
                      const bg = bonusGrowthByYear[row.year] ?? 0;
                      const coverPct = row.netFee > 0 ? (bv / fees5yr) * 100 : 0;
                      return (
                        <>
                          <td style={{ padding: '8px 10px', textAlign: 'right',
                            color: inEarlyPhase ? '#fbbf24' : 'rgba(255,255,255,0.2)' }}>
                            {inEarlyPhase ? (
                              <>
                                <span style={{ fontWeight: 600 }}>{fmtAmt(bv)}</span>
                                {bg > 0 && <div style={{ fontSize: '0.6rem', color: 'rgba(245,158,11,0.6)' }}>+{fmtAmt(bg)} 增值</div>}
                              </>
                            ) : '—'}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right',
                            color: inEarlyPhase ? (coverPct >= 100 ? '#10b981' : '#f59e0b') : 'rgba(255,255,255,0.2)' }}>
                            {inEarlyPhase ? `${coverPct.toFixed(1)}%` : '—'}
                          </td>
                        </>
                      );
                    })()}
                    {/* 费用率 */}
                    <td style={{ padding: '8px 10px', textAlign: 'right',
                      color: dragPctRow > 5 ? '#ef4444' : dragPctRow > 2 ? '#f59e0b' : '#94a3b8' }}>
                      {dragPctRow.toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '1px solid rgba(255,255,255,0.15)', background: 'rgba(99,102,241,0.06)' }}>
                <td style={{ padding: '10px', fontWeight: 700, color: '#818cf8' }}>合计</td>
                <td style={{ padding: '10px', textAlign: 'right', color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem' }}>—</td>
                <td style={{ padding: '10px', textAlign: 'right', color: '#fca5a5', fontWeight: 600 }}>
                  -{fmtAmt(annualBreakdown.reduce((s, r) => s + r.initialCharge, 0))}
                </td>
                <td style={{ padding: '10px', textAlign: 'right', color: '#fca5a5', fontWeight: 600 }}>
                  -{fmtAmt(annualBreakdown.reduce((s, r) => s + r.accountCharge, 0))}
                </td>
                <td style={{ padding: '10px', textAlign: 'right', color: '#fb923c', fontWeight: 600 }}>
                  -{fmtAmt(annualBreakdown.reduce((s, r) => s + r.coi, 0))}
                </td>
                <td style={{ padding: '10px', textAlign: 'right', color: '#34d399', fontWeight: 600 }}>
                  +{fmtAmt(annualBreakdown.reduce((s, r) => s + r.loyaltyBonus, 0))}
                </td>
                <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, color: '#f43f5e' }}>
                  -{fmtAmt(annualBreakdown.reduce((s, r) => s + r.netFee, 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
          <div style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.28)', marginTop: '10px', lineHeight: 1.6 }}>
            * 账户价值基于实际保费（{fmtAmt(effectivePrincipal)}）× MC 增长率计算，非 MC 模拟本金。
            COI = max(0, 身故赔偿 - 账户价值) × 年费率。COI=0 表示该月账户价值已超过保额，无保险成本。
          </div>
        </div>
      )}
    </div>
  );
}
