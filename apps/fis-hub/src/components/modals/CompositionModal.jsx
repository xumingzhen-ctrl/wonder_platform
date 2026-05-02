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
        <div className="modal-overlay">
          <div className="glass-card modal-content" style={{maxWidth: '1000px'}} onClick={e => e.stopPropagation()}>
            <h2 style={{marginTop: 0}}>Transaction History</h2>
            <p style={{color: 'rgba(255,255,255,0.5)', marginBottom: '20px', fontSize: '0.85rem'}}>
              View and edit past transactions. Adjust dates, shares, and prices.
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
                    <th>PRICE</th>
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
                          <select
                            value={edits.type !== undefined ? edits.type : tx.type}
                            onChange={e => handleCompEdit(tx.id, 'type', e.target.value)}
                            style={{
                              background: (edits.type !== undefined ? edits.type : tx.type) === 'BUY' ? 'rgba(16,185,129,0.2)' : ((edits.type !== undefined ? edits.type : tx.type) === 'CASH_IN' ? 'rgba(99,102,241,0.2)' : 'rgba(244,63,94,0.2)'),
                              color: (edits.type !== undefined ? edits.type : tx.type) === 'BUY' ? '#10b981' : ((edits.type !== undefined ? edits.type : tx.type) === 'CASH_IN' ? '#818cf8' : '#f43f5e'),
                              border: '1px solid transparent', borderRadius: '12px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600, outline: 'none', cursor: 'pointer',
                              appearance: 'none', textAlign: 'center'
                            }}
                          >
                            <option value="BUY" style={{background: '#1e293b', color: '#10b981'}}>BUY</option>
                            <option value="SELL" style={{background: '#1e293b', color: '#f43f5e'}}>SELL</option>
                            <option value="CASH_IN" style={{background: '#1e293b', color: '#818cf8'}}>CASH_IN</option>
                            <option value="CASH_OUT" style={{background: '#1e293b', color: '#f43f5e'}}>CASH_OUT</option>
                            <option value="DIV_CASH" style={{background: '#1e293b', color: '#10b981'}}>DIV_CASH</option>
                          </select>
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
                    <tr><td colSpan="7" style={{textAlign: 'center', padding: '20px', color: '#64748b'}}>No transactions found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Add New Transaction Row */}
            <div style={{background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '12px', padding: '16px', marginBottom: '20px'}}>
              <div style={{fontSize: '0.85rem', fontWeight: 600, marginBottom: '12px', color: '#818cf8'}}>+ Add Transaction</div>
              <div style={{display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap'}}>
                <div style={{flex: 1}}>
                  <label style={{fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px'}}>Date</label>
                  <input
                    type="date"
                    value={compNewAsset.date}
                    onChange={e => setCompNewAsset({...compNewAsset, date: e.target.value})}
                    style={{width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px 10px', color: '#fff'}}
                  />
                </div>
                <div style={{flex: 1}}>
                  <label style={{fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px'}}>Type</label>
                  <select
                    value={compNewAsset.type}
                    onChange={e => setCompNewAsset({...compNewAsset, type: e.target.value})}
                    style={{
                      width: '100%', 
                      background: compNewAsset.type === 'BUY' ? 'rgba(16,185,129,0.2)' : (compNewAsset.type === 'CASH_IN' ? 'rgba(99,102,241,0.2)' : 'rgba(244,63,94,0.2)'),
                      color: compNewAsset.type === 'BUY' ? '#10b981' : (compNewAsset.type === 'CASH_IN' ? '#818cf8' : '#f43f5e'),
                      border: '1px solid transparent', borderRadius: '6px', padding: '6px 10px', fontSize: '0.85rem', fontWeight: 600, outline: 'none', cursor: 'pointer'
                    }}
                  >
                    <option value="BUY" style={{background: '#1e293b', color: '#10b981'}}>BUY</option>
                    <option value="SELL" style={{background: '#1e293b', color: '#f43f5e'}}>SELL</option>
                    <option value="CASH_IN" style={{background: '#1e293b', color: '#818cf8'}}>CASH_IN</option>
                    <option value="CASH_OUT" style={{background: '#1e293b', color: '#f43f5e'}}>CASH_OUT</option>
                    <option value="DIV_CASH" style={{background: '#1e293b', color: '#10b981'}}>DIV_CASH</option>
                  </select>
                </div>
                <div style={{flex: 1.5}}>
                  <label style={{fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px'}}>ISIN / Ticker</label>
                  <input
                    placeholder="VOO / CASH_USD"
                    value={compNewAsset.isin}
                    onChange={e => setCompNewAsset({...compNewAsset, isin: e.target.value})}
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
                  <label style={{fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px'}}>Price / Amt</label>
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

