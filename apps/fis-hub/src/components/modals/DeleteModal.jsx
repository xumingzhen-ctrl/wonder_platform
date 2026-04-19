import React from 'react';
import { Trash2 } from 'lucide-react';

const DeleteModal = ({ showDeleteModal, setShowDeleteModal, handleDelete, setDeleteCandidate }) => {
  if (!showDeleteModal) return null;
  return (
        <div className="modal-overlay">
          <div className="glass-card modal-content" style={{maxWidth: '380px', textAlign: 'center'}} onClick={e => e.stopPropagation()}>
            <Trash2 size={36} style={{color: '#f43f5e', margin: '0 auto 16px'}} />
            <h3 style={{marginTop: 0}}>Delete Portfolio?</h3>
            <p style={{color: 'rgba(255,255,255,0.6)', marginBottom: '24px'}}>This action cannot be undone. All transactions and data associated with this portfolio will be permanently deleted.</p>
            <div style={{display: 'flex', gap: '12px'}}>
              <button className="create-btn" style={{flex: 1, background: 'linear-gradient(135deg, #f43f5e, #be123c)'}} onClick={handleDelete}>✓ Yes, Delete</button>
              <button className="create-btn cancel" style={{flex: 1}} onClick={() => { setShowDeleteModal(false); setDeleteCandidate(null); }}>✕ Cancel</button>
            </div>
          </div>
        </div>

  );
};

export default DeleteModal;
