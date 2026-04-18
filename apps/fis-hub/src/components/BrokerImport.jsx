import React, { useState, useRef, useCallback } from 'react';
import { X, Upload, FileText, Image, Loader2, CheckCircle2, AlertCircle, Plus, Trash2, Edit3, Zap } from 'lucide-react';

export default function BrokerImport({ isOpen, onClose, onImportSuccess }) {
  const [stage, setStage] = useState('upload'); // 'upload' | 'preview' | 'success'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [positions, setPositions] = useState([]);
  const [source, setSource] = useState('');
  const [portfolioName, setPortfolioName] = useState('');
  const [importDate, setImportDate] = useState(new Date().toISOString().split('T')[0]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const resetState = () => {
    setStage('upload');
    setLoading(false);
    setError(null);
    setPositions([]);
    setSource('');
    setPortfolioName('');
    setImportDate(new Date().toISOString().split('T')[0]);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  // ── File Upload ──────────────────────────────────────────────────────────
  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    files.forEach(f => formData.append('files', f));

    try {
      const res = await fetch('http://localhost:8000/import/broker-file', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Parse failed');
      
      const allErrors = data.errors || [];
      if (allErrors.length > 0 && (!data.positions || data.positions.length === 0)) {
        throw new Error(allErrors.join('; '));
      } else if (!data.positions || data.positions.length === 0) {
        throw new Error('No positions detected. Try a different file or format.');
      }

      if (allErrors.length > 0) {
        console.warn('Some files failed to parse:', allErrors);
        // Optionally show partial error
      }

      setPositions(data.positions);
      setSource(data.source);
      // Auto-generate portfolio name from filename
      const baseName = files.length > 1 ? `Import (${files.length} files)` : files[0].name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
      setPortfolioName(baseName);
      setStage('preview');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  // ── Preview Editing ──────────────────────────────────────────────────────
  const updatePosition = (index, field, value) => {
    setPositions(prev => prev.map((p, i) =>
      i === index ? { ...p, [field]: field === 'shares' || field === 'avg_cost' ? parseFloat(value) || 0 : value } : p
    ));
  };

  const removePosition = (index) => {
    setPositions(prev => prev.filter((_, i) => i !== index));
  };

  const addPosition = () => {
    setPositions(prev => [...prev, { symbol: '', name: '', shares: 0, avg_cost: 0, currency: 'USD' }]);
  };

  // ── Confirm Import ──────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!portfolioName.trim()) {
      setError('Please enter a portfolio name');
      return;
    }
    const validPositions = positions.filter(p => p.symbol && p.shares > 0);
    if (validPositions.length === 0) {
      setError('No valid positions to import');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('http://localhost:8000/import/broker-file/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio_name: portfolioName.trim(),
          positions: validPositions,
          date: importDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Import failed');

      setStage('success');

      if (onImportSuccess && data.portfolio_id) {
        onImportSuccess(data.portfolio_id);
      }

      setTimeout(() => {
        handleClose();
      }, 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const totalValue = positions.reduce((sum, p) => sum + (p.shares * p.avg_cost), 0);

  // ── Source badge ─────────────────────────────────────────────────────────
  const sourceBadge = {
    csv: { icon: <FileText size={12} />, label: 'CSV', color: '#10b981' },
    pdf: { icon: <FileText size={12} />, label: 'PDF', color: '#818cf8' },
    image: { icon: <Image size={12} />, label: 'AI Vision', color: '#f59e0b' },
  }[source] || { icon: <FileText size={12} />, label: source, color: '#888' };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div className="modal-content glass-card" style={{
        width: stage === 'preview' ? '720px' : '480px',
        maxHeight: '85vh',
        padding: '28px',
        position: 'relative',
        transition: 'width 0.3s ease',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <button onClick={handleClose}
          style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', zIndex: 10 }}>
          <X size={20} />
        </button>

        {/* ═══ STAGE: UPLOAD ═══════════════════════════════════════════════ */}
        {stage === 'upload' && (
          <>
            <h2 style={{ marginTop: 0, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Upload size={24} style={{ color: '#818cf8' }} />
              Import Portfolio
            </h2>
            <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)', marginTop: 0, marginBottom: '22px' }}>
              Upload one or more CSVs, PDFs, or screenshots from your broker to auto-create a portfolio.
            </p>

            {/* Drop Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragActive ? '#818cf8' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: '16px',
                padding: '40px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragActive ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)',
                transition: 'all 0.2s ease',
                marginBottom: '20px',
              }}
            >
              {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <Loader2 size={36} style={{ color: '#818cf8', animation: 'spin 1s linear infinite' }} />
                  <span style={{ color: '#818cf8', fontSize: '0.9rem' }}>Analyzing file...</span>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '14px' }}>
                    <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(16,185,129,0.1)' }}>
                      <FileText size={24} style={{ color: '#10b981' }} />
                    </div>
                    <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(129,140,248,0.1)' }}>
                      <FileText size={24} style={{ color: '#818cf8' }} />
                    </div>
                    <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(245,158,11,0.1)' }}>
                      <Image size={24} style={{ color: '#f59e0b' }} />
                    </div>
                  </div>
                  <p style={{ margin: '0 0 6px 0', fontWeight: 600, fontSize: '0.95rem' }}>
                    Drop file here or click to browse
                  </p>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)' }}>
                    Supports: CSV, PDF, PNG, JPG, WEBP
                  </p>
                </>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".csv,.tsv,.txt,.pdf,.png,.jpg,.jpeg,.webp"
              style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files.length > 0) handleFiles(Array.from(e.target.files)); }}
            />

            {/* Format hints */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              {[
                { icon: <FileText size={14} />, label: 'CSV / Excel', desc: 'Broker export', color: '#10b981' },
                { icon: <FileText size={14} />, label: 'PDF', desc: 'Statements', color: '#818cf8' },
                { icon: <Image size={14} />, label: 'Screenshot', desc: 'AI powered', color: '#f59e0b' },
              ].map(h => (
                <div key={h.label} style={{
                  padding: '10px', borderRadius: '10px',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                  textAlign: 'center', fontSize: '0.75rem',
                }}>
                  <div style={{ color: h.color, marginBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    {h.icon} {h.label}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.35)' }}>{h.desc}</div>
                </div>
              ))}
            </div>

            {error && (
              <div style={{
                marginTop: '16px', padding: '12px', borderRadius: '8px', fontSize: '0.82rem',
                background: 'rgba(244,63,94,0.1)', color: '#f43f5e',
                border: '1px solid rgba(244,63,94,0.2)',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <AlertCircle size={15} /> {error}
              </div>
            )}
          </>
        )}

        {/* ═══ STAGE: PREVIEW ═════════════════════════════════════════════ */}
        {stage === 'preview' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Zap size={22} style={{ color: '#10b981' }} />
                Review & Import
              </h2>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '4px 10px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600,
                background: `${sourceBadge.color}20`, color: sourceBadge.color,
                border: `1px solid ${sourceBadge.color}30`,
              }}>
                {sourceBadge.icon} Detected via {sourceBadge.label}
              </span>
            </div>

            {/* Portfolio Settings */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <div style={{ flex: 2 }}>
                <label className="stat-label" style={{ fontSize: '0.68rem' }}>PORTFOLIO NAME</label>
                <input
                  value={portfolioName}
                  onChange={e => setPortfolioName(e.target.value)}
                  className="modal-input"
                  style={{ width: '100%', marginTop: '4px' }}
                  placeholder="My Portfolio"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="stat-label" style={{ fontSize: '0.68rem' }}>DATE</label>
                <input
                  type="date"
                  value={importDate}
                  onChange={e => setImportDate(e.target.value)}
                  className="modal-input"
                  style={{ width: '100%', marginTop: '4px' }}
                />
              </div>
            </div>

            {/* Position Table */}
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '14px', maxHeight: '45vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={thStyle}>Symbol</th>
                    <th style={thStyle}>Name</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Shares</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Avg Cost</th>
                    <th style={thStyle}>CCY</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Value</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={tdStyle}>
                        <input
                          value={pos.symbol}
                          onChange={e => updatePosition(idx, 'symbol', e.target.value)}
                          style={cellInputStyle}
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          value={pos.name}
                          onChange={e => updatePosition(idx, 'name', e.target.value)}
                          style={{ ...cellInputStyle, color: 'rgba(255,255,255,0.5)' }}
                        />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <input
                          type="number"
                          value={pos.shares}
                          onChange={e => updatePosition(idx, 'shares', e.target.value)}
                          style={{ ...cellInputStyle, textAlign: 'right', width: '80px' }}
                        />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <input
                          type="number"
                          step="0.01"
                          value={pos.avg_cost}
                          onChange={e => updatePosition(idx, 'avg_cost', e.target.value)}
                          style={{ ...cellInputStyle, textAlign: 'right', width: '90px' }}
                        />
                      </td>
                      <td style={tdStyle}>
                        <select
                          value={pos.currency}
                          onChange={e => updatePosition(idx, 'currency', e.target.value)}
                          style={{ ...cellInputStyle, width: '65px', background: 'rgba(255,255,255,0.05)' }}
                        >
                          {['USD', 'HKD', 'CNY', 'JPY', 'EUR', 'GBP', 'SGD', 'AUD', 'CAD', 'CHF'].map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem' }}>
                        {(pos.shares * pos.avg_cost).toLocaleString('en', { maximumFractionDigits: 0 })}
                      </td>
                      <td style={tdStyle}>
                        <Trash2
                          size={14}
                          style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.3)' }}
                          onClick={() => removePosition(idx)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <button
                onClick={addPosition}
                style={{
                  background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.15)',
                  color: 'rgba(255,255,255,0.5)', padding: '6px 14px', borderRadius: '8px',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem',
                }}
              >
                <Plus size={14} /> Add Row
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)' }}>
                  {positions.length} positions
                </span>
                <button
                  onClick={() => { resetState(); }}
                  style={{
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem',
                  }}
                >
                  ← Re-upload
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="create-btn"
                  style={{ padding: '8px 24px', justifyContent: 'center' }}
                >
                  {loading
                    ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Importing...</>
                    : <><CheckCircle2 size={16} /> Import {positions.length} Positions</>
                  }
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                marginTop: '12px', padding: '10px', borderRadius: '8px', fontSize: '0.8rem',
                background: 'rgba(244,63,94,0.1)', color: '#f43f5e',
                border: '1px solid rgba(244,63,94,0.2)',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}
          </>
        )}

        {/* ═══ STAGE: SUCCESS ═════════════════════════════════════════════ */}
        {stage === 'success' && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: 'rgba(16,185,129,0.15)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
            }}>
              <CheckCircle2 size={32} style={{ color: '#10b981' }} />
            </div>
            <h2 style={{ margin: '0 0 8px 0' }}>Portfolio Created!</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: '0.88rem' }}>
              {positions.length} positions imported successfully.
            </p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ── Table styles ──────────────────────────────────────────────────────────────
const thStyle = {
  padding: '8px 6px', textAlign: 'left', fontWeight: 600,
  fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)',
  textTransform: 'uppercase', letterSpacing: '0.5px',
};
const tdStyle = { padding: '4px 6px' };
const cellInputStyle = {
  background: 'transparent', border: '1px solid transparent',
  color: '#fff', padding: '4px 6px', borderRadius: '4px',
  fontSize: '0.82rem', width: '100%',
  outline: 'none', transition: 'border-color 0.2s',
};
