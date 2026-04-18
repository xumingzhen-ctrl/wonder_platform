"""
lease_expense_sync.py — 租约付款 → 支出凭证自动联动服务

支持两种触发：
  1. LeasePayment 标记为 paid → 自动写 Expense（source_type='lease'）
  2. LeaseMiscFee 标记为 paid → 自动写 Expense（source_type='lease_misc'）

凭证号格式：
  月付租金:  RENT-202604-LS001
  季付租金:  RENT-2026Q2-LS001
  年付租金:  RENT-2026Y-LS001
  印花税:    STAMP-202604-LS001
  中介费:    AGENT-202604-LS001
  管理费:    MGMT-202604-LS001
  其他杂费:  MISC-202604-LS001

防重机制：通过 Expense.source_ref = LeasePayment.id / LeaseMiscFee.id 检查
"""
import uuid
from datetime import date, datetime
from sqlalchemy.orm import Session

from models.expense import Expense, ExpenseCategory, ExpenseStatus
from models.lease import Lease, LeasePayment, LeaseMiscFee, MiscFeeType, PaymentFrequency
from services.mpf_calculator import get_hk_fiscal_year


# ────────────────────────────────────────────────────────────────
# 内部辅助
# ────────────────────────────────────────────────────────────────

def _get_category_id(code: str, db: Session) -> str | None:
    """按 code 查分类ID"""
    cat = db.query(ExpenseCategory).filter(ExpenseCategory.code == code).first()
    return cat.id if cat else None


_MISC_FEE_PREFIX = {
    MiscFeeType.stamp_duty:      "STAMP",
    MiscFeeType.agency_fee:      "AGENT",
    MiscFeeType.management_fee:  "MGMT",
    MiscFeeType.renovation:      "RENO",
    MiscFeeType.legal_fee:       "LEGAL",
    MiscFeeType.government_rate: "RATE",
    MiscFeeType.water_sewage:    "UTIL",
    MiscFeeType.other:           "MISC",
}

_MISC_FEE_NAME_ZH = {
    MiscFeeType.stamp_duty:      "印花稅",
    MiscFeeType.agency_fee:      "代理/中介費",
    MiscFeeType.management_fee:  "物業管理費",
    MiscFeeType.renovation:      "裝修費",
    MiscFeeType.legal_fee:       "律師費",
    MiscFeeType.government_rate: "差餉",
    MiscFeeType.water_sewage:    "水費排污費",
    MiscFeeType.other:           "其他雜費",
}


def _next_voucher(prefix: str, date_tag: str, lease_number: str, db: Session) -> str:
    """
    生成唯一支出凭证号，防冲突。
    格式: {PREFIX}-{date_tag}-{lease_number}
    若冲突则追加 -2, -3 ...
    """
    lease_short = lease_number.replace("LS-", "").replace("-", "")
    base = f"{prefix}-{date_tag}-{lease_short}"
    candidate = base
    n = 1
    while db.query(Expense).filter(Expense.voucher_number == candidate).first():
        n += 1
        candidate = f"{base}-{n}"
    return candidate


def _fiscal_year_from_date(d: date) -> str:
    """日期 → 香港财年字符串"""
    return get_hk_fiscal_year(d.year, d.month)


# ────────────────────────────────────────────────────────────────
# 付款周期 → date_tag（凭证号中的日期部分）
# ────────────────────────────────────────────────────────────────

def _period_date_tag(payment: LeasePayment, frequency: PaymentFrequency) -> str:
    """
    根据付款周期生成凭证号中的日期标签：
      monthly:   '202604'
      quarterly: '2026Q2'
      annual:    '2026Y'  (或 '202627' 代表财年)
    """
    if frequency == PaymentFrequency.monthly:
        return payment.period_start.strftime("%Y%m")
    elif frequency == PaymentFrequency.quarterly:
        # 计算季度号
        q = (payment.period_start.month - 1) // 3 + 1
        return f"{payment.period_start.year}Q{q}"
    else:  # annual
        # 用财年标签，如 202627
        fy = _fiscal_year_from_date(payment.period_start)
        return "".join(fy.split("-"))  # "2026-27" → "202627"


# ────────────────────────────────────────────────────────────────
# 核心接口 1：租金付款 → 支出
# ────────────────────────────────────────────────────────────────

