"""
commission.py — 佣金收入台账数据模型

对应 AIA International Limited Agent Statement Summary 月结单结构。
每条记录 = 一个自然月的结算单。
"""
import uuid
import enum
from datetime import datetime
from sqlalchemy import (
    Column, String, DateTime, Boolean, ForeignKey,
    Numeric, Text, Integer, Enum as SAEnum, Index
)
from sqlalchemy.orm import relationship
from database import Base


class CommissionStatus(str, enum.Enum):
    pending   = "pending"    # 待人工复核（AI 识别后默认状态）
    confirmed = "confirmed"  # 已人工确认
    rejected  = "rejected"   # 已驳回（识别错误/重复）


class CommissionStatement(Base):
    """
    佣金月结单主表

    每条记录对应保险公司一个自然月的 Agent Statement Summary。
    金融字段对应截图中各行数据：
      Sub-total A = first_year_commission  (首年佣金)
      Sub-total B = renewal_commission     (续保佣金)
      C           = other_taxable_income   (其他应税収入)
      A+B+C       = total_taxable_income   ← BIR60 申报使用
    """
    __tablename__ = "commission_statements"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=False)

    # ── 结算单基本信息 ────────────────────────────────────────────
    insurer_name   = Column(String(200), nullable=False, default="AIA International Limited")
    agent_code     = Column(String(50),  nullable=True)   # 如 "09201-D6400"
    agent_name     = Column(String(100), nullable=True)   # 如 "WU DI"
    statement_month = Column(String(7),  nullable=False, index=True)
    # 格式 "YYYY-MM"，如 "2025-12"

    fiscal_year    = Column(String(10),  nullable=True, index=True)
    # 港税财年，如 "2025-26"

    # ── 首年佣金 (Sub-total A) ────────────────────────────────────
    fyc_life_annual      = Column(Numeric(15, 2), nullable=True)   # Life Annual
    fyc_life_semi_annual = Column(Numeric(15, 2), nullable=True)
    fyc_life_quarterly   = Column(Numeric(15, 2), nullable=True)
    fyc_life_monthly     = Column(Numeric(15, 2), nullable=True)
    fyc_life_extra       = Column(Numeric(15, 2), nullable=True)   # 10% Extra
    fyc_pa               = Column(Numeric(15, 2), nullable=True)   # Personal Accident
    fyc_mpf              = Column(Numeric(15, 2), nullable=True)
    fyc_subtotal         = Column(Numeric(15, 2), nullable=True)   # Sub-total A ★

    # ── 续保佣金 (Sub-total B) ────────────────────────────────────
    renewal_life         = Column(Numeric(15, 2), nullable=True)
    renewal_pa           = Column(Numeric(15, 2), nullable=True)
    renewal_mpf          = Column(Numeric(15, 2), nullable=True)
    renewal_subtotal     = Column(Numeric(15, 2), nullable=True)   # Sub-total B ★

    # ── 其他应税收入 (C) ──────────────────────────────────────────
    other_taxable_income = Column(Numeric(15, 2), nullable=True)   # C ★

    # ── 汇总行（BIR60 直接使用）──────────────────────────────────
    total_taxable_income = Column(Numeric(15, 2), nullable=True)   # A+B+C ★★★
    misc_deduction       = Column(Numeric(15, 2), nullable=True)   # MISC. INCOME & DEDUCTION（通常为负）
    allowance_offset     = Column(Numeric(15, 2), nullable=True)   # INITIAL FYC / ALLOWANCE（通常为负）
    payment_this_month   = Column(Numeric(15, 2), nullable=True)   # 实际到账金额

    # ── YTD 数据（用于年度核对）──────────────────────────────────
    ytd_fyc_subtotal     = Column(Numeric(15, 2), nullable=True)   # YTD Sub-total A
    ytd_renewal_subtotal = Column(Numeric(15, 2), nullable=True)   # YTD Sub-total B
    ytd_other_income     = Column(Numeric(15, 2), nullable=True)   # YTD C
    ytd_total_taxable    = Column(Numeric(15, 2), nullable=True)   # YTD A+B+C ★（年度核对）
    ytd_payment          = Column(Numeric(15, 2), nullable=True)   # YTD 实际到账

    # ── 原始图片 ──────────────────────────────────────────────────
    source_image_path      = Column(String(500), nullable=True)
    # 归档路径：statements_archive/YYYY-MM/STMT-YYYYMM-XXXX.jpg
    source_original_filename = Column(String(300), nullable=True)  # 原始文件名

    # ── AI 识别元数据 ─────────────────────────────────────────────
    ai_confidence  = Column(Integer, nullable=True)   # 0-100
    ai_raw_response = Column(Text, nullable=True)     # AI 原始 JSON（备查/调试）

    # ── 人工复核状态 ──────────────────────────────────────────────
    status = Column(SAEnum(CommissionStatus), default=CommissionStatus.pending, nullable=False)
    notes  = Column(Text, nullable=True)   # 人工备注

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # ── 关系 ──────────────────────────────────────────────────────
    company = relationship("Company", back_populates="commission_statements")

    # ── 复合索引 ──────────────────────────────────────────────────
    __table_args__ = (
        Index("ix_stmt_company_month",  "company_id", "statement_month"),
        Index("ix_stmt_company_fiscal", "company_id", "fiscal_year"),
        Index("ix_stmt_company_status", "company_id", "status"),
    )


class IR56MStatement(Base):
    """
    年度综合报酬申报表 (IR56M)
    作为最终确定财年「应评税收入」的最高优先级凭证
    """
    __tablename__ = "ir56m_statements"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=False)

    payer_name = Column(String(200), default="AIA INTERNATIONAL LIMITED")
    agent_code = Column(String(50), nullable=True)     # 例如 0920100000D6400
    agent_name = Column(String(100), nullable=True)    # 例如 WU, DI
    
    # 时段区间 "01/04/2024 TO 31/03/2025"
    period_start = Column(String(30), nullable=True)
    period_end = Column(String(30), nullable=True)
    fiscal_year = Column(String(10), nullable=True, index=True) # 解析为 "2024-25"

    total_income = Column(Numeric(15, 2), nullable=True)    # 最终的 COMMISSION TOTAL 收入

    source_image_path = Column(String(500), nullable=True)
    source_original_filename = Column(String(300), nullable=True)

    ai_confidence = Column(Integer, nullable=True)
    ai_raw_response = Column(Text, nullable=True)

    status = Column(SAEnum(CommissionStatus), default=CommissionStatus.pending, nullable=False)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company = relationship("Company", back_populates="ir56m_statements")

    __table_args__ = (
        Index("ix_ir56m_company_fiscal", "company_id", "fiscal_year"),
        Index("ix_ir56m_company_status", "company_id", "status"),
    )
