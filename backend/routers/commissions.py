"""
commissions.py — 佣金台账 REST API 路由

提供：
  - 网页直接上传月结单截图（POST /upload）
  - 触发 inbox 文件夹扫描（POST /scan-inbox）
  - 台账 CRUD（列表/详情/修正/确认/驳回）
  - 财年汇总（BIR60 数据源）
  - 收支对比利润估算
"""
import asyncio
from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models.commission import CommissionStatement, CommissionStatus, IR56MStatement
from models.expense import Expense, ExpenseStatus
from models.company import UserCompanyAccess
from services.auth import get_current_user
from services.commission_scanner import scan_commission_statement
from services.statements_watcher import run_scan_once
from services.ir56m_scanner import scan_ir56m_statement
from config import settings, ensure_statement_dirs
import uuid

router = APIRouter(prefix="/companies/{company_id}/commissions", tags=["commissions"])

SUPPORTED_IMAGE_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "image/heic", "image/heif",
}


def _check_access(company_id: str, current_user, db: Session):
    access = db.query(UserCompanyAccess).filter(
        UserCompanyAccess.company_id == company_id,
        UserCompanyAccess.user_id == current_user.id
    ).first()
    if not access:
        raise HTTPException(status_code=403, detail="无权访问此公司")
    return access


# ── 上传单张截图 ───────────────────────────────────────────────────────────
@router.post("/upload")
async def upload_statement(
    company_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """直接上传 AIA 月结单截图，触发 AI 识别"""
    _check_access(company_id, current_user, db)
    ensure_statement_dirs()

    content_type = file.content_type or ""
    filename = file.filename or "unknown.jpg"

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="文件为空")

    try:
        extracted = await scan_commission_statement(file_bytes, filename, db, company_id)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"AI 识别失败：{str(e)}")

    stmt = CommissionStatement(
        company_id=company_id,
        insurer_name=extracted["insurer_name"],
        agent_code=extracted.get("agent_code"),
        agent_name=extracted.get("agent_name"),
        statement_month=extracted["statement_month"],
        fiscal_year=extracted["fiscal_year"],

        fyc_life_annual=extracted.get("fyc_life_annual"),
        fyc_life_semi_annual=extracted.get("fyc_life_semi_annual"),
        fyc_life_quarterly=extracted.get("fyc_life_quarterly"),
        fyc_life_monthly=extracted.get("fyc_life_monthly"),
        fyc_life_extra=extracted.get("fyc_life_extra"),
        fyc_pa=extracted.get("fyc_pa"),
        fyc_mpf=extracted.get("fyc_mpf"),
        fyc_subtotal=extracted.get("fyc_subtotal"),

        renewal_life=extracted.get("renewal_life"),
        renewal_pa=extracted.get("renewal_pa"),
        renewal_mpf=extracted.get("renewal_mpf"),
        renewal_subtotal=extracted.get("renewal_subtotal"),

        other_taxable_income=extracted.get("other_taxable_income"),
        total_taxable_income=extracted.get("total_taxable_income"),
        misc_deduction=extracted.get("misc_deduction"),
        allowance_offset=extracted.get("allowance_offset"),
        payment_this_month=extracted.get("payment_this_month"),

        ytd_fyc_subtotal=extracted.get("ytd_fyc_subtotal"),
        ytd_renewal_subtotal=extracted.get("ytd_renewal_subtotal"),
        ytd_other_income=extracted.get("ytd_other_income"),
        ytd_total_taxable=extracted.get("ytd_total_taxable"),
        ytd_payment=extracted.get("ytd_payment"),

        source_image_path=extracted.get("source_image_path"),
        source_original_filename=extracted.get("source_original_filename"),
        ai_confidence=extracted.get("ai_confidence"),
        ai_raw_response=extracted.get("ai_raw_response"),
        status=CommissionStatus.pending,
    )
    db.add(stmt)
    db.commit()
    db.refresh(stmt)

    return _stmt_to_dict(stmt)


