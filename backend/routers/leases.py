from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, datetime, timedelta
import uuid
from dateutil.relativedelta import relativedelta

from database import get_db
from models.company import Company, UserRole, ComplianceItem
from models.lease import (
    Lease, LeasePayment, LeaseMiscFee, LeaseStatus, RentPaymentStatus, 
    PaymentFrequency, MiscFeeType
)
from schemas import (
    LeaseCreate, LeaseUpdate, LeaseOut, LeaseSummary,
    LeasePaymentUpdate, LeaseMiscFeeCreate, LeaseMiscFeeUpdate, LeaseMiscFeeOut, LeasePaymentOut
)
from models.company import User, UserCompanyAccess
from services.auth import get_current_user
from services.lease_expense_sync import sync_rent_payment_to_expense, sync_misc_fee_to_expense

def get_current_user_company_access(
    company_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    access = db.query(UserCompanyAccess).filter(
        UserCompanyAccess.company_id == company_id,
        UserCompanyAccess.user_id == current_user.id,
    ).first()
    if not access:
        raise HTTPException(status_code=403, detail="無此公司訪問權限")
    return access

router = APIRouter(prefix="/companies/{company_id}/leases", tags=["Leases"])


# ==============================================================================
# Helper
# ==============================================================================

def _generate_lease_number(company_id: str, db: Session) -> str:
    """LS-{companyShort}-001"""
    company = db.query(Company).filter(Company.id == company_id).first()
    # 提取短名，比如取公司名前两三个拼音首字母，这里简化取前两位大写或 "CO"
    name_prefix = ""
    if company.name_en:
        name_prefix = company.name_en.replace(" ", "")[:3].upper()
    else:
        name_prefix = company.name_zh[:2].encode('unicode_escape').decode('utf-8')[:3].upper() if company.name_zh else "CO"
        
    count = db.query(Lease).filter(Lease.company_id == company_id).count() + 1
    number = f"LS-{name_prefix}-{count:03d}"
    
    # 防重
    while db.query(Lease).filter(Lease.lease_number == number).first():
        count += 1
        number = f"LS-{name_prefix}-{count:03d}"
        
    return number

def _auto_update_lease_status(lease: Lease):
    """根据日期自动推断 status (不提交db)"""
    if lease.status == LeaseStatus.terminated:
        return
        
    today = date.today()
    if today < lease.start_date:
        lease.status = LeaseStatus.upcoming
    elif today > lease.end_date:
        lease.status = LeaseStatus.expired
    else:
        if (lease.end_date - today).days <= lease.renewal_notice_days:
            lease.status = LeaseStatus.expiring
        else:
            lease.status = LeaseStatus.active


# ==============================================================================
# LEASE CRUD
# ==============================================================================

@router.get("/", response_model=List[LeaseOut])
def get_leases(
    company_id: str,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    access=Depends(get_current_user_company_access)
):
    query = db.query(Lease).filter(Lease.company_id == company_id)
    if status:
        query = query.filter(Lease.status == status)
        
    leases = query.order_by(Lease.end_date.desc()).all()
    # 动态更新状态返回
    for l in leases:
        _auto_update_lease_status(l)
    return leases

@router.get("/summary", response_model=LeaseSummary)
def get_lease_summary(
    company_id: str,
    db: Session = Depends(get_db),
    access=Depends(get_current_user_company_access)
):
    leases = db.query(Lease).filter(Lease.company_id == company_id).all()
    
    total_rent = 0.0
    total_deposit = 0.0
    active = 0
    expiring = 0
    
    for l in leases:
        _auto_update_lease_status(l)
        if l.status in [LeaseStatus.active, LeaseStatus.expiring]:
            total_rent += float(l.monthly_rent)
            
        if l.deposit_status == "held":
            total_deposit += float(l.deposit_amount or 0)
            
        if l.status == LeaseStatus.active:
            active += 1
        elif l.status == LeaseStatus.expiring:
            expiring += 1
            
    return LeaseSummary(
        total_monthly_rent=total_rent,
        total_deposit=total_deposit,
        active_leases_count=active,
        expiring_leases_count=expiring
    )

@router.get("/{lease_id}", response_model=LeaseOut)
def get_lease(
    company_id: str,
    lease_id: str,
    db: Session = Depends(get_db),
    access=Depends(get_current_user_company_access)
):
    lease = db.query(Lease).filter(Lease.id == lease_id, Lease.company_id == company_id).first()
    if not lease:
        raise HTTPException(status_code=404, detail="Lease not found")
    _auto_update_lease_status(lease)
    return lease


@router.post("/", response_model=LeaseOut)
def create_lease(
    company_id: str,
    data: LeaseCreate,
    db: Session = Depends(get_db),
    access=Depends(get_current_user_company_access)
):
    if access.role == UserRole.viewer:
        raise HTTPException(403)
        
    lease_num = _generate_lease_number(company_id, db)
    
    lease = Lease(
        id=str(uuid.uuid4()),
        company_id=company_id,
        lease_number=lease_num,
        **data.model_dump()
    )
    _auto_update_lease_status(lease)
    db.add(lease)
    
    # 自动写入合规日历提醒 (作为 internal category)
    comp_item = ComplianceItem(
        id=str(uuid.uuid4()),
        company_id=company_id,
        code=f"LEASE-{lease_num}",
        fiscal_year=str(lease.end_date.year),
        title=f"租約即將到期 — {lease.property_name}",
        category="internal",
        applies_to="all",
        due_date=lease.end_date,
        reminder_days_before=lease.renewal_notice_days,
        notes=f"業主：{lease.landlord_name or '未知'}",
        status="pending"
    )
    db.add(comp_item)
    
    db.commit()
    db.refresh(lease)
    return lease

@router.put("/{lease_id}", response_model=LeaseOut)
def update_lease(
    company_id: str,
    lease_id: str,
    data: LeaseUpdate,
    db: Session = Depends(get_db),
    access=Depends(get_current_user_company_access)
):
    if access.role == UserRole.viewer:
        raise HTTPException(403)
        
    lease = db.query(Lease).filter(Lease.id == lease_id, Lease.company_id == company_id).first()
    if not lease:
        raise HTTPException(404)
        
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(lease, k, v)
        
    _auto_update_lease_status(lease)
    db.commit()
    db.refresh(lease)
    return lease

@router.delete("/{lease_id}")
def delete_lease(
    company_id: str,
    lease_id: str,
    db: Session = Depends(get_db),
    access=Depends(get_current_user_company_access)
):
    if access.role != UserRole.admin:
        raise HTTPException(403)
        
    lease = db.query(Lease).filter(Lease.id == lease_id, Lease.company_id == company_id).first()
    if not lease:
        raise HTTPException(404)
        
    # 同步删除相关的合规提醒
    db.query(ComplianceItem).filter(
        ComplianceItem.company_id == company_id, 
        ComplianceItem.code == f"LEASE-{lease.lease_number}"
    ).delete()
    
    db.delete(lease)
    db.commit()
    return {"success": True}


# ==============================================================================
# LEASE PAYMENTS
# ==============================================================================

@router.post("/{lease_id}/generate-payments")
def generate_payments(
    company_id: str,
    lease_id: str,
    months_to_generate: int = Query(12, ge=1, le=60),
    db: Session = Depends(get_db),
    access=Depends(get_current_user_company_access)
):
    """
    批量生成未来N个月/季度的付款计划
    """
    if access.role == UserRole.viewer:
        raise HTTPException(403)
        
    lease = db.query(Lease).filter(Lease.id == lease_id, Lease.company_id == company_id).first()
    if not lease:
        raise HTTPException(404)
        
    # 找到最近一次的 end_date，如果没有则从 lease.start_date 开始
    last_payment = db.query(LeasePayment).filter(LeasePayment.lease_id == lease_id)\
                     .order_by(LeasePayment.period_start.desc()).first()
                     
    if last_payment:
        current_date = last_payment.period_end + timedelta(days=1)
    else:
        current_date = lease.start_date
        
    generated = 0
    freq = lease.payment_frequency
    
    months_step = 1
    if freq == PaymentFrequency.quarterly: months_step = 3
    elif freq == PaymentFrequency.annual: months_step = 12
    
    amount_due = float(lease.monthly_rent) * months_step
    
    # 按期望的推进月份来计算
    while generated < (months_to_generate / months_step) and current_date < lease.end_date:
        period_start = current_date
        period_end = period_start + relativedelta(months=months_step) - timedelta(days=1)
        
        # 修正：最后不要超过 lease.end_date
        if period_end > lease.end_date:
            period_end = lease.end_date
            
        # 到期日计算（当期第几日）
        due_date = period_start + timedelta(days=max(0, lease.rent_due_day - 1))
        
        # Label 生成
        if freq == PaymentFrequency.monthly:
            label = period_start.strftime("%Y-%m")
        elif freq == PaymentFrequency.quarterly:
            q = (period_start.month - 1) // 3 + 1
            label = f"{period_start.year}-Q{q}"
        else:
            from services.mpf_calculator import get_hk_fiscal_year
            label = get_hk_fiscal_year(period_start.year, period_start.month)
            
        lp = LeasePayment(
            id=str(uuid.uuid4()),
            lease_id=lease.id,
            company_id=company_id,
            period_label=label,
            period_start=period_start,
            period_end=period_end,
            due_date=due_date,
            amount=amount_due,
            currency=lease.rent_currency,
            status=RentPaymentStatus.pending
        )
        db.add(lp)
        generated += 1
        current_date = period_end + timedelta(days=1)

    db.commit()
    return {"generated_count": generated}


@router.put("/payments/{payment_id}")
def update_payment(
    company_id: str,
    payment_id: str,
    data: LeasePaymentUpdate,
    db: Session = Depends(get_db),
    access=Depends(get_current_user_company_access)
):
    """确认付款（触发 expense 同步）"""
    if access.role == UserRole.viewer:
        raise HTTPException(403)
        
    payment = db.query(LeasePayment).filter(
        LeasePayment.id == payment_id, LeasePayment.company_id == company_id
    ).first()
    if not payment:
        raise HTTPException(404)
        
    was_pending = payment.status == RentPaymentStatus.pending
    
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(payment, k, v)
        
    # 如果状态被标记为 paid，自动触发联动
    if was_pending and payment.status == RentPaymentStatus.paid:
        if not payment.amount_paid:
            payment.amount_paid = payment.amount
        if not payment.paid_date:
            payment.paid_date = date.today()
            
        sync_result = sync_rent_payment_to_expense(payment.id, db)
        payment.expense_voucher_id = sync_result.get("expense_id")
        
    db.commit()
    return {"success": True}


@router.delete("/payments/{payment_id}")
def delete_payment(
    company_id: str,
    payment_id: str,
    db: Session = Depends(get_db),
    access=Depends(get_current_user_company_access)
):
    """删除某条待付/已付租金计划"""
    if access.role == UserRole.viewer:
        raise HTTPException(403)
        
    payment = db.query(LeasePayment).filter(
        LeasePayment.id == payment_id, LeasePayment.company_id == company_id
    ).first()
    if not payment:
        raise HTTPException(404)
        
    # 如果已生成支出凭证，同时删除对应的凭证
    if payment.expense_voucher_id:
        from models.expense import Expense
        expense = db.query(Expense).filter(Expense.id == payment.expense_voucher_id).first()
        if expense:
            db.delete(expense)
            
    db.delete(payment)
    db.commit()
    return {"success": True}


# ==============================================================================
# MISC FEES (杂费)
# ==============================================================================

@router.post("/{lease_id}/misc", response_model=LeaseMiscFeeOut)
def create_misc_fee(
    company_id: str,
    lease_id: str,
    data: LeaseMiscFeeCreate,
    db: Session = Depends(get_db),
    access=Depends(get_current_user_company_access)
):
    if access.role == UserRole.viewer:
        raise HTTPException(403)
        
    fee = LeaseMiscFee(
        id=str(uuid.uuid4()),
        lease_id=lease_id,
        company_id=company_id,
        **data.model_dump()
    )
    db.add(fee)
    db.commit()
    db.refresh(fee)
    return fee

@router.put("/misc/{fee_id}")
def update_misc_fee(
    company_id: str,
    fee_id: str,
    data: LeaseMiscFeeUpdate,
    db: Session = Depends(get_db),
    access=Depends(get_current_user_company_access)
):
    fee = db.query(LeaseMiscFee).filter(LeaseMiscFee.id == fee_id, LeaseMiscFee.company_id == company_id).first()
    if not fee:
        raise HTTPException(404)
        
    was_pending = fee.status == "pending"
    
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(fee, k, v)
        
    if was_pending and fee.status == "paid":
        if not fee.paid_date:
            fee.paid_date = date.today()
        # 触发同步
        sync_result = sync_misc_fee_to_expense(fee.id, db)
        fee.expense_voucher_id = sync_result.get("expense_id")
        
    db.commit()
    return {"success": True}

@router.delete("/misc/{fee_id}")
def delete_misc_fee(
    company_id: str,
    fee_id: str,
    db: Session = Depends(get_db),
    access=Depends(get_current_user_company_access)
):
    if access.role == UserRole.viewer:
        raise HTTPException(403)
        
    fee = db.query(LeaseMiscFee).filter(LeaseMiscFee.id == fee_id, LeaseMiscFee.company_id == company_id).first()
    if not fee:
        raise HTTPException(404)
        
    db.delete(fee)
    db.commit()
    return {"success": True}
