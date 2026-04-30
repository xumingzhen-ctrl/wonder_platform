import React from 'react';
import { Trash2, Plus } from 'lucide-react';

const CompositionModal = ({
  showCompModal, setShowCompModal,
  compTxs, compTargets, compEditing,
  compNewAsset, setCompNewAsset,
  handleCompEdit, handleCompSave, handleCompDelete, handleCompAddAsset,
  portfolios, activeId,
}) => {
  if (!showCompModal) return null;
  return (
        <div className="modal-overlay" onClick={() => setShowCompModal(false)}>
          <div className="glass-card modal-content" style={{maxWidth: '1000px'}} onClick={e => e.stopPropagation()}>
            <h2 style={{marginTop: 0}}>Trading Manager (Asset Ledger)</h2>
            <p style={{color: 'rgba(255,255,255,0.5)', marginBottom: '20px', fontSize: '0.85rem'}}>
              Edit the exact Inception Date, Initial Shares, Average Cost, and Target Weight of each holding. These values override market data.
            </p>
            
            <div className="table-container" style={{maxHeight: '400px', overflowY: 'auto', marginBottom: '20px'}}>
              <table>
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>TYPE</th>
                    <th>ISIN</th>
                    <th>NAME</th>
                    <th>SHARES</th>
                    <th title="Manual override. This locks your cost basis and won't be overwritten by daily sync.">AVG COST 🔒</th>
                    <th>TARGET %</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {compTxs.map(tx => {
                    const edits = compEditing[tx.id] || {};
                    const isEdited = Object.keys(edits).length > 0;
                    return (
                      <tr key={tx.id}>
                        <td>
                          <input
                            type="date"
                            value={edits.date !== undefined ? edits.date : tx.date}
                            onChange={e => handleCompEdit(tx.id, 'date', e.target.value)}
                            style={{width: '120px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '4px 8px', color: '#fff', fontSize: '0.85rem'}}
                          />
                        </td>
                        <td>
                          <span style={{padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', background: tx.type === 'BUY' ? 'rgba(16,185,129,0.2)' : (tx.type === 'CASH_IN' ? 'rgba(99,102,241,0.2)' : 'rgba(244,63,94,0.2)'), color: tx.type === 'BUY' ? '#10b981' : (tx.type === 'CASH_IN' ? '#818cf8' : '#f43f5e')}}>
                            {tx.type}
                          </span>
                        </td>
                        <td>
                          <input
                            value={edits.isin !== undefined ? edits.isin : tx.isin}
                            onChange={e => handleCompEdit(tx.id, 'isin', e.target.value)}
                            style={{width: '120px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '4px 8px', color: '#fff', fontSize: '0.85rem'}}
                          />
                        </td>
                        <td style={{fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)'}}>{tx.name}</td>
                        <td>
                          <input
                            type="number"
                            value={edits.shares !== undefined ? edits.shares : tx.shares}
                            onChange={e => handleCompEdit(tx.id, 'shares', parseFloat(e.target.value))}
                            style={{width: '90px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '4px 8px', color: '#fff', fontSize: '0.85rem'}}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            value={edits.price !== undefined ? edits.price : tx.price}
                            onChange={e => handleCompEdit(tx.id, 'price', parseFloat(e.target.value))}
                            style={{width: '90px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '4px 8px', color: '#f59e0b', fontSize: '0.85rem', fontWeight: 600}}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            value={edits.target_weight !== undefined ? edits.target_weight : (tx.target_weight || 0)}
                            onChange={e => handleCompEdit(tx.id, 'target_weight', parseFloat(e.target.value))}
                            style={{width: '70px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '4px 8px', color: '#818cf8', fontSize: '0.85rem'}}
                          />
                        </td>
                        <td>
                          <div style={{display: 'flex', gap: '6px'}}>
                            {isEdited && (
                              <button
                                onClick={() => handleCompSave(tx.id)}
                                style={{background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600}}
                              >Save</button>
                            )}
                            <button
                              onClick={() => handleCompDelete(tx.id)}
                              style={{background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center'}}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {compTxs.length === 0 && (
                    <tr><td colSpan="8" style={{textAlign: 'center', padding: '20px', color: '#64748b'}}>No transactions found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Add New Asset Row */}
            <div style={{background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '12px', padding: '16px', marginBottom: '20px'}}>
              <div style={{fontSize: '0.85rem', fontWeight: 600, marginBottom: '12px', color: '#818cf8'}}>+ Add New Asset</div>
              <div style={{display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap'}}>
                <div style={{flex: 2}}>
                  <label style={{fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px'}}>ISIN / Ticker</label>
                  <input
                    placeholder="VOO"
                    value={compNewAsset.isin}
                    onChange={e => setCompNewAsset({...compNewAsset, isin: e.target.value})}
                    style={{width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px 10px', color: '#fff'}}
                  />
                </div>
                <div style={{flex: 1}}>
                  <label style={{fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px'}}>Weight</label>
                  <input
                    type="number" step="0.01" placeholder="0.3"
                    value={compNewAsset.weight}
                    onChange={e => setCompNewAsset({...compNewAsset, weight: parseFloat(e.target.value)})}
                    style={{width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px 10px', color: '#fff'}}
                  />
                </div>
                <div style={{flex: 1}}>
                  <label style={{fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px'}}>Shares</label>
                  <input
                    type="number" placeholder="100"
                    value={compNewAsset.shares}
                    onChange={e => setCompNewAsset({...compNewAsset, shares: parseFloat(e.target.value)})}
                    style={{width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px 10px', color: '#fff'}}
                  />
                </div>
                <div style={{flex: 1}}>
                  <label style={{fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px'}}>Price</label>
                  <input
                    type="number" step="0.01" placeholder="100.00"
                    value={compNewAsset.price}
                    onChange={e => setCompNewAsset({...compNewAsset, price: parseFloat(e.target.value)})}
                    style={{width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px 10px', color: '#fff'}}
                  />
                </div>
                <button
                  onClick={handleCompAddAsset}
                  className="create-btn"
                  style={{padding: '8px 20px', whiteSpace: 'nowrap'}}
                >+ Add</button>
              </div>
            </div>

            <div style={{display: 'flex', justifyContent: 'flex-end'}}>
              <button onClick={() => setShowCompModal(false)} className="action-btn-secondary">Close</button>
            </div>
          </div>
        </div>
  );
};

export default CompositionModal;
