import React from 'react';

const DividendModal = ({ showDivModal, setShowDivModal, mDiv, setMDiv, handleManualDiv, data }) => {
  if (!showDivModal) return null;
  return (
        <div className="modal-overlay">
          <div className="glass-card modal-content" style={{maxWidth: '420px'}} onClick={e => e.stopPropagation()}>
            <h3 style={{marginTop: 0}}>Add Manual Dividend</h3>
            <form onSubmit={handleManualDiv}>
              <div className="form-group">
                <label>Asset ISIN</label>
                <select value={mDiv.isin} onChange={e => setMDiv({...mDiv, isin: e.target.value})} required>
                  <option value="">Select Asset</option>
                  {data?.details.filter(a => !a.isin.startsWith('CASH_')).map(a => <option key={a.isin} value={a.isin}>{a.name} ({a.isin})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={mDiv.date} onChange={e => setMDiv({...mDiv, date: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Amount per Share ($)</label>
                <input type="number" step="0.0001" min="0" value={mDiv.amount} onChange={e => setMDiv({...mDiv, amount: e.target.value})} required />
              </div>
              <div style={{display: 'flex', gap: '12px', marginTop: '20px'}}>
                <button type="submit" className="create-btn" style={{flex: 1}}>✓ Confirm</button>
                <button type="button" className="create-btn cancel" style={{flex: 1}} onClick={() => setShowDivModal(false)}>✕ Cancel</button>
              </div>
            </form>
          </div>
        </div>

  );
};

export default DividendModal;
