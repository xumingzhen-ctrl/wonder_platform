from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime
from decimal import Decimal
import io

from database import get_db
from models.company import User, Company, UserCompanyAccess
from models.invoice import Invoice, InvoiceItem, Payment, InvoiceStatus
from schemas import InvoiceCreate, InvoiceUpdate, InvoiceOut, PaymentCreate, DashboardStats
from services.auth import get_current_user
from services.pdf_generator import generate_invoice_pdf

router = APIRouter(prefix="/companies/{company_id}", tags=["發票管理"])


def _check_access(company_id: str, user: User, db: Session) -> Company:
    access = db.query(UserCompanyAccess).filter(
        UserCompanyAccess.company_id == company_id,
        UserCompanyAccess.user_id == user.id,
    ).first()
    if not access:
        raise HTTPException(status_code=403, detail="無此公司訪問權限")
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="公司不存在")
    return company


def _generate_invoice_number(company_id: str, invoice_type: str, db: Session) -> str:
    prefix = "INV" if invoice_type == "invoice" else "QUO"
    year = datetime.now().strftime("%Y")
    count = db.query(Invoice).filter(
        Invoice.company_id == company_id,
        Invoice.invoice_type == invoice_type,
        func.extract("year", Invoice.created_at) == int(year),
    ).count()
    return f"{prefix}-{year}-{count + 1:03d}"


def _recalculate_totals(invoice: Invoice):
    """重新计算发票合计"""
    subtotal = sum(float(item.amount) for item in invoice.items)
    invoice.subtotal = Decimal(str(subtotal))
    discount = float(invoice.discount_amount or 0)
    invoice.total_amount = Decimal(str(subtotal - discount))

    # 更新已付金额
    paid = sum(float(p.amount) for p in invoice.payments)
    invoice.paid_amount = Decimal(str(paid))

    # 自动更新状态
    total = float(invoice.total_amount)
    if paid >= total:
        invoice.status = InvoiceStatus.paid
    elif paid > 0:
        invoice.status = InvoiceStatus.partial
    elif invoice.due_date and invoice.due_date < datetime.utcnow() and invoice.status not in [InvoiceStatus.void]:
        invoice.status = InvoiceStatus.overdue


# ─── Dashboard ──────────────────────────────────────────────────────────────

