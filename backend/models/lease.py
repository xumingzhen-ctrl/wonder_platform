"""
lease.py — 物业租约管理数据模型

三张表：
  1. Lease         — 租约台账主表（一套物业一条记录）
  2. LeasePayment  — 租金付款记录（月/季/年周期）
  3. LeaseMiscFee  — 其他杂费台账（印花税/中介费/管理费等）
"""
import uuid
import enum
from datetime import datetime
from sqlalchemy import (
    Column, String, DateTime, Boolean, ForeignKey,
    Numeric, Text, Integer, Enum as SAEnum, Date, Index
)
from sqlalchemy.orm import relationship
from database import Base


# ════════════════════════════════════════════════════════════════
# 枚举定义
# ════════════════════════════════════════════════════════════════

class PaymentFrequency(str, enum.Enum):
    monthly   = "monthly"    # 按月付
    quarterly = "quarterly"  # 按季付
    annual    = "annual"     # 按年付


class LeaseStatus(str, enum.Enum):
    upcoming   = "upcoming"    # 即将生效（未到开始日）
    active     = "active"      # 生效中
    expiring   = "expiring"    # 即将到期（60天内）
    expired    = "expired"     # 已到期
    terminated = "terminated"  # 提前终止


class DepositStatus(str, enum.Enum):
    held         = "held"          # 持有中
    returned     = "returned"      # 已全额退还
    partial      = "partial"       # 部分退还
    disputed     = "disputed"      # 有争议


class PropertyType(str, enum.Enum):
    office    = "office"     # 写字楼
    retail    = "retail"     # 零售店铺
    warehouse = "warehouse"  # 仓库
    industrial = "industrial" # 工业单位
    other     = "other"      # 其他


class RentPaymentStatus(str, enum.Enum):
    pending  = "pending"   # 待付
    paid     = "paid"      # 已付
    overdue  = "overdue"   # 逾期未付
    waived   = "waived"    # 已豁免（如业主减租）


class MiscFeeType(str, enum.Enum):
    stamp_duty      = "stamp_duty"      # 印花税
    agency_fee      = "agency_fee"      # 中介费/代理费
    management_fee  = "management_fee"  # 管理费（物业管理）
    renovation      = "renovation"      # 装修/翻新费
    legal_fee       = "legal_fee"       # 律师费
    government_rate = "government_rate" # 差饷（政府差饷）
    water_sewage    = "water_sewage"    # 水费排污费
    other           = "other"           # 其他


# ════════════════════════════════════════════════════════════════
# Lease — 租约台账主表
# ════════════════════════════════════════════════════════════════

class Lease(Base):
    """物业租约台账主表 — 每套物业一条活跃租约记录"""
    __tablename__ = "leases"

    id         = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=False)

    # ── 编号 ──────────────────────────────────────────────────────
    lease_number = Column(String(20), nullable=False, index=True)
    # 格式：LS-{companyShort}-001，如 LS-HKCO-001

    # ── 物业信息 ───────────────────────────────────────────────────
    property_name    = Column(String(200), nullable=False)    # 如"金钟中心 1205室"
    property_address = Column(String(500), nullable=True)     # 完整地址
    property_type    = Column(SAEnum(PropertyType), default=PropertyType.office)

    # ── 业主信息 ───────────────────────────────────────────────────
    landlord_name    = Column(String(200), nullable=True)     # 业主/业主公司名称
    landlord_contact = Column(String(200), nullable=True)     # 联系方式（电话/邮箱）

    # ── 租期 ───────────────────────────────────────────────────────
    start_date = Column(Date, nullable=False)    # 租约开始日期
    end_date   = Column(Date, nullable=False)    # 租约到期日期

    # ── 租金条款 ───────────────────────────────────────────────────
    monthly_rent      = Column(Numeric(15, 2), nullable=False)  # 月租基准（无论任何周期，均以此为基础）
    rent_currency     = Column(String(3), default="HKD")
    payment_frequency = Column(SAEnum(PaymentFrequency), default=PaymentFrequency.monthly)
    rent_due_day      = Column(Integer, default=1)  # 每期付款到期日（1=每期1号），季度/年付同样适用

    # ── 押金 ──────────────────────────────────────────────────────
    deposit_amount        = Column(Numeric(15, 2), nullable=True)
    deposit_currency      = Column(String(3), default="HKD")
    deposit_paid_date     = Column(Date, nullable=True)              # 租客支付押金日期
    deposit_status        = Column(SAEnum(DepositStatus), default=DepositStatus.held)
    deposit_returned_date = Column(Date, nullable=True)              # 押金退还日期
    deposit_returned_amount = Column(Numeric(15, 2), nullable=True)  # 实退押金（可能克扣）
    deposit_notes         = Column(Text, nullable=True)              # 押金备注

    # ── 续约条款 ──────────────────────────────────────────────────
    renewal_notice_days = Column(Integer, default=60)  # 续约通知提前天数
    auto_renewal        = Column(Boolean, default=False)

    # ── 状态与文档 ────────────────────────────────────────────────
    status          = Column(SAEnum(LeaseStatus), default=LeaseStatus.active)
    notes           = Column(Text, nullable=True)
    attachment_path = Column(String(500), nullable=True)  # 租约PDF扫描件路径

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # ── 关系 ──────────────────────────────────────────────────────
    company      = relationship("Company", back_populates="leases")
    payments     = relationship("LeasePayment", back_populates="lease",
                                cascade="all, delete-orphan", order_by="LeasePayment.due_date")
    misc_fees    = relationship("LeaseMiscFee", back_populates="lease",
                                cascade="all, delete-orphan", order_by="LeaseMiscFee.due_date")

    __table_args__ = (
        Index("ix_leases_company_status", "company_id", "status"),
    )


