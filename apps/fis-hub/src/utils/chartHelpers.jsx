import React from 'react';

/**
 * Custom Tooltip for the "Combined Cash Flow to Pocket" BarChart.
 * Displays individual line items PLUS a summary section:
 *  - 总流入 (Total Inflow)
 *  - 总流出 (Total Outflow)
 *  - 净现金流 (Net Cash Flow)
 */
export const CombinedCashFlowTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const totalInflow = (data.portInflow || 0) + (data.insInflow || 0);
    const totalOutflow = Math.abs((data.portOutflow || 0) + (data.insOutflow || 0));
    const netCF = totalInflow - totalOutflow;
    return (
      <div style={{
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        border: '1px solid rgba(255,255,255,0.1)',
        padding: '12px 14px',
        borderRadius: '8px',
        boxShadow: '0 6px 16px rgba(0,0,0,0.5)',
        color: '#fff',
        minWidth: '220px'
      }}>
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px', marginBottom: '8px', fontWeight: '800', fontSize: '0.9rem' }}>
          {label}
        </div>
        {payload.map((entry, index) => (
          <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', padding: '2px 0' }}>
            <span style={{ fontSize: '0.72rem', color: entry.color, fontWeight: 500 }}>{entry.name}</span>
            <span style={{ fontWeight: 700, color: entry.color, fontFamily: 'monospace', fontSize: '0.85rem' }}>
              ${Math.round(Math.abs(entry.value)).toLocaleString()}
            </span>
          </div>
        ))}
        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed rgba(255,255,255,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
            <span style={{ fontSize: '0.72rem', color: '#10b981' }}>总流入 (Total Inflow)</span>
            <span style={{ fontWeight: '800', color: '#10b981', fontFamily: 'monospace', fontSize: '0.85rem' }}>
              +${Math.round(totalInflow).toLocaleString()}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.72rem', color: '#f43f5e' }}>总流出 (Total Outflow)</span>
            <span style={{ fontWeight: '800', color: '#f43f5e', fontFamily: 'monospace', fontSize: '0.85rem' }}>
              -${Math.round(totalOutflow).toLocaleString()}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '6px', marginTop: '4px' }}>
            <span style={{ fontSize: '0.72rem', color: '#fff', fontWeight: 600 }}>净现金流 (Net Cash Flow)</span>
            <span style={{ fontWeight: '900', color: netCF >= 0 ? '#10b981' : '#f43f5e', fontFamily: 'monospace', fontSize: '0.95rem' }}>
              {netCF >= 0 ? '+' : '-'}${Math.round(Math.abs(netCF)).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};