# ── 手动录入额外收入 ───────────────────────────────────────────────────────
@router.post("/manual")
async def add_manual_income(
    company_id: str,
    statement_month: str = Query(..., description="格式 YYYY-MM"),
    income_source: str = Query(..., description="收入来源，例如 Referral, Consultant"),
    amount: float = Query(..., description="金额"),
    notes: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """手动录入额外收入，记录到 CommissionStatement 中的 other_taxable_income 字段"""
    _check_access(company_id, current_user, db)
    
    from services.receipt_scanner import _parse_date, calculate_fiscal_year
    from datetime import datetime
    
    # 构造假日期获取财年
    dummy_date = datetime.strptime(f"{statement_month}-01", "%Y-%m-%d").date()
    fiscal_year = calculate_fiscal_year(dummy_date)
    
    stmt = CommissionStatement(
        company_id=company_id,
        insurer_name=income_source,
        statement_month=statement_month,
        fiscal_year=fiscal_year,
        fyc_subtotal=0,
        renewal_subtotal=0,
        other_taxable_income=amount,
        total_taxable_income=amount,
        payment_this_month=amount,
        status=CommissionStatus.confirmed, # 手动录入的直接属于已确认
        notes=notes
    )
    
    db.add(stmt)
    db.commit()
    db.refresh(stmt)
    
    return _stmt_to_dict(stmt)


# ── IR56M 上传单张图 ───────────────────────────────────────────────────────────
@router.post("/ir56m/upload")
async def upload_ir56m(
    company_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """上传 IR56M 表格截图"""
    _check_access(company_id, current_user, db)
    ensure_statement_dirs()

    content_type = file.content_type or ""
    filename = file.filename or "unknown.jpg"
    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="文件为空")

    new_id = str(uuid.uuid4())
    try:
        extracted = await scan_ir56m_statement(file_bytes, filename, new_id)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"IR56M 识别失败：{str(e)}")

    stmt = IR56MStatement(
        id=new_id,
        company_id=company_id,
        payer_name=extracted.get("payer_name", "AIA INTERNATIONAL LIMITED"),
        agent_code=extracted.get("agent_code"),
        agent_name=extracted.get("agent_name"),
        period_start=extracted.get("period_start"),
        period_end=extracted.get("period_end"),
        fiscal_year=extracted.get("fiscal_year"),
        total_income=extracted.get("total_income"),
        source_image_path=extracted.get("source_image_path"),
        source_original_filename=extracted.get("source_original_filename"),
        ai_confidence=extracted.get("ai_confidence"),
        ai_raw_response=extracted.get("ai_raw_response"),
        status=CommissionStatus.pending,
    )
    db.add(stmt)
    db.commit()
    db.refresh(stmt)
    return _ir56m_to_dict(stmt)


