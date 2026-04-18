import uuid
import enum
from datetime import datetime
from sqlalchemy import (
    Column, String, DateTime, Boolean, ForeignKey,
    Numeric, Text, Integer, Enum as SAEnum, Date, Index
)
from sqlalchemy.orm import relationship
from database import Base


class ReceiptType(str, enum.Enum):
    hk_receipt = "hk_receipt"           # 香港收据
    cn_ordinary = "cn_ordinary"         # 内地普通收据（超市小票等）
    cn_vat_general = "cn_vat_general"   # 内地增值税普通发票
    cn_vat_special = "cn_vat_special"   # 内地增值税专用发票（可全额抵扣）
    other = "other"                     # 其他（识别不确定时）


class ExpenseStatus(str, enum.Enum):
    pending = "pending"       # 待人工复核（AI 识别后默认状态）
    confirmed = "confirmed"   # 已人工确认
    rejected = "rejected"     # 已驳回（识别错误/重复）


class ExpenseCategory(Base):
    """支出分类维度表（预置12个标准分类，含香港利得税抵扣标准）"""
    __tablename__ = "expense_categories"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code = Column(String(20), unique=True, nullable=False, index=True)
    name_zh = Column(String(100), nullable=False)
    name_en = Column(String(100), nullable=True)
    simple_category = Column(String(50), nullable=True)    # 简易分类（8大类之一）

    # 香港利得税相关
    hk_tax_deductible = Column(String(20), nullable=False, default="yes")
    # 值：yes（全额可扣）/ partial（部分可扣）/ depreciation（折旧摊销）/ no（不可扣）/ review（待审）
    hk_tax_note = Column(String(300), nullable=True)       # 税务说明

    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)

    expenses = relationship("Expense", back_populates="category")


class Expense(Base):
    """支出凭证主表 — 每条记录对应一张原始收据/发票"""
    __tablename__ = "expenses"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=False)

    # ── 凭证编号与归档 ──────────────────────────────────────────
    voucher_number = Column(String(30), unique=True, nullable=False, index=True)
    # 格式：EXP-YYYYMM-XXXX，年月取自收据实际日期，序号当月自增

    # ── 凭证类型 ────────────────────────────────────────────────
    receipt_type = Column(SAEnum(ReceiptType), nullable=True)

    # ── 日期 ────────────────────────────────────────────────────
    receipt_date = Column(Date, nullable=True)          # 收据上的实际日期（AI提取）
    upload_date = Column(DateTime, default=datetime.utcnow)  # 上传/扫描日期

    # ── 商户信息 ─────────────────────────────────────────────────
    vendor_name = Column(String(300), nullable=True)
    vendor_tax_id = Column(String(50), nullable=True)   # 内地纳税人识别号（增值税发票专属）
    vendor_address = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)           # 消费内容描述

    # ── 金额 ────────────────────────────────────────────────────
    currency = Column(String(3), default="HKD")         # 原始货币
    amount_original = Column(Numeric(15, 2), nullable=True)  # 不含税金额
    tax_rate = Column(Numeric(6, 4), nullable=True)     # 税率（如0.09表示9%）
    tax_amount = Column(Numeric(15, 2), nullable=True)  # 税额
    total_amount = Column(Numeric(15, 2), nullable=True)     # 含税总额
    amount_hkd = Column(Numeric(15, 2), nullable=True)  # 折算HKD总额

    # ── 内地增值税发票专属 ──────────────────────────────────────
    cn_invoice_code = Column(String(20), nullable=True)    # 发票代码（20位）
    cn_invoice_number = Column(String(10), nullable=True)  # 发票号码（8位）

    # ── 分类 ────────────────────────────────────────────────────
    category_id = Column(String(36), ForeignKey("expense_categories.id"), nullable=True)

    # ── AI 识别结果元数据 ──────────────────────────────────────
    ai_confidence = Column(Integer, nullable=True)      # AI置信度 0-100
    ai_raw_response = Column(Text, nullable=True)       # AI原始JSON（备查）

    # ── 原始凭证归档 ────────────────────────────────────────────
    receipt_image_path = Column(String(500), nullable=True)
    # 归档后相对路径：receipts_archive/YYYY-MM/EXP-YYYYMM-XXXX.jpg
    receipt_original_filename = Column(String(300), nullable=True)  # 原始文件名（备查）
    source_format = Column(String(10), nullable=True)   # 原始格式：jpg/png/heic/pdf
    file_hash = Column(String(64), nullable=True, index=True) # 凭证文件 SHA256，用于防重

    # ── 财政年度（香港4月-3月制）─────────────────────────────
    fiscal_year = Column(String(10), nullable=True)     # 如 "2023-24"
    # ── 来源追溯（薪资联动）────────────────────────────────────────
    # source_type: 'manual'（人工录入/AI扫描）/ 'payroll'（薪资确认自动生成）
    source_type = Column(String(20), nullable=True, default="manual", index=True)
    source_ref  = Column(String(36), nullable=True, index=True)
    # source_ref 含义：
    #   source_type='payroll' → PayrollRecord.id
    #   source_type='manual'  → None

    # ── 人工复核状态 ────────────────────────────────────────────────
    status = Column(SAEnum(ExpenseStatus), default=ExpenseStatus.pending)
    notes = Column(Text, nullable=True)                 # 人工备注

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # ── 关系 ────────────────────────────────────────────────────
    company = relationship("Company", back_populates="expenses")
    category = relationship("ExpenseCategory", back_populates="expenses")

    # ── 复合索引（常用查询优化）─────────────────────────────────
    __table_args__ = (
        Index("ix_expenses_company_fiscal", "company_id", "fiscal_year"),
        Index("ix_expenses_company_date", "company_id", "receipt_date"),
        Index("ix_expenses_company_status", "company_id", "status"),
    )
