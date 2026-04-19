"""
financials.py — 财务报表 API 路由
提供损益表 / 应收账款 / 支出分析 / PDF+Excel 导出端点
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from database import get_db
from services.auth import get_current_user
from services.financial_report import (
    build_pnl,
    build_ar_summary,
    build_expense_analysis,
    build_pnl_pdf,
    build_pnl_excel,
    get_current_fiscal_year,
)
from models.company import Company, UserCompanyAccess
from models.company import User

router = APIRouter(prefix="/companies/{company_id}/financials", tags=["financials"])


# ── 工具：验证公司权限 ────────────────────────────────────────
def _get_company_or_404(
    company_id: str,
    db: Session,
    current_user: User,
) -> Company:
    access = db.query(UserCompanyAccess).filter(
        UserCompanyAccess.company_id == company_id,
        UserCompanyAccess.user_id == current_user.id,
    ).first()
    if not access:
        raise HTTPException(status_code=403, detail="无权访问该公司")
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="公司不存在")
    return company


def _company_dict(company: Company) -> dict:
    return {
        "name_zh":  company.name_zh,
        "name_en":  company.name_en,
        "address":  company.address,
        "phone":    company.phone,
        "email":    company.email,
    }


# ── GET /financials/fiscal-years ──────────────────────────────
@router.get("/fiscal-years")
def list_fiscal_years(
    company_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """返回当前及过去3个财政年度供前端下拉选择。"""
    _get_company_or_404(company_id, db, current_user)

    from datetime import date
    today = date.today()
    if today.month >= 4:
        current_start = today.year
    else:
        current_start = today.year - 1

    years = []
    for offset in range(4):
        yr = current_start - offset
        years.append(f"{yr}-{str(yr + 1)[-2:]}")
    return {"fiscal_years": years, "current": years[0]}


# ── GET /financials/pnl ───────────────────────────────────────
@router.get("/pnl")
def get_pnl(
    company_id: str,
    fiscal_year: str = Query(default=None, description="如 2024-25"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """损益表（P&L Statement）数据。"""
    _get_company_or_404(company_id, db, current_user)
    if not fiscal_year:
        fiscal_year = get_current_fiscal_year()
    
    pnl = build_pnl(db, company_id, fiscal_year)
    if current_user.role not in ["admin", "premium"]:
        pnl["is_partial_tax"] = True
    else:
        pnl["is_partial_tax"] = False
        
    return pnl


# ── GET /financials/ar ────────────────────────────────────────
@router.get("/ar")
def get_ar(
    company_id: str,
    fiscal_year: str = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """应收账款摘要（AR Summary）。"""
    _get_company_or_404(company_id, db, current_user)
    if not fiscal_year:
        fiscal_year = get_current_fiscal_year()
    return build_ar_summary(db, company_id, fiscal_year)


# ── GET /financials/expense-analysis ─────────────────────────
@router.get("/expense-analysis")
def get_expense_analysis(
    company_id: str,
    fiscal_year: str = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """支出分析（按分类 + 按月份）。"""
    _get_company_or_404(company_id, db, current_user)
    if not fiscal_year:
        fiscal_year = get_current_fiscal_year()
    return build_expense_analysis(db, company_id, fiscal_year)


# ── GET /financials/pnl/export ────────────────────────────────
@router.get("/pnl/export")
def export_pnl(
    company_id: str,
    fiscal_year: str = Query(default=None),
    format: str = Query(default="pdf", description="pdf 或 excel"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """导出损益表为 PDF 或 Excel。"""
    company = _get_company_or_404(company_id, db, current_user)
    if not fiscal_year:
        fiscal_year = get_current_fiscal_year()

    pnl = build_pnl(db, company_id, fiscal_year)
    company_data = _company_dict(company)
    safe_fy = fiscal_year.replace("-", "_")

    if format == "excel":
        content = build_pnl_excel(pnl, company_data)
        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename=PnL_{safe_fy}.xlsx"
            },
        )
    else:
        content = build_pnl_pdf(pnl, company_data)
        return Response(
            content=content,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=PnL_{safe_fy}.pdf"
            },
        )
