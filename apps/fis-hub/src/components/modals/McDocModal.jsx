import React from 'react';
import { HelpCircle } from 'lucide-react';

const McDocModal = ({ showMcDoc, setShowMcDoc }) => {
  if (!showMcDoc) return null;
  return (
        <div className="modal-overlay" onClick={() => setShowMcDoc(false)}>
          <div className="modal-content glass-card" style={{maxWidth: '900px', width: '90%', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column'}} onClick={e => e.stopPropagation()}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '15px', borderBottom: '1px solid rgba(255,255,255,0.1)'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                <HelpCircle color="#818cf8" size={24} />
                <h2 style={{margin: 0, fontSize: '1.5rem'}}>Monte Carlo Simulation Guide</h2>
              </div>
              <button 
                onClick={() => setShowMcDoc(false)} 
                style={{background: 'rgba(255,255,255,0.05)', border: 'none', color: '#fff', cursor: 'pointer', padding: '6px 12px', borderRadius: '6px'}}
              >Close</button>
            </div>

            <div style={{overflowY: 'auto', paddingRight: '15px', fontSize: '0.95rem', lineHeight: '1.6', color: 'rgba(255,255,255,0.9)'}}>
              <div style={{background: 'rgba(99,102,241,0.1)', borderLeft: '4px solid #6366f1', padding: '15px', borderRadius: '4px', marginBottom: '20px'}}>
                <p style={{margin: 0, fontWeight: 500}}>This guide explains how the Monte Carlo engine works, what each parameter means, and how to interpret the projection results.</p>
              </div>

              <h3>1. Function Overview</h3>
              <p>Monte Carlo simulation is a statistical tool used to assess future portfolio performance through 10,000 random market scenarios. It is based on historical returns and volatility, providing a range of probable outcomes for your investment horizon.</p>

              <h3>2. Core Algorithm: Geometric Brownian Motion (GBM)</h3>
              <p>The system uses <b>Geometric Brownian Motion (GBM)</b>, the industry standard for modeling asset price paths. Unlike a simple average growth calculation, GBM accounts for <b>stochastic volatility</b> and logarithmic returns, ensuring that the simulated paths mirror real-world price behavior.</p>
              <div style={{background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '8px', fontFamily: 'monospace', marginBottom: '15px'}}>
                S(t) = S(0) * exp[(μ - 0.5 * σ²)t + σ * W(t)]
              </div>
              <p><b>Multi-Asset Alignment:</b> When multiple assets are optimized (Max Sharpe, etc.), the engine uses <b>Cholesky Decomposition</b> to correlate the random movements, ensuring that assets like VOO and QQQ which historicaly move together continue to do so in the simulation.</p>

              <h3>3. Parameter Guide</h3>
              <table style={{width: '100%', borderCollapse: 'collapse', marginBottom: '20px'}}>
                <thead style={{background: 'rgba(255,255,255,0.05)'}}>
                  <tr>
                    <th style={{textAlign: 'left', padding: '10px', fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)'}}>Parameter</th>
                    <th style={{textAlign: 'left', padding: '10px', fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)'}}>Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{borderBottom: '1px solid rgba(255,255,255,0.05)'}}><td style={{padding: '10px'}}><b>Annual Add</b></td><td style={{padding: '10px'}}>Fixed nominal amount added every year. Overrides initial capital scale.</td></tr>
                  <tr style={{borderBottom: '1px solid rgba(255,255,255,0.05)'}}><td style={{padding: '10px'}}><b>Annual Draw</b></td><td style={{padding: '10px', color: '#fb7185'}}>Amount withdrawn annually. <b>Adjusted for inflation</b> every year automatically.</td></tr>
                  <tr style={{borderBottom: '1px solid rgba(255,255,255,0.05)'}}><td style={{padding: '10px'}}><b>Inflation %</b></td><td style={{padding: '10px'}}>Simulated annual price increase. Adjusts withdrawal targets and purchasing power.</td></tr>
                  <tr style={{borderBottom: '1px solid rgba(255,255,255,0.05)'}}><td style={{padding: '10px'}}><b>Stress Mode</b></td><td style={{padding: '10px'}}>Crisis scenario where all asset correlations spike to 0.8, testing diversification failure.</td></tr>
                </tbody>
              </table>

              <h3>4. Interpreting Results</h3>
              <ul style={{paddingLeft: '20px'}}>
                <li><b>P90 (Optimistic):</b> The top 10% of scenarios (Bull market).</li>
                <li><b>P50 (Neutral):</b> The median outcome. Most representable baseline for planning.</li>
                <li><b>P10 (Pessimistic):</b> The bottom 10% of outcomes (Bear market/Crisis).</li>
                <li><b>Real Purchasing Power (Dashed):</b> Nominal P50 adjusted by your inflation setting. Represents what the money is worth in "today's dollars."</li>
              </ul>

              <h3>5. Success Probability</h3>
              <p>The percentage shown in top-right identifies how many paths ended <b>above your target goal</b>. 
                <span style={{color: '#10b981'}}> &gt;80% is considered safe</span>, 
                <span style={{color: '#f59e0b'}}> 50-80% has moderate risk</span>, 
                <span style={{color: '#f43f5e'}}> &lt;50% suggests your goals may be unrealistic</span>.
              </p>
            </div>

            <div style={{marginTop: '20px', textAlign: 'center', fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)'}}>
              Source: Antigravity Financial Intelligence Engine v2.4 (Monte Carlo GBM)
            </div>
          </div>
        </div>

      
  );
};

export default McDocModal;
