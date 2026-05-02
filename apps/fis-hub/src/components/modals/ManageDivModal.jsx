import React from 'react';
import { Trash2 } from 'lucide-react';
const ManageDivModal = ({
  showManageDivModal, setShowManageDivModal,
  dividendHistory, handleDeleteManualDividend,
}) => {
  if (!showManageDivModal) return null;
  return (
        <div className="modal-overlay">
          <div className="glass-card modal-content" style={{maxWidth: '800px'}} onClick={e => e.stopPropagation()}>
            <h2 style={{marginTop: 0}}>Manage Dividends</h2>
            <div className="table-container" style={{maxHeight: '400px', overflowY: 'auto'}}>
              <table>
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>ASSET</th>
                    <th>TYPE</th>
                    <th>SHARES</th>
                    <th>AMOUNT/SH ($)</th>
                    <th>TOTAL PNB ($)</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {dividendHistory.map((d, i) => (
                    <tr key={i}>
                      <td>{d.date}</td>
                      <td>
                        <div style={{display: 'flex', flexDirection: 'column'}}>
                          <span style={{fontWeight: 600}}>{d.name}</span>
                          <span className="isin-badge">{d.isin}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', background: d.type === 'Manual' ? 'rgba(236,72,153,0.2)' : 'rgba(16,185,129,0.2)', color: d.type === 'Manual' ? '#f43f5e' : '#10b981'}}>
                          {d.type}
                        </span>
                      </td>
                      <td>{d.shares_held}</td>
                      <td>${d.amount_per_share.toFixed(4)}</td>
                      <td style={{fontWeight: 600, color: '#fbbf24'}}>${d.total_amount.toFixed(2)}</td>
                      <td>
                        {d.type === 'Manual' && d.id && (
                          <button 
                            onClick={() => handleDeleteManualDividend(d.id)}
                            style={{background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'}}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {dividendHistory.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{textAlign: 'center', padding: '20px', color: '#64748b'}}>No dividend records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: '20px'}}>
              <button onClick={() => setShowManageDivModal(false)} className="action-btn-secondary">Close</button>
            </div>
          </div>
        </div>

  );
};

export default ManageDivModal;
