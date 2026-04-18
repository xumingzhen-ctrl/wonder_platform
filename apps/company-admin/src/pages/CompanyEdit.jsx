import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { companiesApi } from '../api/index.js'
import { useApp } from '../contexts/AppContext.jsx'

// ── 业务模式定义 ────────────────────────────────────────────────────
const BUSINESS_MODES = [
  {
    value: 'insurance_agent',
    icon: '🛡️',
    label: '保险代理（无限责任）',
    desc: '主要收入为保险佣金，适用 BIR60 税务申报',
    features: ['佣金台账', '支出凭证', 'BIR60 税务'],
    legal_type_hint: 'unlimited',
  },
  {
    value: 'trading_sme',
    icon: '📦',
    label: '贸易 / 服务业 SME',
    desc: '通过开具发票收款，管理应收账款与客户',
    features: ['发票管理', '客户管理', '支出凭证'],
    legal_type_hint: 'limited',
  },
  {
    value: 'freelancer',
    icon: '🧑‍💻',
    label: '个人自由职业者',
    desc: '项目报价单与简单发票，专注收支记录',
    features: ['报价单', '发票', '支出凭证'],
    legal_type_hint: 'sole_prop',
  },
  {
    value: 'holding',
    icon: '🏛️',
    label: '投资 / 持股架构',
    desc: '纯账务隔离，仅作支出记录与资产账务',
    features: ['支出凭证', '基础账务'],
    legal_type_hint: 'limited',
  },
]

const LEGAL_TYPES = [
  { value: 'unlimited', label: '无限责任公司 (Unlimited Company)' },
  { value: 'limited',   label: '有限公司 (Limited Company)' },
  { value: 'sole_prop', label: '独资经营 (Sole Proprietorship)' },
]