# ════════════════════════════════════════════════════════════════
# LeasePayment — 租金付款记录（多周期）
# ════════════════════════════════════════════════════════════════

class LeasePayment(Base):
    """租金付款记录表 — 支持月付/季付/年付周期"""
    __tablename__ = "lease_payments"

    id         = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    lease_id   = Column(String(36), ForeignKey("leases.id"), nullable=False)
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=False)

    # ── 账期信息 ──────────────────────────────────────────────────
    period_label = Column(String(20), nullable=False, index=True)
    # 月付："2026-04"  | 季付："2026-Q2"  | 年付："2026-27"（港财年格式）
    period_start = Column(Date, nullable=False)   # 账期开始日
    period_end   = Column(Date, nullable=False)   # 账期结束日

    # ── 金额 ──────────────────────────────────────────────────────
    due_date     = Column(Date, nullable=False)           # 应付截止日
    amount       = Column(Numeric(15, 2), nullable=False) # 应付金额（月租 × 周期系数）
    amount_paid  = Column(Numeric(15, 2), nullable=True)  # 实付金额（允许与应付略有偏差）
    currency     = Column(String(3), default="HKD")
    amount_hkd   = Column(Numeric(15, 2), nullable=True)  # 折算HKD

    # ── 付款记录 ──────────────────────────────────────────────────
    paid_date      = Column(Date, nullable=True)          # 实际付款日
    payment_method = Column(String(30), nullable=True)    # bank_transfer/cheque/fps/cash
    reference_no   = Column(String(100), nullable=True)   # 付款参考号（FPS流水/支票号）

    # ── 状态与联动 ────────────────────────────────────────────────
    status             = Column(SAEnum(RentPaymentStatus), default=RentPaymentStatus.pending)
    expense_voucher_id = Column(String(36), nullable=True)  # 关联Expense.id（标记付款时自动生成）
    fiscal_year        = Column(String(10), nullable=True)  # 香港财年，如"2025-26"

    notes      = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # ── 关系 ──────────────────────────────────────────────────────
    lease   = relationship("Lease", back_populates="payments")
    company = relationship("Company")

    __table_args__ = (
        Index("ix_lease_payments_company_status", "company_id", "status"),
        Index("ix_lease_payments_lease_period",   "lease_id",   "period_label"),
    )


# ════════════════════════════════════════════════════════════════
# LeaseMiscFee — 其他杂费台账
# ════════════════════════════════════════════════════════════════

class LeaseMiscFee(Base):
    """租约相关杂费台账 — 印花税/中介费/管理费/装修等"""
    __tablename__ = "lease_misc_fees"

    id         = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    lease_id   = Column(String(36), ForeignKey("leases.id"), nullable=False)
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=False)

    # ── 费用信息 ──────────────────────────────────────────────────
    fee_type    = Column(SAEnum(MiscFeeType), nullable=False)
    description = Column(String(200), nullable=True)   # 详细描述
    amount      = Column(Numeric(15, 2), nullable=False)
    currency    = Column(String(3), default="HKD")
    amount_hkd  = Column(Numeric(15, 2), nullable=True)

    # ── 付款 ──────────────────────────────────────────────────────
    due_date       = Column(Date, nullable=True)        # 应付日期
    paid_date      = Column(Date, nullable=True)        # 实付日期
    payment_method = Column(String(30), nullable=True)
    reference_no   = Column(String(100), nullable=True)

    # ── 税务 ──────────────────────────────────────────────────────
    is_tax_deductible = Column(Boolean, default=True)
    # 参考：管理费✅ 印花税✅ 中介费✅ 装修费⚠️(按折旧) 律师费✅

    # ── 状态与联动 ────────────────────────────────────────────────
    status             = Column(String(10), default="pending")  # pending/paid
    expense_voucher_id = Column(String(36), nullable=True)      # 标记付款时自动生成Expense
    fiscal_year        = Column(String(10), nullable=True)

    notes      = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # ── 关系 ──────────────────────────────────────────────────────
    lease   = relationship("Lease", back_populates="misc_fees")
    company = relationship("Company")
