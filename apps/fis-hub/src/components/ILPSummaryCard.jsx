import React from 'react';

// ════════════════════════════════════════════════════════════════════════
//  ILP 保障与传承可视化卡片（通用组件，StrategyLab + PortfolioView 复用）
// ════════════════════════════════════════════════════════════════════════

const ILPSummaryCard = ({
  ilpConfig,
  currentCV,           // 当前户口价值（用于进度条）
  currentMonth,        // 当前模拟月份（用于状态展示）
  p50EstimateEnd,      // P50 终值估算（传承展示）
  compact = false,     // 紧凑模式（PortfolioView 用）
  onEditConfig,        // 点击"修改设定"
}) => {
  if (!ilpConfig || !ilpConfig.totalPremium) return null;

  const sumAssured = ilpConfig.totalPremium * 1.05;
  const cv = currentCV || 0;
  const coverRatio = sumAssured > 0 ? Math.min(cv / sumAssured * 100, 100) : 0;
  const excessProtection = Math.max(0, sumAssured - cv);
  const enrollBonus = ilpConfig.totalPremium * (ilpConfig.enrollmentRate || 0);
  const month = currentMonth || 0;
  const loyaltyProg = Math.min(month / 60 * 100, 100);

  const fmt = (v) => '$' + Math.round(v).toLocaleString();

  // ── 紧凑模式（PortfolioView）──────────────────────────────────
  if (compact) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(16,185,129,0.06))',
        border: '1px solid rgba(99,102,241,0.2)',
        borderRadius: '10px', padding: '16px', marginBottom: '16px'
      }}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
            <span style={{fontSize: '1.1rem'}}>🔗</span>
            <h4 style={{margin: 0, color: '#818cf8'}}>投连险（ILP）模式</h4>
          </div>
          {onEditConfig && (
            <button onClick={onEditConfig} style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
              color: '#818cf8', padding: '4px 12px', borderRadius: '4px',
              cursor: 'pointer', fontSize: '0.78rem'
            }}>⚙️ 修改设定</button>
          )}
        </div>

        {/* 受保人摘要行 */}
        <div style={{fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)', marginBottom: '10px'}}>
          受保人：{ilpConfig.age}岁 · {ilpConfig.gender === 'male' ? '男' : '女'}
          {ilpConfig.smoker ? ' · 吸烟者' : ' · 非吸烟者'}
          &nbsp;&nbsp;|&nbsp;&nbsp;整付保费：{fmt(ilpConfig.totalPremium)} {ilpConfig.currency || 'USD'}
          &nbsp;&nbsp;|&nbsp;&nbsp;身故赔偿：{fmt(sumAssured)}
        </div>

        {/* 双栏：费用状态 + 奖赏状态 */}
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px'}}>
          <div style={{
            background: 'rgba(244,63,94,0.05)', padding: '10px', borderRadius: '6px',
            border: '1px solid rgba(244,63,94,0.12)'
          }}>
            <div style={{fontSize: '0.75rem', color: '#f43f5e', fontWeight: 600, marginBottom: '6px'}}>费用状态</div>
            <div style={{fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)'}}>
              前期费（首5年）：{month < 60 ? '✅ 活跃' : '⬜ 已结束'}
            </div>
            <div style={{fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)'}}>
              户口价值费：✅ 活跃
            </div>
            <div style={{fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)'}}>
              保险费用：{ilpConfig.age + Math.floor(month / 12) < 80 ? '✅ 活跃' : '⬜ 已豁免'}
            </div>
          </div>

          <div style={{
            background: 'rgba(245,158,11,0.05)', padding: '10px', borderRadius: '6px',
            border: '1px solid rgba(245,158,11,0.12)'
          }}>
            <div style={{fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600, marginBottom: '6px'}}>奖赏状态</div>
            <div style={{fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)'}}>
              开户奖赏：{fmt(enrollBonus)} ✓ 已入账
            </div>
            <div style={{fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)'}}>
              长期奖赏：{month >= 60 ? '✅ 已启动' : `第${month}月（距60月）`}
            </div>
            {month < 60 && (
              <div style={{
                background: 'rgba(255,255,255,0.08)', borderRadius: '4px', height: '6px',
                marginTop: '6px', overflow: 'hidden'
              }}>
                <div style={{
                  background: '#f59e0b', height: '100%', width: `${loyaltyProg}%`,
                  borderRadius: '4px', transition: 'width 0.3s'
                }} />
              </div>
            )}
          </div>
        </div>

        {/* 保障 + 传承 */}
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
          <div style={{
            background: 'rgba(16,185,129,0.05)', padding: '10px', borderRadius: '6px',
            border: '1px solid rgba(16,185,129,0.12)'
          }}>
            <div style={{fontSize: '0.75rem', color: '#10b981', fontWeight: 600, marginBottom: '4px'}}>🛡 保障</div>
            <div style={{fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)'}}>
              CV：{fmt(cv)}&nbsp;&nbsp;保额：{fmt(sumAssured)}
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.08)', borderRadius: '4px', height: '8px',
              marginTop: '6px', overflow: 'hidden'
            }}>
              <div style={{
                background: cv >= sumAssured ? '#10b981' : '#818cf8',
                height: '100%', width: `${coverRatio}%`,
                borderRadius: '4px', transition: 'width 0.3s'
              }} />
            </div>
          </div>
          <div style={{
            background: 'rgba(99,102,241,0.05)', padding: '10px', borderRadius: '6px',
            border: '1px solid rgba(99,102,241,0.12)'
          }}>
            <div style={{fontSize: '0.75rem', color: '#818cf8', fontWeight: 600, marginBottom: '4px'}}>🏛 传承</div>
            <div style={{fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)'}}>
              ✓ 免遗产认证 · 直接赔付受益人
            </div>
            <div style={{fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)'}}>
              ✓ 不受债权人追索
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── 完整模式（StrategyLabView 图表下方）──────────────────────
  return (
    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '15px'}}>
      {/* 保障功能卡 */}
      <div style={{
        background: 'rgba(16, 185, 129, 0.06)',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        borderRadius: '10px', padding: '18px'
      }}>
        <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px'}}>
          <span style={{fontSize: '1.3rem'}}>🛡</span>
          <h4 style={{margin: 0, color: '#10b981'}}>保障功能</h4>
        </div>
        <div style={{fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', marginBottom: '8px'}}>
          身故赔偿：<span style={{color: '#10b981', fontWeight: 700}}>{fmt(sumAssured)}</span>
        </div>
        <div style={{fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', marginBottom: '8px'}}>
          当前 CV：{fmt(cv)}
        </div>
        {/* 进度条 */}
        <div style={{
          background: 'rgba(255,255,255,0.08)', borderRadius: '6px', height: '12px',
          marginBottom: '8px', overflow: 'hidden', position: 'relative'
        }}>
          <div style={{
            background: cv >= sumAssured
              ? 'linear-gradient(90deg, #10b981, #34d399)'
              : 'linear-gradient(90deg, #818cf8, #a78bfa)',
            height: '100%', width: `${coverRatio}%`,
            borderRadius: '6px', transition: 'width 0.3s'
          }} />
          <span style={{
            position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)',
            fontSize: '0.65rem', color: '#fff', fontWeight: 600
          }}>
            {coverRatio.toFixed(1)}%
          </span>
        </div>
        <div style={{fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)'}}>
          {cv >= sumAssured ? (
            <span style={{color: '#10b981'}}>✅ CV 已超越保额，保险费用 ≈ 0</span>
          ) : (
            <>超额保障：<span style={{color: '#f59e0b', fontWeight: 600}}>+{fmt(excessProtection)}</span></>
          )}
        </div>
      </div>

      {/* 传承功能卡 */}
      <div style={{
        background: 'rgba(99, 102, 241, 0.06)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
        borderRadius: '10px', padding: '18px'
      }}>
        <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px'}}>
          <span style={{fontSize: '1.3rem'}}>🏛</span>
          <h4 style={{margin: 0, color: '#818cf8'}}>传承功能</h4>
        </div>
        <div style={{display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(255,255,255,0.7)'}}>
            <span style={{color: '#10b981'}}>✓</span> 免遗产认证（Probate-free）
          </div>
          <div style={{display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(255,255,255,0.7)'}}>
            <span style={{color: '#10b981'}}>✓</span> 直接赔付指定受益人
          </div>
          <div style={{display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(255,255,255,0.7)'}}>
            <span style={{color: '#10b981'}}>✓</span> 不受债权人追索
          </div>
        </div>
        {p50EstimateEnd > 0 && (
          <div style={{
            marginTop: '14px', paddingTop: '12px',
            borderTop: '1px solid rgba(255,255,255,0.1)'
          }}>
            <div style={{fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)'}}>P50 情景传承估算</div>
            <div style={{fontSize: '1.2rem', fontWeight: 700, color: '#818cf8'}}>
              {fmt(p50EstimateEnd)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ILPSummaryCard;
