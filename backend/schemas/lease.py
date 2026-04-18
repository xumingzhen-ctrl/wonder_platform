# ── Lease (物业租约) ─────────────────────────────────────────────────────────

from uuid import UUID
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel

class LeasePaymentCreate(BaseModel):
    # 手动添加付款记录的情况较少，主要是系统批量生成
    period_label: str
    period_start: date
    period_end: date
    due_date: date
    amount: float
    currency: str = "HKD"

class LeasePaymentUpdate(BaseModel):
    # 用于确认付款
    amount_paid: Optional[float] = None
    paid_date: Optional[date] = None
    payment_method: Optional[str] = None
    reference_no: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class LeasePaymentOut(BaseModel):
    id: UUID
    lease_id: UUID
    company_id: UUID
    period_label: str
    period_start: date
    period_end: date
    due_date: date
    amount: float
    amount_paid: Optional[float]
    currency: str
    amount_hkd: Optional[float]
    paid_date: Optional[date]
    payment_method: Optional[str]
    reference_no: Optional[str]
    status: str
    expense_voucher_id: Optional[str]
    notes: Optional[str]
    
    class Config:
        from_attributes = True

class LeaseMiscFeeCreate(BaseModel):
    fee_type: str
    description: str
    amount: float
    currency: str = "HKD"
    due_date: Optional[date] = None
    is_tax_deductible: bool = True
    notes: Optional[str] = None

class LeaseMiscFeeUpdate(BaseModel):
    description: Optional[str] = None
    amount: Optional[float] = None
    due_date: Optional[date] = None
    paid_date: Optional[date] = None
    payment_method: Optional[str] = None
    reference_no: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class LeaseMiscFeeOut(BaseModel):
    id: UUID
    lease_id: UUID
    company_id: UUID
    fee_type: str
    description: Optional[str]
    amount: float
    currency: str
    amount_hkd: Optional[float]
    due_date: Optional[date]
    paid_date: Optional[date]
    payment_method: Optional[str]
    reference_no: Optional[str]
    is_tax_deductible: bool
    status: str
    expense_voucher_id: Optional[str]
    notes: Optional[str]
    
    class Config:
        from_attributes = True

class LeaseCreate(BaseModel):
    property_name: str
    property_address: Optional[str] = None
    property_type: str = "office"
    landlord_name: Optional[str] = None
    landlord_contact: Optional[str] = None
    start_date: date
    end_date: date
    monthly_rent: float
    rent_currency: str = "HKD"
    payment_frequency: str = "monthly"
    rent_due_day: int = 1
    deposit_amount: Optional[float] = None
    deposit_currency: str = "HKD"
    deposit_paid_date: Optional[date] = None
    renewal_notice_days: int = 60
    auto_renewal: bool = False
    notes: Optional[str] = None

class LeaseUpdate(BaseModel):
    property_name: Optional[str] = None
    property_address: Optional[str] = None
    property_type: Optional[str] = None
    landlord_name: Optional[str] = None
    landlord_contact: Optional[str] = None
    end_date: Optional[date] = None
    monthly_rent: Optional[float] = None
    deposit_amount: Optional[float] = None
    deposit_status: Optional[str] = None
    deposit_returned_date: Optional[date] = None
    deposit_returned_amount: Optional[float] = None
    deposit_notes: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class LeaseOut(BaseModel):
    id: UUID
    company_id: UUID
    lease_number: str
    property_name: str
    property_address: Optional[str]
    property_type: str
    landlord_name: Optional[str]
    landlord_contact: Optional[str]
    start_date: date
    end_date: date
    monthly_rent: float
    rent_currency: str
    payment_frequency: str
    rent_due_day: int
    deposit_amount: Optional[float]
    deposit_currency: str
    deposit_paid_date: Optional[date]
    deposit_status: str
    deposit_returned_date: Optional[date]
    deposit_returned_amount: Optional[float]
    deposit_notes: Optional[str]
    renewal_notice_days: int
    auto_renewal: bool
    status: str
    notes: Optional[str]
    created_at: datetime
    
    # 嵌套关系
    payments: list[LeasePaymentOut] = []
    misc_fees: list[LeaseMiscFeeOut] = []
    
    class Config:
        from_attributes = True

class LeaseSummary(BaseModel):
    total_monthly_rent: float
    total_deposit: float
    active_leases_count: int
    expiring_leases_count: int
