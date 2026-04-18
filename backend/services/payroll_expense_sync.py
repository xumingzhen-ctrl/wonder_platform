"""
payroll_expense_sync.py — 薪资 → 支出自动联动服务

当薪资单「确认」时，自动在支出凭证表写入两条记录：
  1. 员工薪酬（含奖金/津贴）— 分类 STAFF，凭证号 PAY-YYYYMM-{empNo}
  2. 雇主强积金供款           — 分类 STAFF，凭证号 MPF-YYYYMM-{empNo}

防重机制：通过 Expense.source_ref = PayrollRecord.id 检查，确认过的薪资单
          不会重复写入。

撤销机制：若薪资单被（未来）撤销，可以 source_ref 批量删除对应支出记录。
"""
import uuid
from datetime import datetime, date
from sqlalchemy.orm import Session

from models.expense import Expense, ExpenseCategory, ExpenseStatus
from models.hr import PayrollRecord, Employee
from services.mpf_calculator import get_hk_fiscal_year


def _get_staff_category_id(db: Session) -> str:
    """查找「员工津贴福利」分类 ID（STAFF），不存在时返回 None"""
    cat = db.query(ExpenseCategory).filter(ExpenseCategory.code == "STAFF").first()
    return cat.id if cat else None


def _next_payroll_voucher(company_id: str, month: str, emp_no: str, prefix: str, db: Session) -> str:
    """
    生成薪资相关支出凭证号，格式：
      PAY-202404-EMP001  (薪酬)
      MPF-202404-EMP001  (强积金)
    防冲突：如已存在则加序号后缀 -2, -3 ...
    """
    month_compact = month.replace("-", "")  # 2026-04 → 202604
    base = f"{prefix}-{month_compact}-{emp_no}"
    candidate = base
    n = 1
    while db.query(Expense).filter(Expense.voucher_number == candidate).first():
        n += 1
        candidate = f"{base}-{n}"
    return candidate


def sync_payroll_to_expense(payroll_id: str, db: Session) -> dict:
    """
    核心联动函数：将已确认的薪资单写入支出记录。

    Args:
        payroll_id: PayrollRecord.id
        db:         SQLAlchemy Session

    Returns:
        dict: { salary_expense_id, mpf_expense_id, skipped }
              若已存在对应记录，skipped=True
    """
    record = db.query(PayrollRecord).filter(PayrollRecord.id == payroll_id).first()
    if not record:
        raise ValueError(f"薪资记录不存在: {payroll_id}")

    # ── 防重检查（同一 source_ref 已存在则跳过）──────────────────────────
    existing = db.query(Expense).filter(
        Expense.source_ref == payroll_id,
        Expense.source_type == "payroll",
    ).all()
    if existing:
        return {"skipped": True, "existing_count": len(existing)}

    # ── 元数据 ────────────────────────────────────────────────────────────
    emp = db.query(Employee).filter(Employee.id == record.employee_id).first()
    emp_name = emp.name_zh if emp else "未知员工"
    emp_no   = emp.employee_number if emp else "UNKNOWN"

    # 薪资月份的最后一日作为「收据日期」
    import calendar
    dt = datetime.strptime(record.payroll_month, "%Y-%m")
    last_day = calendar.monthrange(dt.year, dt.month)[1]
    payroll_date = date(dt.year, dt.month, last_day)

    fiscal_year = get_hk_fiscal_year(dt.year, dt.month)
    staff_cat_id = _get_staff_category_id(db)

    gross_pay    = float(record.gross_pay or 0)
    employer_mpf = float(record.employer_mpf or 0)
    net_pay      = float(record.net_pay or 0)

    # ── 记录1：员工薪酬（gross_pay = 底薪+奖金+津贴，税务上属于公司全额可扣成本）──
    # 公司实际支付的薪酬成本 = 员工实发(net_pay) + 员工自付MPF = gross_pay
    salary_voucher = _next_payroll_voucher(
        record.company_id, record.payroll_month, emp_no, "PAY", db
    )
    salary_exp = Expense(
        id=str(uuid.uuid4()),
        company_id=record.company_id,
        voucher_number=salary_voucher,
        receipt_date=payroll_date,
        vendor_name=emp_name,
        description=(
            f"員工薪酬 — {emp_name}（{emp_no}）"
            f"｜{record.payroll_month}應發：HK${gross_pay:,.2f}"
            f"｜雇員MPF：HK${float(record.employee_mpf or 0):,.2f}"
            f"｜實發：HK${net_pay:,.2f}"
        ),
        currency="HKD",
        total_amount=gross_pay,
        amount_hkd=gross_pay,
        amount_original=gross_pay,
        fiscal_year=fiscal_year,
        category_id=staff_cat_id,
        receipt_type="other",
        source_type="payroll",
        source_ref=payroll_id,
        status=ExpenseStatus.confirmed,  # 薪资确认后直接 confirmed，无需人工复核
        notes=f"由薪資單自動生成 | 薪資月份: {record.payroll_month} | 員工: {emp_name}",
    )
    db.add(salary_exp)

    # ── 记录2：雇主MPF供款（额外劳工成本，独立计入 STAFF 分类）───────────────
    mpf_voucher = _next_payroll_voucher(
        record.company_id, record.payroll_month, emp_no, "MPF", db
    )
    mpf_exp = Expense(
        id=str(uuid.uuid4()),
        company_id=record.company_id,
        voucher_number=mpf_voucher,
        receipt_date=payroll_date,
        vendor_name=f"強積金局（{emp_name}）",
        description=(
            f"雇主強積金供款 — {emp_name}（{emp_no}）"
            f"｜{record.payroll_month}"
            f"｜相關入息：HK${float(record.gross_pay or 0):,.2f}"
            f"｜供款率：5%"
        ),
        currency="HKD",
        total_amount=employer_mpf,
        amount_hkd=employer_mpf,
        amount_original=employer_mpf,
        fiscal_year=fiscal_year,
        category_id=staff_cat_id,
        receipt_type="other",
        source_type="payroll",
        source_ref=payroll_id,
        status=ExpenseStatus.confirmed,
        notes=f"雇主MPF供款，由薪資單自動生成 | 薪資月份: {record.payroll_month}",
    )
    db.add(mpf_exp)

    db.commit()
    db.refresh(salary_exp)
    db.refresh(mpf_exp)

    return {
        "skipped": False,
        "salary_expense_id":   salary_exp.id,
        "salary_voucher":      salary_voucher,
        "salary_amount":       gross_pay,
        "mpf_expense_id":      mpf_exp.id,
        "mpf_voucher":         mpf_voucher,
        "mpf_amount":          employer_mpf,
        "total_cost":          round(gross_pay + employer_mpf, 2),
    }


def unsync_payroll_from_expense(payroll_id: str, db: Session) -> int:
    """
    撤销联动：删除由该薪资单生成的所有支出记录（若未来支持薪资撤回时使用）。
    返回删除记录数。
    """
    expenses = db.query(Expense).filter(
        Expense.source_ref == payroll_id,
        Expense.source_type == "payroll",
    ).all()
    count = len(expenses)
    for exp in expenses:
        db.delete(exp)
    db.commit()
    return count
