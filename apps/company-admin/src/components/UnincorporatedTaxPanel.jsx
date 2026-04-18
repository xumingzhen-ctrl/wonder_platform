import React from 'react'

const fmt = (val, ccy) => typeof val === 'number' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy || 'HKD', minimumFractionDigits: 2 }).format(val) : val

export default function UnincorporatedTaxPanel({ taxInfo, openSettings, ccy }) {
  if (!taxInfo || !taxInfo.options) return null
  
  const { unincorporated_profits_tax: up_tax, personal_assessment: pa } = taxInfo.options
  const upTaxVal = up_tax.estimated_tax
  const paTaxVal = pa.tax
  
  const recommendedStr = taxInfo.recommendation === 'personal_assessment' 
    ? '✨ 推薦：採用個人入息課稅更省稅'
    : '✨ 推薦：採用標準利得稅更省稅'

  let savings = Math.abs(upTaxVal - paTaxVal)
  if (taxInfo.recommendation === 'profits_tax') {
    savings = 0 // Or just note it
  }

  return (
    <div style={{ marginTop: '20px', backgroundColor: '#F8FAFC', borderRadius: '8px', padding: '16px', border: '1px solid #E2E8F0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h4 style={{ margin: 0, color: '#1E293B' }}>💡 稅務優化推演 (Tax Optimization)</h4>
        <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={openSettings}>
          ⚙️ 調整税务檔案
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div style={{ backgroundColor: '#FFF', padding: '12px', borderRadius: '6px', border: '1px solid #E2E8F0', opacity: taxInfo.recommendation === 'profits_tax' ? 1 : 0.6 }}>
          <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '4px' }}>傳統非法團利得稅</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#334155' }}>
            {fmt(upTaxVal, ccy)}
          </div>
          <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>{up_tax.rate_desc}</div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '8px', borderTop: '1px dashed #E2E8F0', paddingTop: '6px' }}>
            公式：{up_tax.formula || '利潤 × 非法團稅率'}
          </div>
        </div>

        <div style={{ backgroundColor: '#FFF', padding: '12px', borderRadius: '6px', border: '1px solid #E2E8F0', borderLeft: taxInfo.recommendation === 'personal_assessment' ? '4px solid #10B981' : '1px solid #E2E8F0', opacity: taxInfo.recommendation === 'personal_assessment' ? 1 : 0.6 }}>
          <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '4px' }}>個人入息課稅 (Personal Assessment)</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: taxInfo.recommendation === 'personal_assessment' ? '#10B981' : '#334155' }}>
            {fmt(paTaxVal, ccy)}
          </div>
          <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
            {pa.breakdown.method}
          </div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '8px', borderTop: '1px dashed #E2E8F0', paddingTop: '6px' }}>
            公式：{pa.breakdown.formula || '扣減免稅額後按累進稅率'}
          </div>
        </div>
      </div>

      {taxInfo.recommendation === 'personal_assessment' && savings > 0 && (
        <div style={{ backgroundColor: '#ECFDF5', color: '#065F46', padding: '10px 14px', borderRadius: '6px', fontSize: '14px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>💰</span>
          系統為您推演发现，採用<strong>個人入息課稅</strong>可額外節省 <strong>{fmt(savings, ccy)}</strong> 的稅金。
        </div>
      )}
      {taxInfo.recommendation === 'profits_tax' && (
        <div style={{ backgroundColor: '#EFF6FF', color: '#1E40AF', padding: '10px 14px', borderRadius: '6px', fontSize: '14px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>🤖</span>
           當前採用<strong>傳統利得稅</strong>最有利。若您有更多免稅額未填，請點擊「調整税务檔案」更新。
        </div>
      )}
    </div>
  )
}