export default function CompanyEditPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { switchCompany, refreshCompanies } = useApp()
  const [loading, setLoading] = useState(false)
  const isEditing = Boolean(id)

  const [formData, setFormData] = useState({
    name_zh: '',
    name_en: '',
    cr_number: '',
    br_number: '',
    incorporation_date: '',
    fiscal_year_end_month: '03',
    base_currency: 'HKD',
    address: '',
    phone: '',
    email: '',
    business_mode: 'trading_sme',
    company_legal_type: 'limited',
  })

  useEffect(() => {
    if (isEditing) {
      setLoading(true)
      companiesApi.get(id).then(res => {
        const data = res.data
        if (data.incorporation_date) {
          data.incorporation_date = data.incorporation_date.split('T')[0]
        }
        setFormData(prev => ({ ...prev, ...data }))
      }).finally(() => setLoading(false))
    }
  }, [id, isEditing])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  function selectMode(modeValue) {
    const mode = BUSINESS_MODES.find(m => m.value === modeValue)
    setFormData(prev => ({
      ...prev,
      business_mode: modeValue,
      // 选择模式时自动建议法律形式（用户仍可修改）
      company_legal_type: mode?.legal_type_hint || prev.company_legal_type,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const payload = { ...formData }
      if (!payload.incorporation_date) payload.incorporation_date = null

      let comp
      if (isEditing) {
        const res = await companiesApi.update(id, payload)
        comp = res.data
      } else {
        const res = await companiesApi.create(payload)
        comp = res.data
      }

      await refreshCompanies()
      switchCompany(comp)
      navigate('/')
    } catch (err) {
      alert('保存失败: ' + (err.response?.data?.detail || err.message))
    } finally {
      setLoading(false)
    }
  }

  const selectedMode = BUSINESS_MODES.find(m => m.value === formData.business_mode)

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: '0 16px 60px' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>
        {isEditing ? '✏️ 编辑公司设定' : '🏢 新增公司'}
      </h2>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 13, margin: '0 0 28px' }}>
        公司的「业务模式」将决定系统为您显示的功能模块和 Dashboard 报表
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Step 1：选择业务模式 ── */}
        <section className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px', color: 'var(--color-text)' }}>
            第一步：选择业务模式 <span style={{ color: 'red' }}>*</span>
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {BUSINESS_MODES.map(mode => {
              const isSelected = formData.business_mode === mode.value
              return (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => selectMode(mode.value)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 6,
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-md)',
                    border: isSelected
                      ? '2px solid var(--color-primary)'
                      : '1px solid var(--color-border)',
                    background: isSelected
                      ? 'rgba(var(--color-primary-rgb, 99, 102, 241), 0.06)'
                      : 'var(--color-surface)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                    boxShadow: isSelected ? '0 0 0 3px rgba(99,102,241,0.12)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 20 }}>{mode.icon}</span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: isSelected ? 'var(--color-primary)' : 'var(--color-text)' }}>
                      {mode.label}
                    </span>
                    {isSelected && <span style={{ marginLeft: 'auto', color: 'var(--color-primary)', fontSize: 16 }}>✓</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                    {mode.desc}
                  </p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {mode.features.map(f => (
                      <span key={f} style={{
                        fontSize: 11, padding: '2px 7px', borderRadius: 20,
                        background: isSelected ? 'rgba(99,102,241,0.12)' : 'var(--color-bg)',
                        color: isSelected ? 'var(--color-primary)' : 'var(--color-text-muted)',
                      }}>{f}</span>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {/* ── Step 2：公司法律形式 ── */}
        <section className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px' }}>
            第二步：公司注册资料
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="form-label">公司法律形式 <span style={{ color: 'red' }}>*</span></label>
              <select name="company_legal_type" value={formData.company_legal_type} onChange={handleChange} className="form-input">
                {LEGAL_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">公司名称（中文）<span style={{ color: 'red' }}>*</span></label>
              <input required name="name_zh" value={formData.name_zh} onChange={handleChange} className="form-input" placeholder="例如：香港智匯科技有限公司" />
            </div>

            <div>
              <label className="form-label">公司名称（英文）</label>
              <input name="name_en" value={formData.name_en} onChange={handleChange} className="form-input" placeholder="Optional English name" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label className="form-label">商业登记号 (BR)</label>
                <input name="br_number" value={formData.br_number} onChange={handleChange} className="form-input" placeholder="例如：58291038" />
              </div>
              <div>
                <label className="form-label">公司注册号 (CR)</label>
                <input name="cr_number" value={formData.cr_number} onChange={handleChange} className="form-input" placeholder="例如：2839912" />
              </div>
            </div>

            <div>
              <label className="form-label">成立日期</label>
              <input type="date" name="incorporation_date" value={formData.incorporation_date} onChange={handleChange} className="form-input" />
            </div>
          </div>
        </section>

        {/* ── Step 3：财务设定 ── */}
        <section className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px' }}>第三步：财务与联络设定</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label className="form-label">财政年度结束月</label>
                <select name="fiscal_year_end_month" value={formData.fiscal_year_end_month} onChange={handleChange} className="form-input">
                  <option value="03">3月（预设）</option>
                  <option value="12">12月</option>
                </select>
              </div>
              <div>
                <label className="form-label">基准货币</label>
                <select name="base_currency" value={formData.base_currency} onChange={handleChange} className="form-input">
                  <option value="HKD">港币 (HKD)</option>
                  <option value="USD">美元 (USD)</option>
                  <option value="CNY">人民币 (CNY)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="form-label">注册地址</label>
              <input name="address" value={formData.address} onChange={handleChange} className="form-input" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label className="form-label">联络电话</label>
                <input name="phone" value={formData.phone} onChange={handleChange} className="form-input" />
              </div>
              <div>
                <label className="form-label">电邮地址</label>
                <input type="email" name="email" value={formData.email} onChange={handleChange} className="form-input" />
              </div>
            </div>
          </div>
        </section>

        {/* ── 预览已选配置 ── */}
        {selectedMode && (
          <div style={{
            padding: '14px 18px',
            background: 'rgba(99,102,241,0.06)',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <span style={{ fontSize: 24 }}>{selectedMode.icon}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-primary)' }}>
                将启用：{selectedMode.features.join('、')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                系统将根据「{selectedMode.label}」模式为您定制 Dashboard 与侧边栏
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)} style={{ flex: 1 }}>
            取消
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 2 }}>
            {loading ? '储存中...' : '储存公司设定'}
          </button>
        </div>
      </form>
    </div>
  )
}
