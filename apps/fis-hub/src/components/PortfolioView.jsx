import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, ComposedChart
} from 'recharts';
import {
  Activity, ArrowUpRight, Briefcase, Calendar, Camera, DollarSign, Edit3, Settings, TrendingUp, Undo2
} from 'lucide-react';
import { COLORS, getCurrencySymbol, fmtMoney, fmtAxis, fmtCompact } from '../utils/currency';

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
  handleRebalancePreview, handleUndoRebalance
}) => {
  // Re-export the formatter functions for convenience inside JSX
  const fx = data?.usd_to_base_fx || 1;
  const ccy = data?.base_currency || 'USD';

  if (loading) return <div style={{textAlign: 'center', paddingTop: '100px'}}><h2>Analyzing Data...</h2></div>;
  if (!data || !data.details) return null;

  return (
    <div className="portfolio-view-scope">
      <header style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px'}}>
                <div>
                  <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                    <h1 style={{textAlign: 'left', margin: 0}}>{portfolios.find(p => p.id === activeId)?.name}</h1>
                    <button
                      title="Rename portfolio"
                      onClick={() => { setRenameDraft(portfolios.find(p => p.id === activeId)?.name || ''); setShowRenameModal(true); }}
                      style={{background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: '#818cf8', display: 'flex', alignItems: 'center'}}
                    >
                      <Edit3 size={16} />
                    </button>
                  </div>
                  <p className="header-subtitle">
                    <Calendar size={14} /> 
                    Strategy Start: {data.start_date} | Results as of: {data.report_date}
                    {data.wallet_balance !== undefined && ` | Wallet: ${fmtMoney(data.wallet_balance, 1, data.base_currency || 'USD')}`}
                  </p>
                </div>
                <div style={{display: 'flex', gap: '12px'}}>
                  <button onClick={handleExportCSV} className="action-btn-secondary" title="Export Holdings to CSV">
                    <Camera size={16} /> Export Holdings
                  </button>
                  <button onClick={handleExportDividendsCSV} className="action-btn-secondary" title="Export Dividends to CSV">
                    <Camera size={16} /> Export Dividends
                  </button>
                  <button onClick={handleRebalancePreview} className="action-btn-secondary">
                    <TrendingUp size={16} /> Rebalance
                  </button>
                  <button onClick={handleUndoRebalance} className="action-btn-secondary" title="Undo Latest Trades">
                    <Undo2 size={16} /> Undo Trades
                  </button>
                  <button onClick={handleOpenCompModal} className="action-btn-secondary" title="Portfolio Composition Management">
                    <Briefcase size={16} /> Composition
                  </button>
                  <button onClick={handleOpenManageDivModal} className="action-btn-secondary" title="Dividend Management">
                    <Settings size={16} /> Dividends
                  </button>
                  <button onClick={() => setShowDivModal(true)} className="action-btn-secondary">
                    <DollarSign size={16} /> Add Dividend
                  </button>
                </div>
              </header>

              {/* Sub-Tabs Navigation */}
              <div style={{display: 'flex', gap: '20px', marginBottom: '30px', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
                <button 
                  onClick={() => setActiveSubTab('performance')}
                  style={{paddingBottom: '10px', background: 'transparent', border: 'none', borderBottom: activeSubTab === 'performance' ? '2px solid #818cf8' : '2px solid transparent', color: activeSubTab === 'performance' ? '#818cf8' : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontWeight: 500, transition: 'all 0.2s'}}
                >
                  Holdings & Performance
                </button>
                <button 
                  onClick={() => setActiveSubTab('dividends')}
                  style={{paddingBottom: '10px', background: 'transparent', border: 'none', borderBottom: activeSubTab === 'dividends' ? '2px solid #818cf8' : '2px solid transparent', color: activeSubTab === 'dividends' ? '#818cf8' : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontWeight: 500, transition: 'all 0.2s'}}
                >
                  Income & Projections
                </button>
              </div>

              {activeSubTab === 'performance' ? (
                <>
                  {/* Existing Performance View (NAV Chart + Summary Stats) */}
                  <section className="glass-card" style={{marginBottom: '40px', padding: '30px', minHeight: '380px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
                  <div className="stat-label" style={{fontSize: '1.2rem', color: '#fff'}}>Performance Over Time (Since Inception)</div>
                  {historyData.length === 0 && <div style={{fontSize: '0.85rem', color: '#10b981', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'}}>Syncing Market Data...</div>}
                </div>
                <div style={{height: '300px', width: '100%'}}>
                  {historyData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={historyData} margin={{top: 10, right: 10, left: 10, bottom: 0}}>
                        <defs>
                          <linearGradient id="navColor" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.5}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis 
                          dataKey="date" 
                          stroke="rgba(255,255,255,0.1)" 
                          tick={{fill: '#9ca3af', fontSize: 11}} 
                          tickFormatter={(val) => val ? String(val).substring(0, 7) : ''} 
                          minTickGap={40} 
                        />
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
                          stroke="rgba(255,255,255,0.1)" 
                          tick={{fill: '#9ca3af', fontSize: 11}} 
                          tickFormatter={(val) => fmtAxis(Number(val), 1, data.base_currency || 'USD')} 
                          width={60}
                        />
                        <Tooltip 
                          contentStyle={{backgroundColor: '#1e1e2f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'}}
                          itemStyle={{color: '#10b981', fontWeight: 'bold'}}
                          formatter={(value) => [fmtMoney(Number(value), 1, data.base_currency || 'USD'), '资产市值']}
                          labelStyle={{color: '#9ca3af', marginBottom: '8px'}}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="value" 
                          stroke="#10b981" 
                          strokeWidth={3} 
                          fill="url(#navColor)" 
                          animationDuration={1500}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'gray', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px'}}>
                      Constructing localized month-end time series...
                    </div>
                  )}
                </div>
              </section>

              <section className="stats-grid">
                <div className="glass-card" title={fmtMoney(data.total_market_value || data.total_nav, 1, data.base_currency || 'USD')}>
                  <div className="stat-label">资产市值 <span style={{fontSize:'0.7rem', color:'#818cf8', marginLeft:'4px'}}>{data.base_currency || 'USD'}</span></div>
                  <div className="stat-value">{fmtCompact(data.total_market_value || data.total_nav, 1, data.base_currency || 'USD')}</div>
                  <div className="positive"><TrendingUp size={16} /> Market Value</div>
                </div>
                <div className="glass-card">
                  <div className="stat-label">Cumulative ROI</div>
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
                        <Tooltip formatter={(val) => `$${val.toLocaleString()}`} />
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
                  <div className="stat-label" style={{marginBottom: '20px'}}>Top 10 Holdings</div>
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
                          width={90}
                          tick={{fill: '#9ca3af', fontSize: 10}}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          cursor={{fill: 'rgba(255,255,255,0.04)'}}
                          contentStyle={{backgroundColor: '#1e1e2f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', fontSize: '0.8rem'}}
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
                        <span style={{color: 'rgba(255,255,255,0.7)'}}>{entry.isin}</span>
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
                  <label style={{fontSize: '0.85rem', color: '#9ca3af'}}>Withholding Tax:</label>
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
                  <label style={{fontSize: '0.85rem', color: '#9ca3af'}} title="Model long-term reinvestment compounding">DRIP Simulation:</label>
                  <label className="switch">
                    <input type="checkbox" checked={dripMode} onChange={e => setDripMode(e.target.checked)} />
                    <span className="slider round"></span>
                  </label>
                </div>
              </div>

              {divLoading ? (
                <div style={{textAlign: 'center', padding: '100px'}}><h2>Calculating Projections...</h2></div>
              ) : divProjData && (divProjData.portfolio_metrics?.total_annual_income > 0 || divProjData.assets?.some(a => a.est_annual_income > 0 || a.source === 'manual_extrapolation')) ? (
                <>
                  {/* Dividend Summary Cards */}
                  <section className="stats-grid" style={{marginBottom: '40px'}}>
                    <div className="glass-card" title={fmtMoney(divProjData?.portfolio_metrics?.total_annual_income || 0, 1, data?.base_currency || 'USD')}>
                      <div className="stat-label">Est. Annual Income <span style={{fontSize:'0.7rem', color:'#818cf8', marginLeft:'4px'}}>{data?.base_currency || 'USD'}</span></div>
                      <div className="stat-value" style={{color: '#10b981'}}>{fmtCompact(divProjData?.portfolio_metrics?.total_annual_income || 0, 1, data?.base_currency || 'USD')}</div>
                      <div className="positive"><DollarSign size={16} /> Projected (12M)</div>
                    </div>
                    <div className="glass-card">
                      <div className="stat-label">Portfolio YOC</div>
                      <div className="stat-value" style={{color: '#818cf8'}}>{divProjData?.portfolio_metrics?.portfolio_yoc || '0'}%</div>
                      <div className="positive"><ArrowUpRight size={16} /> Yield on Cost</div>
                    </div>
                    <div className="glass-card">
                      <div className="stat-label">Current Yield</div>
                      <div className="stat-value" style={{color: '#f59e0b'}}>{divProjData?.portfolio_metrics?.portfolio_current_yield || '0'}%</div>
                      <div className="positive"><Activity size={16} /> Market Pricing</div>
                    </div>
                  </section>

                  {/* Projection Chart */}
                  <section className="glass-card" style={{marginBottom: '40px', padding: '30px'}}>
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
                  <h3 style={{color: '#9ca3af', marginBottom: '8px'}}>No Dividend Data Available</h3>
                  <p style={{color: 'rgba(255,255,255,0.3)', maxWidth: '480px', margin: '0 auto 20px', fontSize: '0.9rem', lineHeight: 1.6}}>
                    This portfolio's holdings (e.g. LU-ISIN funds) are not covered by the automatic dividend data source (yfinance).
                    <br/>You can manually record dividends using the <strong style={{color: '#818cf8'}}>Dividends → Add Dividend</strong> button above.
                  </p>
                  <button
                    onClick={() => setShowDivModal(true)}
                    style={{background: 'linear-gradient(135deg, #6366f1, #a855f7)', border: 'none', borderRadius: '8px', padding: '10px 24px', color: '#fff', cursor: 'pointer', fontWeight: 600}}
                  >
                    + Add Manual Dividend
                  </button>
                </div>
              )}
            </div>
          )}
    </div>
  );
};

export default PortfolioView;