@router.get("/dashboard", response_model=DashboardStats)
def get_dashboard(
    company_id: str,
    fiscal_year: Optional[str] = Query(None, description="指定财年，格式 YYYY-YY，默认当前财年"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_access(company_id, current_user, db)

    # 总待收（未付发票余额）
    active_invoices = db.query(Invoice).filter(
        Invoice.company_id == company_id,
        Invoice.status.in_([InvoiceStatus.sent, InvoiceStatus.partial, InvoiceStatus.overdue]),
    ).all()
    total_outstanding = sum(float(inv.total_amount) - float(inv.paid_amount) for inv in active_invoices)

    # 逾期
    overdue = db.query(Invoice).filter(
        Invoice.company_id == company_id,
        Invoice.status == InvoiceStatus.overdue,
    ).all()
    total_overdue = sum(float(inv.total_amount) - float(inv.paid_amount) for inv in overdue)

    # 本月已收
    now = datetime.utcnow()
    month_payments = db.query(Payment).join(Invoice).filter(
        Invoice.company_id == company_id,
        func.extract("year", Payment.payment_date) == now.year,
        func.extract("month", Payment.payment_date) == now.month,
    ).all()
    total_paid_this_month = sum(float(p.amount) for p in month_payments)

    # 按状态统计
    status_counts = {}
    for status in InvoiceStatus:
        count = db.query(Invoice).filter(
            Invoice.company_id == company_id,
            Invoice.status == status,
        ).count()
        status_counts[status.value] = count

    # 最近10张发票
    recent = db.query(Invoice).filter(
        Invoice.company_id == company_id,
    ).order_by(Invoice.created_at.desc()).limit(10).all()

    recent_invoices = [
        {
            "id": str(inv.id),
            "invoice_number": inv.invoice_number,
            "client_name": inv.client_name,
            "total_amount": float(inv.total_amount),
            "paid_amount": float(inv.paid_amount),
            "balance_due": float(inv.total_amount) - float(inv.paid_amount),
            "status": inv.status.value,
            "currency": inv.currency,
            "issue_date": inv.issue_date.isoformat() if inv.issue_date else None,
            "due_date": inv.due_date.isoformat() if inv.due_date else None,
        }
        for inv in recent
    ]

    # ─── 拓展：根据业务模式动态加载专属 KPI ─────────────────────────────
    from models.commission import CommissionStatement, IR56MStatement, CommissionStatus
    from models.expense import Expense, ExpenseStatus
    from models.company import Company, BusinessMode
    from services.receipt_scanner import calculate_fiscal_year
    import datetime as dt

    company = db.query(Company).filter(Company.id == company_id).first()
    business_mode = getattr(company, 'business_mode', 'trading_sme') if company else 'trading_sme'

    commission_ytd = 0.0
    commission_last_month = 0.0
    expense_ytd = 0.0

    # 确定目标财年（前端传入 or 当前财年）
    target_fy = fiscal_year if fiscal_year else calculate_fiscal_year(now.date())

    # 所有模式：本财年支出合计
    expense_ytd_raw = db.query(func.sum(Expense.total_amount)).filter(
        Expense.company_id == company_id,
        Expense.fiscal_year == target_fy,
        Expense.status.in_(["confirmed", ExpenseStatus.confirmed.value])
    ).scalar()
    expense_ytd = float(expense_ytd_raw or 0)

    # 仅代理人模式：佣金统计
    if business_mode == BusinessMode.insurance_agent or business_mode == "insurance_agent":
        first_day_this_month = now.replace(day=1)
        last_month_date = first_day_this_month - dt.timedelta(days=1)
        last_month_str = last_month_date.strftime("%Y-%m")

        # 优先读取已确认的 IR56M 报税总额
        ir56m = db.query(IR56MStatement).filter(
            IR56MStatement.company_id == company_id,
            IR56MStatement.fiscal_year == target_fy,
            IR56MStatement.status == CommissionStatus.confirmed
        ).first()

        if ir56m and ir56m.total_income:
            commission_ytd = float(ir56m.total_income)
        else:
            commission_ytd_raw = db.query(func.sum(CommissionStatement.total_taxable_income)).filter(
                CommissionStatement.company_id == company_id,
                CommissionStatement.fiscal_year == target_fy,
                CommissionStatement.status == CommissionStatus.confirmed
            ).scalar()
            commission_ytd = float(commission_ytd_raw or 0)

        commission_last_raw = db.query(func.sum(CommissionStatement.total_taxable_income)).filter(
            CommissionStatement.company_id == company_id,
            CommissionStatement.statement_month == last_month_str,
            CommissionStatement.status == CommissionStatus.confirmed
        ).scalar()
        commission_last_month = float(commission_last_raw or 0)

    return DashboardStats(
        total_outstanding=total_outstanding,
        total_overdue=total_overdue,
        total_paid_this_month=total_paid_this_month,
        invoice_count_by_status=status_counts,
        recent_invoices=recent_invoices,
        commission_ytd=commission_ytd,
        commission_last_month=commission_last_month,
        expense_ytd=expense_ytd,
        fiscal_year=target_fy
    )


# ─── Invoice CRUD ───────────────────────────────────────────────────────────

@router.get("/invoices", response_model=List[InvoiceOut])
def list_invoices(
    company_id: str,
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_access(company_id, current_user, db)
    q = db.query(Invoice).filter(Invoice.company_id == company_id)

    if status:
        q = q.filter(Invoice.status == status)
    if search:
        q = q.filter(
            Invoice.invoice_number.ilike(f"%{search}%") |
            Invoice.client_name.ilike(f"%{search}%")
        )

    total = q.count()
    invoices = q.order_by(Invoice.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return invoices


@router.post("/invoices", response_model=InvoiceOut, status_code=201)
def create_invoice(
    company_id: str,
    data: InvoiceCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_access(company_id, current_user, db)

    invoice_number = data.invoice_number or _generate_invoice_number(company_id, data.invoice_type, db)

    invoice = Invoice(
        company_id=company_id,
        invoice_number=invoice_number,
        invoice_type=data.invoice_type,
        client_id=str(data.client_id) if data.client_id else None,
        client_name=data.client_name,
        client_address=data.client_address,
        client_email=data.client_email,
        issue_date=data.issue_date or datetime.utcnow(),
        due_date=data.due_date,
        currency=data.currency,
        discount_amount=Decimal(str(data.discount_amount)),
        notes=data.notes,
        terms=data.terms,
        bank_info=data.bank_info,
    )
    db.add(invoice)
    db.flush()

    for i, item_data in enumerate(data.items or []):
        amount = item_data.amount if item_data.amount is not None else item_data.quantity * item_data.unit_price
        item = InvoiceItem(
            invoice_id=invoice.id,
            sort_order=i,
            description=item_data.description,
            quantity=Decimal(str(item_data.quantity)),
            unit_price=Decimal(str(item_data.unit_price)),
            amount=Decimal(str(amount)),
        )
        db.add(item)

    db.flush()
    db.refresh(invoice)
    _recalculate_totals(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


@router.get("/invoices/{invoice_id}", response_model=InvoiceOut)
def get_invoice(
    company_id: str,
    invoice_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_access(company_id, current_user, db)
    invoice = db.query(Invoice).filter(
        Invoice.id == invoice_id, Invoice.company_id == company_id
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="發票不存在")
    return invoice


@router.put("/invoices/{invoice_id}", response_model=InvoiceOut)
def update_invoice(
    company_id: str,
    invoice_id: str,
    data: InvoiceUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_access(company_id, current_user, db)
    invoice = db.query(Invoice).filter(
        Invoice.id == invoice_id, Invoice.company_id == company_id
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="發票不存在")
    if invoice.status == InvoiceStatus.void:
        raise HTTPException(status_code=400, detail="已作廢的發票不能修改")

    # 更新基本字段
    update_fields = data.model_dump(exclude_unset=True, exclude={"items"})
    for field, value in update_fields.items():
        if hasattr(invoice, field) and value is not None:
            setattr(invoice, field, value)

    # 重建明细行
    if data.items is not None:
        for item in invoice.items:
            db.delete(item)
        db.flush()
        for i, item_data in enumerate(data.items):
            amount = item_data.amount if item_data.amount is not None else item_data.quantity * item_data.unit_price
            item = InvoiceItem(
                invoice_id=invoice.id,
                sort_order=i,
                description=item_data.description,
                quantity=Decimal(str(item_data.quantity)),
                unit_price=Decimal(str(item_data.unit_price)),
                amount=Decimal(str(amount)),
            )
            db.add(item)

    db.flush()
    db.refresh(invoice)
    _recalculate_totals(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


@router.patch("/invoices/{invoice_id}/send", response_model=InvoiceOut)
def mark_sent(
    company_id: str,
    invoice_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_access(company_id, current_user, db)
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == company_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="發票不存在")
    if invoice.status == InvoiceStatus.draft:
        invoice.status = InvoiceStatus.sent
    db.commit()
    db.refresh(invoice)
    return invoice


@router.patch("/invoices/{invoice_id}/void", response_model=InvoiceOut)
def void_invoice(
    company_id: str,
    invoice_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_access(company_id, current_user, db)
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == company_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="發票不存在")
    invoice.status = InvoiceStatus.void
    db.commit()
    db.refresh(invoice)
    return invoice


# ─── PDF Export ─────────────────────────────────────────────────────────────

@router.get("/invoices/{invoice_id}/pdf")
def download_invoice_pdf(
    company_id: str,
    invoice_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company = _check_access(company_id, current_user, db)
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == company_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="發票不存在")

    invoice_data = {
        "invoice_number": invoice.invoice_number,
        "invoice_type": invoice.invoice_type,
        "client_name": invoice.client_name,
        "client_address": invoice.client_address,
        "client_email": invoice.client_email,
        "issue_date": invoice.issue_date,
        "due_date": invoice.due_date,
        "currency": invoice.currency,
        "subtotal": float(invoice.subtotal),
        "discount_amount": float(invoice.discount_amount),
        "total_amount": float(invoice.total_amount),
        "paid_amount": float(invoice.paid_amount),
        "notes": invoice.notes,
        "terms": invoice.terms,
        "bank_info": invoice.bank_info,
        "items": [
            {
                "description": item.description,
                "quantity": float(item.quantity),
                "unit_price": float(item.unit_price),
                "amount": float(item.amount),
            }
            for item in sorted(invoice.items, key=lambda x: x.sort_order)
        ],
    }

    company_data = {
        "name_zh": company.name_zh,
        "name_en": company.name_en,
        "address": company.address,
        "phone": company.phone,
        "email": company.email,
        "logo_url": company.logo_url,
    }

    pdf_bytes = generate_invoice_pdf(invoice_data, company_data)

    filename = f"{invoice.invoice_number}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Payments ───────────────────────────────────────────────────────────────

@router.post("/invoices/{invoice_id}/payments", response_model=InvoiceOut, status_code=201)
def add_payment(
    company_id: str,
    invoice_id: str,
    data: PaymentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_access(company_id, current_user, db)
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == company_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="發票不存在")
    if invoice.status == InvoiceStatus.void:
        raise HTTPException(status_code=400, detail="已作廢的發票不能登記收款")

    payment = Payment(
        invoice_id=invoice.id,
        company_id=company_id,
        payment_date=data.payment_date or datetime.utcnow(),
        amount=Decimal(str(data.amount)),
        method=data.method,
        reference=data.reference,
        notes=data.notes,
    )
    db.add(payment)
    db.flush()
    db.refresh(invoice)
    _recalculate_totals(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice
