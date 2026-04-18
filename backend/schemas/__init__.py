from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from uuid import UUID


# ─── Auth ───────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    name: str
    role: str


# ─── User ───────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str


class UserOut(BaseModel):
    id: UUID
    email: str
    name: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True


# ─── Company ─────────────────────────────────────────────────────────────────

class CompanyCreate(BaseModel):
    name_zh: str
    name_en: Optional[str] = None
    cr_number: Optional[str] = None
    br_number: Optional[str] = None
    incorporation_date: Optional[datetime] = None
    fiscal_year_end_month: Optional[str] = "03"
    base_currency: Optional[str] = "HKD"
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    business_mode: Optional[str] = "trading_sme"       # 业务模式
    company_legal_type: Optional[str] = "limited"      # 公司法律形式


class CompanyUpdate(CompanyCreate):
    name_zh: Optional[str] = None


class CompanyOut(BaseModel):
    id: UUID
    name_zh: str
    name_en: Optional[str]
    cr_number: Optional[str]
    br_number: Optional[str]
    incorporation_date: Optional[datetime]
    fiscal_year_end_month: str
    base_currency: str
    address: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    logo_url: Optional[str]
    is_active: bool
    business_mode: str = "trading_sme"
    company_legal_type: str = "limited"

    class Config:
        from_attributes = True


class CompanyTaxProfileBase(BaseModel):
    marital_status: str = "single"
    spouse_net_income: str = "0"
    children_count: str = "0"
    dependent_parents_60: str = "0"
    dependent_parents_55: str = "0"
    mpf_self_contribution: str = "0"
    other_deductions: str = "0"

class CompanyTaxProfileUpdate(CompanyTaxProfileBase):
    pass

class CompanyTaxProfileOut(CompanyTaxProfileBase):
    id: UUID
    company_id: UUID

    class Config:
        from_attributes = True


# ─── Client ──────────────────────────────────────────────────────────────────

class ClientCreate(BaseModel):
    name_zh: str
    name_en: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None


class ClientUpdate(ClientCreate):
    name_zh: Optional[str] = None


class ClientOut(BaseModel):
    id: UUID
    company_id: UUID
    name_zh: str
    name_en: Optional[str]
    contact_person: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    address: Optional[str]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Invoice ─────────────────────────────────────────────────────────────────