# ── IR56M 确认/驳回/列表 ────────────────────────────────────────────────────────
@router.get("/ir56m")
def list_ir56m(
    company_id: str,
    fiscal_year: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _check_access(company_id, current_user, db)
    q = db.query(IR56MStatement).filter(IR56MStatement.company_id == company_id)
    if fiscal_year:
        q = q.filter(IR56MStatement.fiscal_year == fiscal_year)
    stmts = q.order_by(IR56MStatement.fiscal_year.desc()).all()
    return [_ir56m_to_dict(s) for s in stmts]

@router.post("/ir56m/{stmt_id}/confirm")
def confirm_ir56m(
    company_id: str,
    stmt_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _check_access(company_id, current_user, db)
    stmt = db.query(IR56MStatement).filter(IR56MStatement.id == stmt_id).first()
    stmt.status = CommissionStatus.confirmed
    db.commit()
    return {"status": "confirmed"}

# ── 触发 Inbox 扫描 ───────────────────────────────────────────────────────
@router.post("/scan-inbox")
async def scan_inbox(
    company_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """扫描 statements_inbox/ 文件夹，批量处理所有待处理截图"""
    _check_access(company_id, current_user, db)
    result = await run_scan_once(company_id)
    return result


# ── 列表（含筛选）─────────────────────────────────────────────────────────
@router.get("/")
def list_statements(
    company_id: str,
    fiscal_year: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """获取佣金台账列表，支持按财年和状态筛选"""
    _check_access(company_id, current_user, db)

    q = db.query(CommissionStatement).filter(
        CommissionStatement.company_id == company_id
    )
    if fiscal_year:
        q = q.filter(CommissionStatement.fiscal_year == fiscal_year)
    if status:
        q = q.filter(CommissionStatement.status == status)

    stmts = q.order_by(CommissionStatement.statement_month.desc()).all()
    return [_stmt_to_dict(s) for s in stmts]


# ── 单条详情 ──────────────────────────────────────────────────────────────
@router.get("/{stmt_id}")
def get_statement(
    company_id: str,
    stmt_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _check_access(company_id, current_user, db)
    stmt = _get_stmt_or_404(stmt_id, company_id, db)
    return _stmt_to_dict(stmt, detail=True)


# ── 人工修正 ──────────────────────────────────────────────────────────────
@router.put("/{stmt_id}")
def update_statement(
    company_id: str,
    stmt_id: str,
    data: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """人工修正 AI 识别字段"""
    _check_access(company_id, current_user, db)
    stmt = _get_stmt_or_404(stmt_id, company_id, db)

    EDITABLE_FIELDS = [
        "fyc_subtotal", "renewal_subtotal", "other_taxable_income",
        "total_taxable_income", "misc_deduction", "allowance_offset",
        "payment_this_month", "ytd_total_taxable",
        "statement_month", "fiscal_year", "agent_code", "notes",
    ]
    for field in EDITABLE_FIELDS:
        if field in data:
            setattr(stmt, field, data[field])

    # 如果修改了 statement_month，自动重新计算 fiscal_year
    if "statement_month" in data:
        from services.commission_scanner import _calculate_fiscal_year
        stmt.fiscal_year = _calculate_fiscal_year(stmt.statement_month)

    stmt.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(stmt)
    return _stmt_to_dict(stmt)


# ── 确认 ──────────────────────────────────────────────────────────────────
@router.post("/{stmt_id}/confirm")
def confirm_statement(
    company_id: str,
    stmt_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _check_access(company_id, current_user, db)
    stmt = _get_stmt_or_404(stmt_id, company_id, db)
    stmt.status = CommissionStatus.confirmed
    stmt.updated_at = datetime.utcnow()
    db.commit()
    return {"status": "confirmed", "id": stmt_id}


# ── 驳回 ──────────────────────────────────────────────────────────────────
@router.post("/{stmt_id}/reject")
def reject_statement(
    company_id: str,
    stmt_id: str,
    data: dict = {},
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _check_access(company_id, current_user, db)
    stmt = _get_stmt_or_404(stmt_id, company_id, db)
    stmt.status = CommissionStatus.rejected
    if data.get("notes"):
        stmt.notes = data["notes"]
    stmt.updated_at = datetime.utcnow()
    db.commit()
    return {"status": "rejected", "id": stmt_id}


# ── 删除 ──────────────────────────────────────────────────────────────────
@router.delete("/{stmt_id}")
def delete_statement(
    company_id: str,
    stmt_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _check_access(company_id, current_user, db)
    stmt = _get_stmt_or_404(stmt_id, company_id, db)
    db.delete(stmt)
    db.commit()
    return {"status": "deleted", "id": stmt_id}


# ── 财年汇总（BIR60 数据源）──────────────────────────────────────────────
@router.get("/summary/annual")
def annual_summary(
    company_id: str,
    fiscal_year: str = Query(..., description="香港财年，如 2025-26"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    财年收入汇总，供 BIR60 申报使用。
    只统计 confirmed 状态的月结单。
    """
    _check_access(company_id, current_user, db)

    stmts = db.query(CommissionStatement).filter(
        CommissionStatement.company_id == company_id,
        CommissionStatement.fiscal_year == fiscal_year,
        CommissionStatement.status == CommissionStatus.confirmed,
    ).order_by(CommissionStatement.statement_month).all()

    total_fyc      = sum(float(s.fyc_subtotal or 0)         for s in stmts)
    total_renewal  = sum(float(s.renewal_subtotal or 0)     for s in stmts)
    total_other    = sum(float(s.other_taxable_income or 0) for s in stmts)
    total_taxable  = sum(float(s.total_taxable_income or 0) for s in stmts)

    # 用最新月份的 YTD 做校验（若存在）
    ytd_check = None
    latest = max(stmts, key=lambda s: s.statement_month, default=None)
    if latest and latest.ytd_total_taxable:
        ytd_check = float(latest.ytd_total_taxable)

    # 月份覆盖率
    confirmed_months = sorted([s.statement_month for s in stmts])
    all_months_in_fy = _fiscal_year_months(fiscal_year)
    missing_months = [m for m in all_months_in_fy if m not in confirmed_months]

    # 检测是否存在 IR56M（最高优先级）
    ir56m = db.query(IR56MStatement).filter(
        IR56MStatement.company_id == company_id,
        IR56MStatement.fiscal_year == fiscal_year,
        IR56MStatement.status == CommissionStatus.confirmed
    ).first()

    has_ir56m = False
    if ir56m and ir56m.total_income:
        has_ir56m = True
        total_taxable = float(ir56m.total_income)

    return {
        "fiscal_year": fiscal_year,
        "has_ir56m": has_ir56m,
        "confirmed_months_count": len(stmts),
        "total_months_in_fy": len(all_months_in_fy),
        "missing_months": missing_months,
        "total_fyc_subtotal": round(total_fyc, 2),
        "total_renewal_subtotal": round(total_renewal, 2),
        "total_other_income": round(total_other, 2),
        "total_taxable_income": round(total_taxable, 2),   # ← BIR60 申报数字
        "ytd_check": ytd_check,   # 来自截图的YTD，用于核对上面的 total_taxable
        "ytd_variance": round(total_taxable - ytd_check, 2) if ytd_check else None,
        "monthly_breakdown": [
            {
                "month": s.statement_month,
                "fyc_subtotal": float(s.fyc_subtotal or 0),
                "renewal_subtotal": float(s.renewal_subtotal or 0),
                "other_taxable": float(s.other_taxable_income or 0),
                "total_taxable": float(s.total_taxable_income or 0),
                "status": s.status,
            }
            for s in stmts
        ],
    }


# ── 收支对比利润估算 ──────────────────────────────────────────────────────
@router.get("/summary/profit")
def profit_summary(
    company_id: str,
    fiscal_year: str = Query(..., description="香港财年，如 2025-26"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    年度应评税利润估算：
    应税收入（已确认佣金台账合计）- 已确认支出合计 = 估算税前利润
    """
    _check_access(company_id, current_user, db)

    # 收入（先查 IR56M）
    ir56m = db.query(IR56MStatement).filter(
        IR56MStatement.company_id == company_id,
        IR56MStatement.fiscal_year == fiscal_year,
        IR56MStatement.status == CommissionStatus.confirmed
    ).first()

    income_source = "monthly_statements"
    if ir56m and ir56m.total_income:
        total_income = float(ir56m.total_income)
        income_source = "ir56m"
        income_months_confirmed = 12
    else:
        stmts = db.query(CommissionStatement).filter(
            CommissionStatement.company_id == company_id,
            CommissionStatement.fiscal_year == fiscal_year,
            CommissionStatement.status == CommissionStatus.confirmed,
        ).all()
        total_income = sum(float(s.total_taxable_income or 0) for s in stmts)
        income_months_confirmed = len(stmts)

    # 支出（confirmed 支出凭证，港税可扣除类）
    expenses = db.query(Expense).filter(
        Expense.company_id == company_id,
        Expense.fiscal_year == fiscal_year,
        Expense.status == ExpenseStatus.confirmed,
    ).all()
    total_expense = sum(float(e.amount_hkd or 0) for e in expenses)

    profit = total_income - total_expense

    # 利得税两级制估算（2024/25适用）
    if profit <= 0:
        tax_estimate = 0.0
    elif profit <= 2_000_000:
        tax_estimate = profit * 0.075
    else:
        tax_estimate = 2_000_000 * 0.075 + (profit - 2_000_000) * 0.15

    return {
        "fiscal_year": fiscal_year,
        "income_source": income_source,
        "total_taxable_income": round(total_income, 2),
        "total_confirmed_expense": round(total_expense, 2),
        "estimated_profit": round(profit, 2),
        "profits_tax_estimate": round(tax_estimate, 2),
        "income_months_confirmed": income_months_confirmed,
        "expense_records_confirmed": len(expenses),
        "note": "此为估算值，实际应税利润须经专业税务代表审核。首200万利润税率7.5%，超出部分15%。"
    }


# ── 获取所有存在的财年列表 ────────────────────────────────────────────────
@router.get("/fiscal-years/list")
def list_fiscal_years(
    company_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _check_access(company_id, current_user, db)
    rows = (
        db.query(CommissionStatement.fiscal_year)
        .filter(CommissionStatement.company_id == company_id)
        .distinct()
        .order_by(CommissionStatement.fiscal_year.desc())
        .all()
    )
    return [r[0] for r in rows if r[0]]


# ── 工具函数 ─────────────────────────────────────────────────────────────
def _get_stmt_or_404(stmt_id: str, company_id: str, db: Session) -> CommissionStatement:
    stmt = db.query(CommissionStatement).filter(
        CommissionStatement.id == stmt_id,
        CommissionStatement.company_id == company_id,
    ).first()
    if not stmt:
        raise HTTPException(status_code=404, detail="月结单不存在")
    return stmt


def _stmt_to_dict(s: CommissionStatement, detail: bool = False) -> dict:
    d = {
        "id": s.id,
        "insurer_name": s.insurer_name,
        "agent_code": s.agent_code,
        "agent_name": s.agent_name,
        "statement_month": s.statement_month,
        "fiscal_year": s.fiscal_year,
        "fyc_subtotal": float(s.fyc_subtotal) if s.fyc_subtotal else None,
        "renewal_subtotal": float(s.renewal_subtotal) if s.renewal_subtotal else None,
        "other_taxable_income": float(s.other_taxable_income) if s.other_taxable_income else None,
        "total_taxable_income": float(s.total_taxable_income) if s.total_taxable_income else None,
        "misc_deduction": float(s.misc_deduction) if s.misc_deduction else None,
        "allowance_offset": float(s.allowance_offset) if s.allowance_offset else None,
        "payment_this_month": float(s.payment_this_month) if s.payment_this_month else None,
        "ytd_total_taxable": float(s.ytd_total_taxable) if s.ytd_total_taxable else None,
        "ai_confidence": s.ai_confidence,
        "status": s.status,
        "notes": s.notes,
        "source_image_path": s.source_image_path,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }
    if detail:
        d.update({
            "fyc_life_annual": float(s.fyc_life_annual) if s.fyc_life_annual else None,
            "fyc_life_semi_annual": float(s.fyc_life_semi_annual) if s.fyc_life_semi_annual else None,
            "fyc_life_quarterly": float(s.fyc_life_quarterly) if s.fyc_life_quarterly else None,
            "fyc_life_monthly": float(s.fyc_life_monthly) if s.fyc_life_monthly else None,
            "fyc_life_extra": float(s.fyc_life_extra) if s.fyc_life_extra else None,
            "fyc_pa": float(s.fyc_pa) if s.fyc_pa else None,
            "fyc_mpf": float(s.fyc_mpf) if s.fyc_mpf else None,
            "renewal_life": float(s.renewal_life) if s.renewal_life else None,
            "renewal_pa": float(s.renewal_pa) if s.renewal_pa else None,
            "renewal_mpf": float(s.renewal_mpf) if s.renewal_mpf else None,
            "ytd_fyc_subtotal": float(s.ytd_fyc_subtotal) if s.ytd_fyc_subtotal else None,
            "ytd_renewal_subtotal": float(s.ytd_renewal_subtotal) if s.ytd_renewal_subtotal else None,
            "ytd_other_income": float(s.ytd_other_income) if s.ytd_other_income else None,
            "ytd_payment": float(s.ytd_payment) if s.ytd_payment else None,
            "source_original_filename": s.source_original_filename,
        })
    return d


def _fiscal_year_months(fiscal_year: str) -> List[str]:
    """
    返回一个财年内所有月份的 YYYY-MM 列表
    例："2025-26" → ["2025-04", "2025-05", ..., "2026-03"]
    """
    try:
        start_year = int(fiscal_year[:4])
    except (ValueError, IndexError):
        return []
    months = []
    for m in range(4, 13):
        months.append(f"{start_year}-{m:02d}")
    for m in range(1, 4):
        months.append(f"{start_year + 1}-{m:02d}")
    return months

def _ir56m_to_dict(s: IR56MStatement) -> dict:
    return {
        "id": s.id,
        "payer_name": s.payer_name,
        "agent_code": s.agent_code,
        "agent_name": s.agent_name,
        "period_start": s.period_start,
        "period_end": s.period_end,
        "fiscal_year": s.fiscal_year,
        "total_income": float(s.total_income) if s.total_income else None,
        "ai_confidence": s.ai_confidence,
        "status": s.status,
        "source_image_path": s.source_image_path,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }
