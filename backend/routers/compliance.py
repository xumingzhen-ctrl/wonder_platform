"""
routers/compliance.py
合规日历 REST API
"""

import uuid
from datetime import datetime, date
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models.company import Company, ComplianceItem
from routers.auth import get_current_user
from routers.companies import _get_company_or_403
from services.compliance_engine import generate_annual_items, get_compliance_summary

router = APIRouter(prefix="/companies/{company_id}/compliance", tags=["compliance"])


# ── 工具函数 ────────────────────────────────────────────────────────────────

def _current_fiscal_year() -> str:
    """返回当前香港财年字符串，如 '2025-26'"""
    today = date.today()
    if today.month >= 4:
        start = today.year
    else:
        start = today.year - 1
    return f"{start}-{str(start + 1)[-2:]}"


def _auto_update_overdue(items: List[ComplianceItem], db: Session):
    """自动将截止日已过的 pending 项目更新为 overdue"""
    today = datetime.utcnow().date()
    changed = False
    for item in items:
        if item.status == "pending" and item.due_date:
            if item.due_date.date() < today:
                item.status = "overdue"
                changed = True
    if changed:
        db.commit()


def _item_to_dict(item: ComplianceItem) -> dict:
    return {
        "id": item.id,
        "company_id": item.company_id,
        "code": item.code,
        "fiscal_year": item.fiscal_year,
        "title": item.title,
        "title_en": item.title_en,
        "category": item.category,
        "applies_to": item.applies_to,
        "authority": item.authority,
        "legal_ref": item.legal_ref,
        "penalty_note": item.penalty_note,
        "reminder_days_before": item.reminder_days_before,
        "due_date": item.due_date.isoformat() if item.due_date else None,
        "is_manual_date": item.is_manual_date,
        "needs_manual": item.needs_manual,
        "status": item.status,
        "completed_at": item.completed_at.isoformat() if item.completed_at else None,
        "notes": item.notes,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


# ── 获取/生成合规清单 ──────────────────────────────────────────────────────

@router.get("/")
def get_compliance_items(
    company_id: str,
    year: Optional[str] = Query(None, description="财年，如 2025-26"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """获取公司的合规事件清单（若数据库无记录则自动生成）"""
    company = _get_company_or_403(company_id, current_user, db)
    fiscal_year = year or _current_fiscal_year()

    # 查询已有记录
    existing = db.query(ComplianceItem).filter(
        ComplianceItem.company_id == company_id,
        ComplianceItem.fiscal_year == fiscal_year,
    ).all()

    # 若无记录，自动生成
    if not existing:
        inc_date = None
        if company.incorporation_date:
            inc_date = company.incorporation_date.date() if hasattr(company.incorporation_date, "date") else company.incorporation_date
        
        fy_end_month = int(company.fiscal_year_end_month or "3")
        items_data = generate_annual_items(
            company_id=company_id,
            company_legal_type=company.company_legal_type or "limited",
            fiscal_year=fiscal_year,
            incorporation_date=inc_date,
            fiscal_year_end_month=fy_end_month,
        )
        for data in items_data:
            item = ComplianceItem(id=str(uuid.uuid4()), **data)
            db.add(item)
        db.commit()
        existing = db.query(ComplianceItem).filter(
            ComplianceItem.company_id == company_id,
            ComplianceItem.fiscal_year == fiscal_year,
        ).all()

    # 自动更新逾期状态
    _auto_update_overdue(existing, db)
    db.refresh_bind = None

    # 重新查询（状态可能已更新）
    items = db.query(ComplianceItem).filter(
        ComplianceItem.company_id == company_id,
        ComplianceItem.fiscal_year == fiscal_year,
    ).order_by(ComplianceItem.code).all()

    return {
        "fiscal_year": fiscal_year,
        "company_legal_type": company.company_legal_type,
        "has_incorporation_date": bool(company.incorporation_date),
        "items": [_item_to_dict(i) for i in items],
    }


# ── 更新单个合规事件 ──────────────────────────────────────────────────────

@router.put("/{item_id}")
def update_compliance_item(
    company_id: str,
    item_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    更新合规事件状态或手动设定截止日
    支持字段：status / due_date / notes / reminder_days_before
    """
    _get_company_or_403(company_id, current_user, db)
    item = db.query(ComplianceItem).filter(
        ComplianceItem.id == item_id,
        ComplianceItem.company_id == company_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="合规事件不存在")

    # 状态更新
    if "status" in payload:
        new_status = payload["status"]
        if new_status not in ("pending", "done", "snoozed", "overdue", "na"):
            raise HTTPException(status_code=400, detail="无效状态值")
        item.status = new_status
        if new_status == "done":
            item.completed_at = datetime.utcnow()
        elif item.completed_at and new_status != "done":
            item.completed_at = None

    # 手动截止日更新
    if "due_date" in payload and payload["due_date"]:
        try:
            due = datetime.fromisoformat(payload["due_date"].replace("Z", ""))
            item.due_date = due
            item.is_manual_date = True
            item.needs_manual = False
        except (ValueError, AttributeError):
            raise HTTPException(status_code=400, detail="日期格式错误，请使用 ISO 8601 格式")

    # 备注
    if "notes" in payload:
        item.notes = payload["notes"]

    # 提醒天数
    if "reminder_days_before" in payload:
        item.reminder_days_before = int(payload["reminder_days_before"])

    item.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(item)
    return _item_to_dict(item)


# ── 强制重新生成清单 ────────────────────────────────────────────────────────

@router.post("/regenerate")
def regenerate_compliance_items(
    company_id: str,
    year: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    强制删除并重新生成指定财年的合规清单
    注意：已完成（done）的事件状态将被保留
    """
    company = _get_company_or_403(company_id, current_user, db)
    fiscal_year = year or _current_fiscal_year()

    # 保留已完成事件的状态（用 code 作为 key）
    completed_statuses = {}
    existing = db.query(ComplianceItem).filter(
        ComplianceItem.company_id == company_id,
        ComplianceItem.fiscal_year == fiscal_year,
    ).all()
    for item in existing:
        if item.status in ("done", "snoozed"):
            completed_statuses[item.code] = {
                "status": item.status,
                "completed_at": item.completed_at,
                "notes": item.notes,
            }
        db.delete(item)
    db.commit()

    # 重新生成
    inc_date = None
    if company.incorporation_date:
        inc_date = company.incorporation_date.date() if hasattr(company.incorporation_date, "date") else company.incorporation_date

    fy_end_month = int(company.fiscal_year_end_month or "3")
    items_data = generate_annual_items(
        company_id=company_id,
        company_legal_type=company.company_legal_type or "limited",
        fiscal_year=fiscal_year,
        incorporation_date=inc_date,
        fiscal_year_end_month=fy_end_month,
    )
    for data in items_data:
        # 还原已完成状态
        if data["code"] in completed_statuses:
            saved = completed_statuses[data["code"]]
            data["status"] = saved["status"]
            data["completed_at"] = saved["completed_at"]
            data["notes"] = saved["notes"] or data["notes"]
        item = ComplianceItem(id=str(uuid.uuid4()), **data)
        db.add(item)
    db.commit()

    return {"message": f"已重新生成 {fiscal_year} 合规清单", "fiscal_year": fiscal_year}


# ── Dashboard 摘要 ──────────────────────────────────────────────────────────

@router.get("/summary")
def get_compliance_summary_api(
    company_id: str,
    year: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Dashboard 摘要：逾期数/即将到期数/待处理总数"""
    _get_company_or_403(company_id, current_user, db)
    fiscal_year = year or _current_fiscal_year()

    items = db.query(ComplianceItem).filter(
        ComplianceItem.company_id == company_id,
        ComplianceItem.fiscal_year == fiscal_year,
    ).all()

    # 自动更新逾期
    _auto_update_overdue(items, db)

    items_dict = [_item_to_dict(i) for i in items]
    summary = get_compliance_summary(items_dict)
    summary["fiscal_year"] = fiscal_year
    return summary