class InvoiceItemCreate(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float
    amount: Optional[float] = None
    sort_order: int = 0


class InvoiceItemOut(InvoiceItemCreate):
    id: UUID

    class Config:
        from_attributes = True


class InvoiceCreate(BaseModel):
    client_id: Optional[UUID] = None
    invoice_number: Optional[str] = None   # 如未填，系统自动生成
    invoice_type: str = "invoice"
    client_name: str
    client_address: Optional[str] = None
    client_email: Optional[str] = None
    issue_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    currency: str = "HKD"
    discount_amount: float = 0
    notes: Optional[str] = None
    terms: Optional[str] = None
    bank_info: Optional[str] = None
    items: list[InvoiceItemCreate] = []


class InvoiceUpdate(InvoiceCreate):
    client_name: Optional[str] = None
    items: Optional[list[InvoiceItemCreate]] = None


class PaymentOut(BaseModel):
    id: UUID
    payment_date: datetime
    amount: float
    method: str
    reference: Optional[str]
    notes: Optional[str]

    class Config:
        from_attributes = True


class InvoiceOut(BaseModel):
    id: UUID
    company_id: UUID
    client_id: Optional[UUID]
    invoice_number: str
    invoice_type: str
    status: str
    client_name: str
    client_address: Optional[str]
    client_email: Optional[str]
    issue_date: datetime
    due_date: Optional[datetime]
    currency: str
    subtotal: float
    discount_amount: float
    tax_amount: float
    total_amount: float
    paid_amount: float
    balance_due: float
    notes: Optional[str]
    terms: Optional[str]
    bank_info: Optional[str]
    created_at: datetime
    updated_at: datetime
    items: list[InvoiceItemOut] = []
    payments: list[PaymentOut] = []

    class Config:
        from_attributes = True


# ─── Payment ─────────────────────────────────────────────────────────────────

class PaymentCreate(BaseModel):
    payment_date: Optional[datetime] = None
    amount: float
    method: str = "bank_transfer"
    reference: Optional[str] = None
    notes: Optional[str] = None


# ─── Dashboard ───────────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_outstanding: float        # 总待收
    total_overdue: float            # 总逾期
    total_paid_this_month: float    # 本月已收
    invoice_count_by_status: dict   # {status: count}
    recent_invoices: list           # 最近10张发票摘要
    
    # 代理人专有字段
    commission_ytd: float = 0.0     # 本财年佣金累计
    commission_last_month: float = 0.0 # 上月佣金
    expense_ytd: float = 0.0        # 本财年可抵扣支出累计
    
    fiscal_year: Optional[str] = None # 目标财年标识


# ─── HR ──────────────────────────────────────────────────────────────────────

from datetime import date as date_type


class EmployeeCreate(BaseModel):
    name_zh: str
    name_en: Optional[str] = None
    hkid: Optional[str] = None                    # 原文，存储前由路由层加密
    gender: Optional[str] = None
    date_of_birth: Optional[date_type] = None
    position: Optional[str] = None
    department: Optional[str] = None
    employment_type: str = "full_time"
    hire_date: Optional[date_type] = None
    base_salary: Optional[float] = None
    salary_type: str = "monthly"
    is_continuous_contract: bool = True
    mpf_scheme: Optional[str] = None
    mpf_member_no: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None            # 原文，存储前加密
    email: Optional[str] = None
    phone: Optional[str] = None
    emergency_contact: Optional[str] = None
    notes: Optional[str] = None


class EmployeeUpdate(EmployeeCreate):
    name_zh: Optional[str] = None


class EmployeeOut(BaseModel):
    id: UUID
    company_id: UUID
    employee_number: str
    name_zh: str
    name_en: Optional[str]
    hkid_masked: Optional[str] = None              # 脱敏后（如 A***456(7)）
    gender: Optional[str]
    date_of_birth: Optional[date_type]
    position: Optional[str]
    department: Optional[str]
    employment_type: str
    hire_date: Optional[date_type]
    termination_date: Optional[date_type]
    is_active: bool
    base_salary: Optional[float]
    salary_type: str
    is_continuous_contract: bool
    mpf_scheme: Optional[str]
    mpf_member_no: Optional[str]
    bank_name: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    emergency_contact: Optional[str]
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class EmployeeTerminate(BaseModel):
    termination_date: date_type


# ── Payroll ───────────────────────────────────────────────────────────────────

class PayrollCreate(BaseModel):
    employee_id: UUID
    payroll_month: str                    # YYYY-MM
    base_salary: float
    bonus: float = 0.0
    allowances: float = 0.0
    overtime_pay: float = 0.0
    notes: Optional[str] = None


class PayrollUpdate(BaseModel):
    base_salary: Optional[float] = None
    bonus: Optional[float] = None
    allowances: Optional[float] = None
    overtime_pay: Optional[float] = None
    notes: Optional[str] = None


class PayrollOut(BaseModel):
    id: UUID
    company_id: UUID
    employee_id: UUID
    employee_name: Optional[str] = None  # 冗余字段，由路由层注入
    payroll_month: str
    base_salary: float
    bonus: float
    allowances: float
    overtime_pay: float
    gross_pay: float
    employee_mpf: float
    employer_mpf: float
    mpf_exempt: bool
    net_pay: float
    tax_year: Optional[str]
    status: str
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class PayrollMPFSummary(BaseModel):
    """月度MPF供款汇总（用于eMPF报表页）"""
    payroll_month: str
    total_employees: int
    total_gross_pay: float
    total_employee_mpf: float
    total_employer_mpf: float
    total_mpf: float                    # 雇主+雇员合计
    records: list["PayrollOut"] = []


# ── Leave ─────────────────────────────────────────────────────────────────────

class LeaveRequestCreate(BaseModel):
    employee_id: UUID
    leave_type: str
    start_date: date_type
    end_date: date_type
    days: float
    reason: Optional[str] = None


class LeaveRequestApprove(BaseModel):
    approved: bool
    notes: Optional[str] = None


class LeaveRequestOut(BaseModel):
    id: UUID
    company_id: UUID
    employee_id: UUID
    employee_name: Optional[str] = None
    leave_type: str
    start_date: date_type
    end_date: date_type
    days: float
    reason: Optional[str]
    status: str
    approved_at: Optional[datetime]
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class LeaveBalanceOut(BaseModel):
    id: UUID
    employee_id: UUID
    employee_name: Optional[str] = None
    year: int
    annual_leave_entitled: int
    annual_leave_taken: int
    annual_leave_balance: int
    sick_leave_entitled: int
    sick_leave_taken: int
    statutory_holidays: int

    class Config:
        from_attributes = True


# ── Lease ─────────────────────────────────────────────────────────────────────

from .lease import (
    LeaseCreate, LeaseUpdate, LeaseOut,
    LeasePaymentCreate, LeasePaymentUpdate, LeasePaymentOut,
    LeaseMiscFeeCreate, LeaseMiscFeeUpdate, LeaseMiscFeeOut,
    LeaseSummary
)


