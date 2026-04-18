import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey, Enum as SAEnum, Text, Integer
from sqlalchemy.orm import relationship
from database import Base
import enum


class UserRole(str, enum.Enum):
    admin = "admin"
    accountant = "accountant"
    viewer = "viewer"


class BusinessMode(str, enum.Enum):
    """公司业务模式 —— 控制 Dashboard KPI 与侧边栏导航的核心开关"""
    insurance_agent = "insurance_agent"  # 保险代理：佣金台账 + 佣金税务
    trading_sme     = "trading_sme"      # 贸易/服务业：发票+客户+应收
    freelancer      = "freelancer"       # 个人自由职业：简化版发票+支出
    holding         = "holding"          # 投资持股架构：仅支出账务


class CompanyLegalType(str, enum.Enum):
    """公司注册法律形式"""
    unlimited = "unlimited"  # 无限责任公司
    limited   = "limited"    # 有限公司
    sole_prop = "sole_prop"  # 独资经营


class ComplianceStatus(str, enum.Enum):
    pending = "pending"    # 待处理
    done    = "done"       # 已完成
    overdue = "overdue"    # 已逾期
    snoozed = "snoozed"   # 已延后提醒
    na      = "na"         # 不适用（事件触发型未触发）


class ComplianceCategory(str, enum.Enum):
    cr   = "cr"    # 公司注册处
    ird  = "ird"   # 税务局
    mpfa = "mpfa"  # 强积金管理局
    internal = "internal"  # 内部事项


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), default="free", nullable=False)  # admin, premium, free
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    company_accesses = relationship("UserCompanyAccess", back_populates="user")


class Company(Base):
    __tablename__ = "companies"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name_zh = Column(String(200), nullable=False)
    name_en = Column(String(200), nullable=True)
    cr_number = Column(String(20), nullable=True)           # 公司注册号
    br_number = Column(String(20), nullable=True)           # 商业登记号
    incorporation_date = Column(DateTime, nullable=True)    # 成立日期（用于NAR1）
    fiscal_year_end_month = Column(String(2), default="03") # 财政年度结束月（默认3月）
    base_currency = Column(String(3), default="HKD")
    address = Column(String(500), nullable=True)
    phone = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True)
    logo_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # 业务模式（控制 Dashboard 与导航的核心开关）
    business_mode = Column(String(50), default=BusinessMode.trading_sme, nullable=False)
    # 公司法律形式
    company_legal_type = Column(String(50), default=CompanyLegalType.limited, nullable=False)

    user_accesses = relationship("UserCompanyAccess", back_populates="company")
    clients = relationship("Client", back_populates="company")
    invoices = relationship("Invoice", back_populates="company")
    expenses = relationship("Expense", back_populates="company")
    commission_statements = relationship("CommissionStatement", back_populates="company")
    ir56m_statements = relationship("IR56MStatement", back_populates="company")
    tax_profile = relationship("CompanyTaxProfile", back_populates="company", uselist=False)
    compliance_items = relationship("ComplianceItem", back_populates="company", cascade="all, delete-orphan")
    employees = relationship("Employee", back_populates="company", cascade="all, delete-orphan")
    leases = relationship("Lease", back_populates="company", cascade="all, delete-orphan")



class UserCompanyAccess(Base):
    __tablename__ = "user_company_access"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=False)
    role = Column(SAEnum(UserRole), default=UserRole.admin)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="company_accesses")
    company = relationship("Company", back_populates="user_accesses")

class CompanyTaxProfile(Base):
    """个人入息课税（无限公司/独资）专属税务档案"""
    __tablename__ = "company_tax_profiles"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String(36), ForeignKey("companies.id"), unique=True, nullable=False)
    
    marital_status = Column(String(20), default="single") # single, married
    spouse_net_income = Column(String(50), default="0")   # 配偶净收入 (存字符串方便精度，但其实可用Float) 
    children_count = Column(String(10), default="0")      # 子女数目
    dependent_parents_60 = Column(String(10), default="0")# 60岁以上父母
    dependent_parents_55 = Column(String(10), default="0")# 55-59岁父母
    mpf_self_contribution = Column(String(50), default="0")# 强积金自雇供款 (上限18000)
    other_deductions = Column(String(50), default="0")    # 其他扣除

    company = relationship("Company", back_populates="tax_profile")


class ComplianceItem(Base):
    """合规事件台账 —— 每年按公司法律形式动态生成"""
    __tablename__ = "compliance_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=False)

    # 识别与分类
    code = Column(String(10), nullable=False)          # C01-C12
    fiscal_year = Column(String(10), nullable=False)   # "2025-26"
    title = Column(String(200), nullable=False)        # 合规项目名称
    title_en = Column(String(200), nullable=True)      # 英文名称
    category = Column(String(20), nullable=False)      # cr / ird / mpfa / internal
    applies_to = Column(String(100), nullable=False)   # 逗号分隔的法律形式列表
    legal_ref = Column(String(200), nullable=True)     # 法规依据（如 Cap.32 §641）
    authority = Column(String(100), nullable=True)     # 主管机构名称
    penalty_note = Column(Text, nullable=True)         # 罚则提示

    # 截止日期
    due_date = Column(DateTime, nullable=True)         # 计算所得或手动输入的截止日
    is_manual_date = Column(Boolean, default=False)    # True = 用户手动覆盖
    needs_manual = Column(Boolean, default=False)      # True = 缺少数据，需手动输入
    reminder_days_before = Column(Integer, default=30) # 提前几天提醒（默认30天）

    # 状态
    status = Column(String(20), default=ComplianceStatus.pending, nullable=False)
    completed_at = Column(DateTime, nullable=True)    # 标记完成的时间
    notes = Column(Text, nullable=True)               # 用户备注

    # 元数据
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company = relationship("Company", back_populates="compliance_items")
