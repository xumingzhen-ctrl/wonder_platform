import React from 'react';
import { TrendingUp, Calendar } from 'lucide-react';
import { getCurrencySymbol } from '../../utils/currency';

const RebalanceModal = ({
  showRebalanceModal, setShowRebalanceModal,
  rebalancePreview, rebalanceDate, setRebalanceDate,
  handleRebalancePreview, handleRebalanceExecute,
}) => {
  if (!showRebalanceModal) return null;
  return (
        <div className="modal-overlay">
          <div className="glass-card modal-content" style={{maxWidth: '860px'}} onClick={e => e.stopPropagation()}>
            <h3 style={{marginTop: 0, display: 'flex', alignItems: 'center', gap: '10px'}}>
              <TrendingUp size={20} /> Rebalance Preview
            </h3>

            {/* ── Date Selector ── */}
            <div style={{background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '10px', padding: '14px 18px', marginBottom: '16px'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <Calendar size={15} style={{color: '#818cf8'}} />
                  <span style={{color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem'}}>Rebalance As Of Date</span>
                </div>
                <input
                  type="date"
                  value={rebalanceDate}
                  onChange={e => setRebalanceDate(e.target.value)}
                  style={{
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(99,102,241,0.5)',
                    borderRadius: '6px', color: '#fff', padding: '6px 12px', fontSize: '0.9rem', cursor: 'pointer'
                  }}
                />
                <button
                  onClick={handleRebalancePreview}
                  style={{
                    background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.6)',
                    borderRadius: '6px', color: '#a5b4fc', padding: '6px 14px', cursor: 'pointer',
                    fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  🔄 Recalculate
                </button>
                <span style={{color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem'}}>
                  {rebalanceDate === new Date().toISOString().split('T')[0]
                    ? '(Today — live prices)'
                    : '(Historical — uses prices from that date)'}
                </span>
              </div>
            </div>

            {/* ── NAV & Cash Summary — displayed in portfolio BASE CURRENCY ── */}
            {rebalancePreview?.total_nav_usd > 0 && (() => {
              const rbCcy  = rebalancePreview.base_currency || 'USD';
              const rbSym  = getCurrencySymbol(rbCcy);
              const navFmt = (v) => `${rbSym}${Math.round(v).toLocaleString()}`;
              return (
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px'}}>
                  <div style={{background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px', padding: '10px 14px', textAlign: 'center'}}>
                    <div style={{color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '4px'}}>Total Portfolio NAV ({rbCcy})</div>
                    <div style={{color: '#10b981', fontWeight: 700, fontSize: '1.05rem'}}>{navFmt(rebalancePreview.total_nav_base)}</div>
                  </div>
                  <div style={{background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '8px', padding: '10px 14px', textAlign: 'center'}}>
                    <div style={{color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '4px'}}>Cash Pool incl. Dividends ({rbCcy})</div>
                    <div style={{color: '#fbbf24', fontWeight: 700, fontSize: '1.05rem'}}>{navFmt(rebalancePreview.total_cash_base)}</div>
                  </div>
                  <div style={{background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: '8px', padding: '10px 14px', textAlign: 'center'}}>
                    <div style={{color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '4px'}}>Cash % of NAV</div>
                    <div style={{color: '#a855f7', fontWeight: 700, fontSize: '1.05rem'}}>{rebalancePreview.cash_pct?.toFixed(1)}%</div>
                  </div>
                </div>
              );
            })()}

            {rebalancePreview?.total_cash_base > 0 && (
              <div style={{background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', fontSize: '0.83rem', color: 'rgba(255,255,255,0.65)'}}>
                💡 <strong style={{color: '#fbbf24'}}>Dividend Cash Reinvestment:</strong> Idle cash (incl. accumulated dividends) is included in total NAV. BUY orders below will deploy this cash back into target assets. The <span style={{color:'#fbbf24'}}>Cash row</span> shows the before → after weight.
              </div>
            )}

            <p style={{color: 'rgba(255,255,255,0.5)', marginBottom: '16px', fontSize: '0.85rem'}}>
              Trades required to return the portfolio to target weights as of <strong style={{color: '#a5b4fc'}}>{rebalancePreview?.as_of_date || rebalanceDate}</strong>.
            </p>

            <div className="table-container" style={{maxHeight: '420px', overflowY: 'auto', marginBottom: '24px'}}>
              <table>
                <thead>
                  <tr>
                    <th>Asset / Position</th>
                    <th>Action</th>
                    <th>Shares</th>
                    <th>Price</th>
                    <th>Trade Amount</th>
                    <th>Before % → After %</th>
                  </tr>
                </thead>
                <tbody>
                  {(rebalancePreview?.trades || []).map((trade, idx) => {
                    const isCash = trade.is_cash;
                    const sym = getCurrencySymbol(trade.currency || 'USD');
                    const actionColor = isCash
                      ? (trade.action === 'DEPLOY' ? '#fbbf24' : '#94a3b8')
                      : (trade.action === 'BUY' ? '#10b981' : '#f43f5e');
                    return (
                      <tr key={idx} style={isCash ? {background: 'rgba(251,191,36,0.06)', borderTop: '1px solid rgba(251,191,36,0.25)'} : {}}>
                        <td>
                          <div style={{fontWeight: 600, color: isCash ? '#fbbf24' : undefined}}>{trade.name || trade.isin}</div>
                          <div className="isin-badge" style={isCash ? {background: 'rgba(251,191,36,0.15)', color: '#fcd34d'} : {}}>{trade.isin}</div>
                        </td>
                        <td>
                          <span style={{color: actionColor, fontWeight: 700, background: `${actionColor}18`, padding: '3px 8px', borderRadius: '5px', fontSize: '0.82rem'}}>
                            {trade.action}
                          </span>
                        </td>
                        <td style={{color: isCash ? 'rgba(255,255,255,0.3)' : undefined}}>
                          {isCash ? '—' : trade.shares}
                        </td>
                        <td style={{color: isCash ? 'rgba(255,255,255,0.3)' : undefined}}>
                          {isCash ? '—' : `${sym}${trade.price?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`}
                        </td>
                        <td>
                          {isCash ? (
                            <div>
                              <span style={{color: '#fbbf24', fontWeight: 600}}>{sym}{trade.amount?.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                              <div style={{fontSize: '0.73rem', color: 'rgba(255,255,255,0.35)'}}>pool balance</div>
                            </div>
                          ) : (
                            <div>
                              {sym}{trade.amount?.toLocaleString()}
                              {trade.currency !== 'USD' && trade.amount_usd && (
                                <div style={{fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)'}}>≈ ${trade.amount_usd?.toLocaleString()}</div>
                              )}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                            <span style={{color: isCash ? '#fbbf24' : 'rgba(255,255,255,0.5)', fontSize: '0.9rem'}}>{trade.current_weight}%</span>
                            <span style={{color: 'rgba(255,255,255,0.3)'}}>→</span>
                            <span style={{fontWeight: 700, color: isCash ? (trade.target_weight < trade.current_weight ? '#10b981' : '#94a3b8') : undefined}}>
                              {trade.target_weight}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {(rebalancePreview?.trades?.length === 0 || !rebalancePreview?.trades) && (
                    <tr><td colSpan="6" style={{textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.4)'}}>✅ Portfolio is already perfectly balanced.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{display: 'flex', gap: '12px'}}>
              <button
                className="create-btn"
                style={{flex: 1}}
                onClick={handleRebalanceExecute}
                disabled={!rebalancePreview?.trades?.filter(t => !t.is_cash).length}
              >
                ✓ Confirm &amp; Execute Trades
              </button>
              <button className="create-btn cancel" style={{flex: 1}} onClick={() => setShowRebalanceModal(false)}>✕ Cancel</button>
            </div>
          </div>
        </div>
  );
};

export default RebalanceModal;
