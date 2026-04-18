import React from 'react';

const RenameModal = ({ showRenameModal, setShowRenameModal, renameDraft, setRenameDraft, handleRename }) => {
  if (!showRenameModal) return null;
  return (
        <div className="modal-overlay">
          <div className="glass-card modal-content" style={{maxWidth: '380px'}} onClick={e => e.stopPropagation()}>
            <h3 style={{marginTop: 0}}>Rename Portfolio</h3>
            <form onSubmit={handleRename}>
              <div className="form-group">
                <label>New Name</label>
                <input
                  value={renameDraft}
                  onChange={e => setRenameDraft(e.target.value)}
                  required
                  autoFocus
                  placeholder="Enter portfolio name..."
                />
              </div>
              <div style={{display: 'flex', gap: '12px', marginTop: '20px'}}>
                <button type="submit" className="create-btn" style={{flex: 1}}>✓ Save</button>
                <button type="button" className="create-btn cancel" style={{flex: 1}} onClick={() => setShowRenameModal(false)}>✕ Cancel</button>
              </div>
            </form>
          </div>
        </div>
  );
};

export default RenameModal;