def sync_rent_payment_to_expense(payment_id: str, db: Session) -> dict:
    """
    将已确认的租金付款写入支出记录。

    Args:
        payment_id: LeasePayment.id
        db: SQLAlchemy Session

    Returns:
        { skipped, expense_id, voucher_number, amount }
    """
    payment = db.query(LeasePayment).filter(LeasePayment.id == payment_id).first()
    if not payment:
        raise ValueError(f"租金付款记录不存在: {payment_id}")

    # ── 防重检查 ─────────────────────────────────────────────────
    existing = db.query(Expense).filter(
        Expense.source_ref == payment_id,
        Expense.source_type == "lease",
    ).first()
    if existing:
        return {"skipped": True, "expense_id": existing.id, "voucher_number": existing.voucher_number}

    # ── 获取关联租约 ──────────────────────────────────────────────
    lease = db.query(Lease).filter(Lease.id == payment.lease_id).first()
    if not lease:
        raise ValueError(f"关联租约不存在: {payment.lease_id}")

    # ── 财年和分类 ────────────────────────────────────────────────
    ref_date = payment.paid_date or payment.due_date or payment.period_start
    fiscal_year = _fiscal_year_from_date(ref_date)
    rent_cat_id = _get_category_id("OFFICE_RENT", db)

    # ── 金额（实付优先，否则应付） ────────────────────────────────
    amount = float(payment.amount_paid or payment.amount)

    # ── 周期标签生成 ──────────────────────────────────────────────
    date_tag = _period_date_tag(payment, lease.payment_frequency)
    voucher = _next_voucher("RENT", date_tag, lease.lease_number, db)

    # ── 描述文字 ──────────────────────────────────────────────────
    freq_zh = {"monthly": "月付", "quarterly": "季付", "annual": "年付"}.get(
        lease.payment_frequency, ""
    )
    desc = (
        f"辦公室租金 — {lease.property_name}｜"
        f"{freq_zh}賬期：{payment.period_label}｜"
        f"業主：{lease.landlord_name or '未知'}｜"
        f"HK${amount:,.2f}"
    )

    expense = Expense(
        id=str(uuid.uuid4()),
        company_id=payment.company_id,
        voucher_number=voucher,
        receipt_date=ref_date,
        vendor_name=lease.landlord_name or lease.property_name,
        description=desc,
        currency=payment.currency or "HKD",
        total_amount=amount,
        amount_hkd=float(payment.amount_hkd or amount),
        amount_original=amount,
        fiscal_year=fiscal_year,
        category_id=rent_cat_id,
        receipt_type="other",
        source_type="lease",
        source_ref=payment_id,
        status=ExpenseStatus.confirmed,
        notes=f"由租金付款自動生成 | 租約：{lease.lease_number} | 賬期：{payment.period_label}",
    )
    db.add(expense)

    # ── 回写 expense_voucher_id 到 LeasePayment ──────────────────
    payment.expense_voucher_id = expense.id
    db.commit()
    db.refresh(expense)

    return {
        "skipped": False,
        "expense_id": expense.id,
        "voucher_number": voucher,
        "amount": amount,
    }


# ────────────────────────────────────────────────────────────────
# 核心接口 2：杂费付款 → 支出
# ────────────────────────────────────────────────────────────────

def sync_misc_fee_to_expense(misc_fee_id: str, db: Session) -> dict:
    """
    将已确认的杂费写入支出记录。

    Args:
        misc_fee_id: LeaseMiscFee.id
        db: SQLAlchemy Session

    Returns:
        { skipped, expense_id, voucher_number, amount }
    """
    fee = db.query(LeaseMiscFee).filter(LeaseMiscFee.id == misc_fee_id).first()
    if not fee:
        raise ValueError(f"杂费记录不存在: {misc_fee_id}")

    # ── 防重检查 ─────────────────────────────────────────────────
    existing = db.query(Expense).filter(
        Expense.source_ref == misc_fee_id,
        Expense.source_type == "lease_misc",
    ).first()
    if existing:
        return {"skipped": True, "expense_id": existing.id, "voucher_number": existing.voucher_number}

    # ── 获取关联租约 ──────────────────────────────────────────────
    lease = db.query(Lease).filter(Lease.id == fee.lease_id).first()
    if not lease:
        raise ValueError(f"关联租约不存在: {fee.lease_id}")

    # ── 财年和分类 ────────────────────────────────────────────────
    ref_date = fee.paid_date or fee.due_date or date.today()
    fiscal_year = _fiscal_year_from_date(ref_date)

    # 杂费分类：优先按类型找专属分类，找不到则用 OFFICE_RENT 兜底
    cat_code_map = {
        MiscFeeType.stamp_duty:     "STAMP_DUTY",
        MiscFeeType.management_fee: "MGMT_FEE",
        MiscFeeType.legal_fee:      "PROFESSIONAL",
    }
    cat_code = cat_code_map.get(fee.fee_type, "OFFICE_RENT")
    cat_id = _get_category_id(cat_code, db) or _get_category_id("OFFICE_RENT", db)

    # ── 凭证号 ────────────────────────────────────────────────────
    prefix = _MISC_FEE_PREFIX.get(fee.fee_type, "MISC")
    date_tag = ref_date.strftime("%Y%m")
    voucher = _next_voucher(prefix, date_tag, lease.lease_number, db)

    amount = float(fee.amount)
    fee_name = _MISC_FEE_NAME_ZH.get(fee.fee_type, "其他雜費")

    desc = (
        f"{fee_name} — {lease.property_name}｜"
        f"{fee.description or ''}｜"
        f"HK${amount:,.2f}"
    )

    expense = Expense(
        id=str(uuid.uuid4()),
        company_id=fee.company_id,
        voucher_number=voucher,
        receipt_date=ref_date,
        vendor_name=lease.landlord_name or lease.property_name,
        description=desc,
        currency=fee.currency or "HKD",
        total_amount=amount,
        amount_hkd=float(fee.amount_hkd or amount),
        amount_original=amount,
        fiscal_year=fiscal_year,
        category_id=cat_id,
        receipt_type="other",
        source_type="lease_misc",
        source_ref=misc_fee_id,
        status=ExpenseStatus.confirmed,
        notes=f"由{fee_name}自動生成 | 租約：{lease.lease_number}",
    )
    db.add(expense)

    # ── 回写 expense_voucher_id 到 LeaseMiscFee ──────────────────
    fee.expense_voucher_id = expense.id
    db.commit()
    db.refresh(expense)

    return {
        "skipped": False,
        "expense_id": expense.id,
        "voucher_number": voucher,
        "amount": amount,
    }


# ────────────────────────────────────────────────────────────────
# 撤销接口（预留）
# ────────────────────────────────────────────────────────────────

def unsync_rent_payment_from_expense(payment_id: str, db: Session) -> int:
    """撤销：删除该租金付款生成的支出记录。返回删除数量。"""
    expenses = db.query(Expense).filter(
        Expense.source_ref == payment_id,
        Expense.source_type == "lease",
    ).all()
    count = len(expenses)
    for exp in expenses:
        db.delete(exp)
    db.commit()
    return count
