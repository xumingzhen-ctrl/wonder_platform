import React, { useState } from 'react';
import { X, Globe, Zap, Loader2, AlertCircle, CheckCircle2, History, Camera, Info } from 'lucide-react';

export default function BrokerSync({ isOpen, onClose, onSyncSuccess }) {
  const [provider, setProvider] = useState('FUTU');
  const [syncMode, setSyncMode] = useState('snapshot'); // 'snapshot' | 'transaction'
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState(11111);
  const [clientId, setClientId] = useState(101);
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  if (!isOpen) return null;

  const handleProviderChange = (p) => {
    setProvider(p);
    if (p === 'IB') setPort(7497);
    else if (p === 'FUTU') setPort(11111);
  };

  const handleSync = async () => {
    setLoading(true);
    setStatus(null);
    try {
      let endpoint, body;

      if (syncMode === 'snapshot') {
        // Position Snapshot Sync (original mode)
        endpoint = provider === 'IB' ? '/sync/ib' : '/sync/futu';
        body = provider === 'IB'
          ? { host, port: parseInt(port), client_id: parseInt(clientId) }
          : { host, port: parseInt(port) };
      } else {
        // Transaction History Sync (WAC mode)
        endpoint = provider === 'IB' ? '/sync/ib/transactions' : '/sync/futu/transactions';
        body = provider === 'IB'
          ? { host, port: parseInt(port), client_id: parseInt(clientId) }
          : { host, port: parseInt(port), days: parseInt(days) };
      }

      const res = await fetch(`/api${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Sync failed');

      let msg;
      if (syncMode === 'transaction') {
        msg = `Transaction sync complete. ${data.trades_imported ?? 0} new trades imported. ${data.positions_written ?? 0} positions rebuilt with WAC cost.`;
        if (data.warning) {
          setStatus({ type: 'warning', message: msg, warning: data.warning });
        } else {
          setStatus({ type: 'success', message: msg });
        }
      } else {
        const count = data.count;
        msg = count > 1
          ? `Successfully synced ${count} portfolios`
          : `Successfully synced ${data.portfolios?.[0]?.name || data.name || 'portfolio'}`;
        setStatus({ type: 'success', message: msg });
      }

      if (onSyncSuccess) {
        const pid = data.portfolios?.[0]?.portfolio_id || data.portfolio_id;
        if (pid) onSyncSuccess(pid);
      }

      setTimeout(() => {
        onClose();
        setStatus(null);
      }, 3000);

    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const modeStyle = (m) => ({
    flex: 1,
    padding: '10px 6px',
    borderRadius: '8px',
    border: '1px solid ' + (syncMode === m ? '#818cf8' : 'rgba(255,255,255,0.1)'),
    background: syncMode === m ? 'rgba(99,102,241,0.15)' : 'transparent',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    fontSize: '0.82rem'
  });

  const providerStyle = (p) => ({
    flex: 1,
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid ' + (provider === p ? '#818cf8' : 'rgba(255,255,255,0.1)'),
    background: provider === p ? 'rgba(99,102,241,0.1)' : 'transparent',
    color: '#fff',
    cursor: 'pointer'
  });

  return (
    <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div className="modal-content glass-card" style={{ width: '440px', padding: '24px', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>
          <X size={20} />
        </button>

        <h2 style={{ marginTop: 0, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Globe size={24} className="text-indigo-400" />
          Broker Sync
        </h2>

        {/* Broker Selection */}
        <div style={{ marginBottom: '18px' }}>
          <label className="stat-label">SELECT BROKER</label>
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button onClick={() => handleProviderChange('IB')} style={providerStyle('IB')}>
              Interactive Brokers
            </button>
            <button onClick={() => handleProviderChange('FUTU')} style={providerStyle('FUTU')}>
              FUTU
            </button>
          </div>
        </div>

        {/* Sync Mode Toggle */}
        <div style={{ marginBottom: '18px' }}>
          <label className="stat-label">SYNC MODE</label>
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button onClick={() => setSyncMode('snapshot')} style={modeStyle('snapshot')}>
              <Camera size={14} /> Snapshot (Fast)
            </button>
            <button onClick={() => setSyncMode('transaction')} style={modeStyle('transaction')}>
              <History size={14} /> Transaction Sync (Accurate)
            </button>
          </div>
          {syncMode === 'snapshot' && (
            <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginTop: '6px' }}>
              Imports current positions using broker's cost basis. Fast, but may show negative cost for house money positions.
            </p>
          )}
          {syncMode === 'transaction' && (
            <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginTop: '6px' }}>
              Rebuilds your ledger from trade history using Weighted Average Cost (commission included). Most accurate for PnL.
            </p>
          )}
        </div>

        {/* Connection Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label className="stat-label">GATEWAY HOST</label>
            <input type="text" value={host} onChange={e => setHost(e.target.value)} className="modal-input" style={{ width: '100%', marginTop: '5px' }} />
          </div>
          <div>
            <label className="stat-label">GATEWAY PORT</label>
            <input type="number" value={port} onChange={e => setPort(e.target.value)} className="modal-input" style={{ width: '100%', marginTop: '5px' }} />
          </div>
          {provider === 'IB' && (
            <div>
              <label className="stat-label">CLIENT ID</label>
              <input type="number" value={clientId} onChange={e => setClientId(e.target.value)} className="modal-input" style={{ width: '100%', marginTop: '5px' }} />
            </div>
          )}
          {syncMode === 'transaction' && provider === 'FUTU' && (
            <div>
              <label className="stat-label">HISTORY DAYS (MAX 90)</label>
              <input
                type="number" value={days} min={1} max={90}
                onChange={e => setDays(Math.min(90, Math.max(1, parseInt(e.target.value) || 90)))}
                className="modal-input" style={{ width: '100%', marginTop: '5px' }}
              />
              {days >= 90 && (
                <div style={{ marginTop: '8px', padding: '8px 10px', borderRadius: '6px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b', fontSize: '0.75rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <Info size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>Futu provides up to 90 days of trade history. Positions held longer than 90 days will be included as opening entries. For a complete history, run a Position Snapshot first, then use Transaction Sync for ongoing trades.</span>
                </div>
              )}
            </div>
          )}
          {syncMode === 'transaction' && provider === 'IB' && (
            <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b', fontSize: '0.75rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <Info size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>IB Transaction Sync imports today's executions only. For full history, use the IB Flex Query export via your IB account portal.</span>
            </div>
          )}
        </div>

        {/* Status Message */}
        {status && (
          <div style={{
            marginTop: '18px', padding: '12px', borderRadius: '8px', fontSize: '0.82rem',
            display: 'flex', flexDirection: 'column', gap: '6px',
            background: status.type === 'success' ? 'rgba(16,185,129,0.1)'
              : status.type === 'warning' ? 'rgba(245,158,11,0.1)'
              : 'rgba(244,63,94,0.1)',
            color: status.type === 'success' ? '#10b981'
              : status.type === 'warning' ? '#f59e0b'
              : '#f43f5e',
            border: '1px solid ' + (status.type === 'success' ? 'rgba(16,185,129,0.2)'
              : status.type === 'warning' ? 'rgba(245,158,11,0.2)'
              : 'rgba(244,63,94,0.2)')
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {status.type === 'success' ? <CheckCircle2 size={15} />
                : status.type === 'warning' ? <AlertCircle size={15} />
                : <AlertCircle size={15} />}
              {status.message}
            </div>
            {status.warning && (
              <div style={{ fontSize: '0.75rem', opacity: 0.85, paddingLeft: '23px' }}>
                ⚠ {status.warning}
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleSync}
          disabled={loading}
          className="create-btn"
          style={{ width: '100%', marginTop: '24px', justifyContent: 'center' }}
        >
          {loading
            ? <><Loader2 size={18} className="animate-spin" /> Syncing...</>
            : <><Zap size={18} /> {syncMode === 'transaction' ? 'Start Transaction Sync' : 'Start Sync'}</>
          }
        </button>

        <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginTop: '14px', textAlign: 'center' }}>
          Ensure {provider === 'IB' ? 'TWS/IB Gateway' : 'FutuOpenD'} is running and API is enabled on your local machine.
        </p>
      </div>
    </div>
  );
}
