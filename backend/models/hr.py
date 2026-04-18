"""
HR 员工管理数据模型
包含：Employee（员工档案）/ PayrollRecord（薪资记录）/
      LeaveBalance（假期余额）/ LeaveRequest（假期申请）
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


# ─── 枚举定义 ──────────────────────────────────────────────────────────────────

class EmploymentType(str, enum.Enum):
    full_time = "full_time"     # 全职
    part_time = "part_time"     # 兼职
    contract  = "contract"      # 合约工

class SalaryType(str, enum.Enum):
    monthly = "monthly"   # 月薪
    daily   = "daily"     # 日薪
    hourly  = "hourly"    # 时薪

class PayrollStatus(str, enum.Enum):
    draft     = "draft"      # 草稿（待确认）
    confirmed = "confirmed"  # 已确认

class LeaveType(str, enum.Enum):
    annual     = "annual"      # 年假
    sick       = "sick"        # 病假
    statutory  = "statutory"   # 法定假日
    no_pay     = "no_pay"      # 无薪假
    maternity  = "maternity"   # 产假
    paternity  = "paternity"   # 侍产假

class LeaveStatus(str, enum.Enum):
    pending  = "pending"   # 待审批
    approved = "approved"  # 已批准
    rejected = "rejected"  # 已驳回


# ─── 员工档案 ──────────────────────────────────────────────────────────────────

class Employee(Base):
    """员工档案主表"""
    __tablename__ = "employees"

    id         = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=False)

    # ── 编号与基本信息 ───────────────────────────────────────────────────────────
    employee_number = Column(String(20), nullable=False)  # 如 EMP-001，按公司自增
    name_zh = Column(String(100), nullable=False)         # 中文姓名
    name_en = Column(String(100), nullable=True)          # 英文姓名（用于薪资单/eMPF）
    hkid    = Column(String(200), nullable=True)          # HKID，AES加密存储
    gender  = Column(String(10), nullable=True)           # male / female / other
    date_of_birth = Column(Date, nullable=True)

    # ── 职位与部门 ────────────────────────────────────────────────────────────────
    position   = Column(String(100), nullable=True)   # 职位
    department = Column(String(100), nullable=True)   # 部门

    # ── 雇佣类型与日期 ────────────────────────────────────────────────────────────
    employment_type = Column(SAEnum(EmploymentType), default=EmploymentType.full_time)
    hire_date        = Column(Date, nullable=True)    # 入职日期
    termination_date = Column(Date, nullable=True)   # 离职日期（空 = 在职）
    is_active        = Column(Boolean, default=True) # 在职状态

    # ── 薪酬 ──────────────────────────────────────────────────────────────────────
    base_salary = Column(Numeric(12, 2), nullable=True)  # 基本月薪 HKD
    salary_type = Column(SAEnum(SalaryType), default=SalaryType.monthly)

    # 468规则：4周内工时≥68小时 → 连续合同（享受劳工条例保护）
    is_continuous_contract = Column(Boolean, default=True)

    # ── MPF 强积金 ────────────────────────────────────────────────────────────────
    mpf_scheme    = Column(String(100), nullable=True)  # MPF 计划名称（如宏利强积金）
    mpf_member_no = Column(String(50), nullable=True)   # eMPF 平台成员编号（Bulk Upload用）

    # ── 银行信息（加密存储）────────────────────────────────────────────────────────
    bank_name    = Column(String(100), nullable=True)   # 银行名称
    bank_account = Column(String(200), nullable=True)   # 银行账号（AES加密）

    # ── 联系方式 ────────────────────────────────────────────────────────────────────
    email             = Column(String(255), nullable=True)
    phone             = Column(String(50), nullable=True)
    emergency_contact = Column(String(200), nullable=True)  # 紧急联系人（姓名+关系+电话）

    notes      = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # ── 关系 ──────────────────────────────────────────────────────────────────────
    company         = relationship("Company", back_populates="employees")
    payroll_records = relationship("PayrollRecord", back_populates="employee", cascade="all, delete-orphan")
    leave_balances  = relationship("LeaveBalance", back_populates="employee", cascade="all, delete-orphan")
    leave_requests  = relationship("LeaveRequest", back_populates="employee", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_employees_company_active", "company_id", "is_active"),
        Index("ix_employees_company_number", "company_id", "employee_number"),
    )


# ─── 薪资记录 ──────────────────────────────────────────────────────────────────

class PayrollRecord(Base):
    """每月薪资单记录"""
    __tablename__ = "payroll_records"

    id          = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id  = Column(String(36), ForeignKey("companies.id"), nullable=False)
    employee_id = Column(String(36), ForeignKey("employees.id"), nullable=False)

    payroll_month = Column(String(7), nullable=False)  # YYYY-MM 格式

    # ── 应发收入 ────────────────────────────────────────────────────────────────
    base_salary   = Column(Numeric(12, 2), default=0)  # 底薪
    bonus         = Column(Numeric(12, 2), default=0)  # 奖金
    allowances    = Column(Numeric(12, 2), default=0)  # 津贴（交通/餐饮等）
    overtime_pay  = Column(Numeric(12, 2), default=0)  # 加班费
    gross_pay     = Column(Numeric(12, 2), default=0)  # 应发合计（Relevant Income for MPF）

    # ── MPF 强积金供款 ────────────────────────────────────────────────────────────
    # 规则：各5%，供款上限HK$1,500；月薪<HK$7,100时雇员豁免（雇主不豁免）
    employee_mpf  = Column(Numeric(10, 2), default=0)  # 雇员强制供款
    employer_mpf  = Column(Numeric(10, 2), default=0)  # 雇主强制供款
    mpf_exempt    = Column(Boolean, default=False)      # 雇员是否享受豁免（月薪<7100）

    # ── 实发金额 ────────────────────────────────────────────────────────────────
    net_pay       = Column(Numeric(12, 2), default=0)   # 实发工资 = gross - employee_mpf

    # ── 税务归属 ────────────────────────────────────────────────────────────────
    tax_year   = Column(String(10), nullable=True)  # 香港财年，如 "2025-26"

    # ── 状态 ────────────────────────────────────────────────────────────────────
    status     = Column(SAEnum(PayrollStatus), default=PayrollStatus.draft)
    notes      = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # ── 关系 ────────────────────────────────────────────────────────────────────
    company  = relationship("Company")
    employee = relationship("Employee", back_populates="payroll_records")

    __table_args__ = (
        Index("ix_payroll_company_month", "company_id", "payroll_month"),
        Index("ix_payroll_employee_month", "employee_id", "payroll_month"),
    )


# ─── 假期余额 ──────────────────────────────────────────────────────────────────

class LeaveBalance(Base):
    """每名员工每年的假期余额账本"""
    __tablename__ = "leave_balances"

    id          = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id  = Column(String(36), ForeignKey("companies.id"), nullable=False)
    employee_id = Column(String(36), ForeignKey("employees.id"), nullable=False)
    year        = Column(Integer, nullable=False)  # 公历年份（如 2025）

    # ── 年假 ── 《雇佣条例》附表3：1-2年=7天；3-8年每年+1天；9年+=14天 ───────────
    annual_leave_entitled = Column(Integer, default=7)   # 本年应享年假
    annual_leave_taken    = Column(Integer, default=0)   # 已用年假天数
    annual_leave_balance  = Column(Integer, default=7)   # 剩余年假

    # ── 有薪病假 ───────────────────────────────────────────────────────────────────
    # 规则：连续受雇满1个月起每月累积2天，上限36天；连续4天或以上须医生证明
    sick_leave_entitled = Column(Integer, default=0)    # 本年可用有薪病假
    sick_leave_taken    = Column(Integer, default=0)    # 已用有薪病假

    # ── 法定假日 ── 2024年起香港17天 ──────────────────────────────────────────────
    statutory_holidays = Column(Integer, default=17)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    employee = relationship("Employee", back_populates="leave_balances")

    __table_args__ = (
        Index("ix_leave_balance_emp_year", "employee_id", "year", unique=True),
    )


# ─── 假期申请 ──────────────────────────────────────────────────────────────────

class LeaveRequest(Base):
    """假期申请记录"""
    __tablename__ = "leave_requests"

    id          = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id  = Column(String(36), ForeignKey("companies.id"), nullable=False)
    employee_id = Column(String(36), ForeignKey("employees.id"), nullable=False)

    leave_type = Column(SAEnum(LeaveType), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date   = Column(Date, nullable=False)
    days       = Column(Numeric(4, 1), nullable=False)  # 支持半天（0.5天）
    reason     = Column(Text, nullable=True)

    status      = Column(SAEnum(LeaveStatus), default=LeaveStatus.pending)
    approved_at = Column(DateTime, nullable=True)
    notes       = Column(Text, nullable=True)  # 审批意见

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    employee = relationship("Employee", back_populates="leave_requests")

    __table_args__ = (
        Index("ix_leave_req_company_status", "company_id", "status"),
        Index("ix_leave_req_employee", "employee_id", "start_date"),
    )
