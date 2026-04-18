import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { companiesApi } from '../api'

export default function TaxProfileModal({ isOpen, onClose, companyId, onSaveSuccess }) {
  const [formData, setFormData] = useState({
    marital_status: 'single',
    spouse_net_income: '0',
    children_count: '0',
    dependent_parents_60: '0',
    dependent_parents_55: '0',
    mpf_self_contribution: '0',
    other_deductions: '0',
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen && companyId) {
      setLoading(true)
      companiesApi.getTaxProfile(companyId)
        .then(res => setFormData(res.data))
        .catch(err => console.error(err))
        .finally(() => setLoading(false))
    }
  }, [isOpen, companyId])

  if (!isOpen) return null

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await companiesApi.updateTaxProfile(companyId, formData)
      onSaveSuccess()
      onClose()
    } catch (err) {
      console.error(err)
      alert("儲存失敗")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{maxWidth: '500px'}}>
        <div className="modal-header">
          <h2>個人入息課稅設定 (Tax Profile)</h2>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <form className="modal-body form-grid" onSubmit={handleSubmit}>
          {loading ? <p>載入中...</p> : (
            <>
              <div className="form-group" style={{gridColumn: '1 / -1'}}>
                <label>婚姻狀況 (Marital Status)</label>
                <select name="marital_status" value={formData.marital_status} onChange={handleChange} className="form-input">
                  <option value="single">單身 (Single)</option>
                  <option value="married">已婚 (Married)</option>
                </select>
              </div>

              {formData.marital_status === 'married' && (
                <div className="form-group" style={{gridColumn: '1 / -1'}}>
                  <label>配偶其他淨收入 (Spouse Net Income)</label>
                  <input type="number" name="spouse_net_income" value={formData.spouse_net_income} onChange={handleChange} className="form-input" />
                  <small style={{color: '#666'}}>若配偶有受僱收入，將用作模擬合併評稅的基礎。</small>
                </div>
              )}

              <div className="form-group">
                <label>子女免稅額數目</label>
                <input type="number" name="children_count" value={formData.children_count} onChange={handleChange} className="form-input" min="0" />
              </div>

              <div className="form-group">
                <label>60歲以上供養父母數目</label>
                <input type="number" name="dependent_parents_60" value={formData.dependent_parents_60} onChange={handleChange} className="form-input" min="0" />
              </div>

              <div className="form-group">
                <label>55-59歲供养父母数目</label>
                <input type="number" name="dependent_parents_55" value={formData.dependent_parents_55} onChange={handleChange} className="form-input" min="0" />
              </div>

              <div className="form-group">
                <label>強積金自僱供款 (MPF)</label>
                <input type="number" name="mpf_self_contribution" value={formData.mpf_self_contribution} onChange={handleChange} className="form-input" min="0" max="18000" />
              </div>

              <div className="form-group" style={{gridColumn: '1 / -1'}}>
                <label>其他容許扣除額</label>
                <input type="number" name="other_deductions" value={formData.other_deductions} onChange={handleChange} className="form-input" min="0" />
                <small style={{color: '#666'}}>如自願醫保、合資格延期年金、慈善捐獻等。</small>
              </div>
            </>
          )}

          <div className="modal-footer" style={{gridColumn: '1 / -1', marginTop: '20px'}}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>儲存設定</button>
          </div>
        </form>
      </div>
    </div>
  )
}
