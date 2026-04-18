"""
HR 员工管理路由
前缀：/companies/{company_id}/hr
包含：员工档案 / 薪资管理 / 假期管理 / MPF报表 / eMPF导出
"""
import csv
import io
import uuid
from datetime import datetime, date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models.company import Company
from models.hr import Employee, PayrollRecord, LeaveBalance, LeaveRequest, LeaveStatus, PayrollStatus
from schemas import (
    EmployeeCreate, EmployeeUpdate, EmployeeOut, EmployeeTerminate,
    PayrollCreate, PayrollUpdate, PayrollOut, PayrollMPFSummary,
    LeaveRequestCreate, LeaveRequestApprove, LeaveRequestOut, LeaveBalanceOut,
)
from services.mpf_calculator import calculate_net_pay, calc_annual_leave_entitlement, calc_sick_leave_entitlement, get_hk_fiscal_year
from services.payslip_generator import generate_payslip_pdf
from services.payroll_expense_sync import sync_payroll_to_expense
from routers.auth import get_current_user
from models.company import User

router = APIRouter(prefix="/companies/{company_id}/hr", tags=["HR"])


# ─── 工具函数 ──────────────────────────────────────────────────────────────────

def _get_company_or_404(company_id: str, db: Session, user: User) -> Company:
    """验证公司归属并返回 Company 对象"""
    from models.company import UserCompanyAccess
    access = db.query(UserCompanyAccess).filter_by(
        user_id=user.id, company_id=company_id
    ).first()
    if not access:
        raise HTTPException(status_code=403, detail="无权访问此公司")
    company = db.query(Company).filter_by(id=company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="公司不存在")
    return company


def _next_employee_number(company_id: str, db: Session) -> str:
    """生成下一个员工编号，格式 EMP-001"""
    count = db.query(func.count(Employee.id)).filter_by(company_id=company_id).scalar() or 0
    return f"EMP-{count + 1:03d}"


def _mask_hkid(hkid: Optional[str]) -> Optional[str]:
    """HKID 脱敏显示：A123456(7) → A***456(7)"""
    if not hkid or len(hkid) < 4:
        return hkid
    # 简单脱敏：保留首字母和后3位（含括号校验码）
    return hkid[0] + "***" + hkid[-4:]


def _employee_to_out(emp: Employee) -> dict:
    """Employee ORM → EmployeeOut 字典（含脱敏处理）"""
    d = {c.name: getattr(emp, c.name) for c in emp.__table__.columns}
    d["hkid_masked"] = _mask_hkid(emp.hkid)
    d.pop("hkid", None)         # 不向前端返回原始HKID
    d.pop("bank_account", None)  # 不向前端返回原始银行账号
    return d


def _sync_leave_balance(employee: Employee, db: Session, year: int = None):
    """确保员工有当年的假期余额记录，不存在则自动创建"""
    if year is None:
        year = date.today().year
    existing = db.query(LeaveBalance).filter_by(
        employee_id=employee.id, year=year
    ).first()
    if existing:
        return existing

    hire_date = employee.hire_date
    if hire_date and isinstance(hire_date, str):
        hire_date = date.fromisoformat(hire_date)

    annual_entitled = calc_annual_leave_entitlement(hire_date) if hire_date else 7
    sick_entitled   = calc_sick_leave_entitlement(hire_date) if hire_date else 0

    balance = LeaveBalance(
        id=str(uuid.uuid4()),
        company_id=employee.company_id,
        employee_id=employee.id,
        year=year,
        annual_leave_entitled=annual_entitled,
        annual_leave_balance=annual_entitled,
        sick_leave_entitled=sick_entitled,
        statutory_holidays=17,  # 2024年起香港17天法定假日
    )
    db.add(balance)
    db.commit()
    db.refresh(balance)
    return balance


# ═══════════════════════════════════════════════════════════════════════════════
# 员工档案 CRUD
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/employees", summary="员工列表")
def list_employees(
    company_id: str,
    active_only: bool = Query(True, description="仅显示在职员工"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_company_or_404(company_id, db, current_user)
    q = db.query(Employee).filter_by(company_id=company_id)
    if active_only:
        q = q.filter(Employee.is_active == True)
    employees = q.order_by(Employee.employee_number).all()
    return [_employee_to_out(e) for e in employees]


@router.post("/employees", summary="新增员工")
def create_employee(
    company_id: str,
    data: EmployeeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_company_or_404(company_id, db, current_user)

    emp = Employee(
        id=str(uuid.uuid4()),
        company_id=company_id,
        employee_number=_next_employee_number(company_id, db),
        name_zh=data.name_zh,
        name_en=data.name_en,
        hkid=data.hkid,           # TODO: 生产环境替换为 AES 加密
        gender=data.gender,
        date_of_birth=data.date_of_birth,
        position=data.position,
        department=data.department,
        employment_type=data.employment_type,
        hire_date=data.hire_date,
        is_active=True,
        base_salary=data.base_salary,
        salary_type=data.salary_type,
        is_continuous_contract=data.is_continuous_contract,
        mpf_scheme=data.mpf_scheme,
        mpf_member_no=data.mpf_member_no,
        bank_name=data.bank_name,
        bank_account=data.bank_account,  # TODO: AES 加密
        email=data.email,
        phone=data.phone,
        emergency_contact=data.emergency_contact,
        notes=data.notes,
    )
    db.add(emp)
    db.commit()
    db.refresh(emp)

    # 自动创建当年假期余额
    _sync_leave_balance(emp, db)

    return _employee_to_out(emp)


@router.get("/employees/{employee_id}", summary="员工详情")
def get_employee(
    company_id: str,
    employee_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_company_or_404(company_id, db, current_user)
    emp = db.query(Employee).filter_by(id=employee_id, company_id=company_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="员工不存在")
    return _employee_to_out(emp)


@router.put("/employees/{employee_id}", summary="更新员工档案")
def update_employee(
    company_id: str,
    employee_id: str,
    data: EmployeeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_company_or_404(company_id, db, current_user)
    emp = db.query(Employee).filter_by(id=employee_id, company_id=company_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="员工不存在")

    update_fields = data.model_dump(exclude_none=True)
    for key, val in update_fields.items():
        if hasattr(emp, key):
            setattr(emp, key, val)

    emp.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(emp)
    return _employee_to_out(emp)


@router.post("/employees/{employee_id}/terminate", summary="标记员工离职（软删除）")
def terminate_employee(
    company_id: str,
    employee_id: str,
    data: EmployeeTerminate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_company_or_404(company_id, db, current_user)
    emp = db.query(Employee).filter_by(id=employee_id, company_id=company_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="员工不存在")

    emp.termination_date = data.termination_date
    emp.is_active = False
    emp.updated_at = datetime.utcnow()
    db.commit()
    return {"message": f"员工 {emp.name_zh} 已标记离职", "termination_date": str(data.termination_date)}


# ═══════════════════════════════════════════════════════════════════════════════
# 薪资管理
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/payroll", summary="薪资记录列表")
def list_payroll(
    company_id: str,
    month: Optional[str] = Query(None, description="薪资月份 YYYY-MM"),
    employee_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None, description="draft | confirmed"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_company_or_404(company_id, db, current_user)
    q = db.query(PayrollRecord).filter_by(company_id=company_id)
    if month:
        q = q.filter(PayrollRecord.payroll_month == month)
    if employee_id:
        q = q.filter(PayrollRecord.employee_id == employee_id)
    if status:
        q = q.filter(PayrollRecord.status == status)

    records = q.order_by(PayrollRecord.payroll_month.desc(), PayrollRecord.created_at).all()

    result = []
    for r in records:
        d = {c.name: float(getattr(r, c.name)) if hasattr(getattr(r, c.name, None), '__float__') else getattr(r, c.name)
             for c in r.__table__.columns}
        emp = db.query(Employee).filter_by(id=r.employee_id).first()
        d["employee_name"] = emp.name_zh if emp else None
        # 转换 Decimal 为 float
        for k in ["base_salary", "bonus", "allowances", "overtime_pay",
                  "gross_pay", "employee_mpf", "employer_mpf", "net_pay"]:
            if d.get(k) is not None:
                d[k] = float(d[k])
        result.append(d)
    return result


@router.post("/payroll/generate", summary="批量生成当月草稿薪资单")
def generate_payroll(
    company_id: str,
    month: str = Query(..., description="薪资月份 YYYY-MM"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    为所有在职员工批量生成指定月份的草稿薪资单。
    已存在的不重复创建。
    """
    _get_company_or_404(company_id, db, current_user)

    # 解析月份
    try:
        dt = datetime.strptime(month, "%Y-%m")
    except ValueError:
        raise HTTPException(status_code=400, detail="月份格式错误，请使用 YYYY-MM")

    tax_year = get_hk_fiscal_year(dt.year, dt.month)
    active_employees = db.query(Employee).filter_by(company_id=company_id, is_active=True).all()

    created, skipped = 0, 0
    for emp in active_employees:
        # 检查是否已存在
        exists = db.query(PayrollRecord).filter_by(
            company_id=company_id,
            employee_id=emp.id,
            payroll_month=month,
        ).first()
        if exists:
            skipped += 1
            continue

        # MPF 计算
        gross = float(emp.base_salary or 0)
        mpf = calculate_net_pay(gross)

        record = PayrollRecord(
            id=str(uuid.uuid4()),
            company_id=company_id,
            employee_id=emp.id,
            payroll_month=month,
            base_salary=emp.base_salary or 0,
            bonus=0, allowances=0, overtime_pay=0,
            gross_pay=mpf["gross_pay"],
            employee_mpf=mpf["employee_mpf"],
            employer_mpf=mpf["employer_mpf"],
            mpf_exempt=mpf["mpf_exempt"],
            net_pay=mpf["net_pay"],
            tax_year=tax_year,
            status=PayrollStatus.draft,
        )
        db.add(record)
        created += 1

    db.commit()
    return {"message": f"已生成 {created} 张草稿薪资单，{skipped} 张已跳过（已存在）", "month": month}


@router.post("/payroll", summary="手动创建单条薪资记录")
def create_payroll(
    company_id: str,
    data: PayrollCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_company_or_404(company_id, db, current_user)

    emp = db.query(Employee).filter_by(id=str(data.employee_id), company_id=company_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="员工不存在")

    try:
        dt = datetime.strptime(data.payroll_month, "%Y-%m")
    except ValueError:
        raise HTTPException(status_code=400, detail="月份格式错误，请使用 YYYY-MM")

    # 计算应发总计
    gross = data.base_salary + data.bonus + data.allowances + data.overtime_pay
    mpf = calculate_net_pay(gross)
    tax_year = get_hk_fiscal_year(dt.year, dt.month)

    record = PayrollRecord(
        id=str(uuid.uuid4()),
        company_id=company_id,
        employee_id=str(data.employee_id),
        payroll_month=data.payroll_month,
        base_salary=data.base_salary,
        bonus=data.bonus,
        allowances=data.allowances,
        overtime_pay=data.overtime_pay,
        gross_pay=mpf["gross_pay"],
        employee_mpf=mpf["employee_mpf"],
        employer_mpf=mpf["employer_mpf"],
        mpf_exempt=mpf["mpf_exempt"],
        net_pay=mpf["net_pay"],
        tax_year=tax_year,
        notes=data.notes,
        status=PayrollStatus.draft,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    d = {c.name: getattr(record, c.name) for c in record.__table__.columns}
    for k in ["base_salary", "bonus", "allowances", "overtime_pay",
              "gross_pay", "employee_mpf", "employer_mpf", "net_pay"]:
        if d.get(k) is not None:
            d[k] = float(d[k])
    d["employee_name"] = emp.name_zh
    return d


@router.put("/payroll/{record_id}", summary="修改薪资单")
def update_payroll(
    company_id: str,
    record_id: str,
    data: PayrollUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_company_or_404(company_id, db, current_user)
    record = db.query(PayrollRecord).filter_by(id=record_id, company_id=company_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="薪资记录不存在")
    if record.status == PayrollStatus.confirmed:
        raise HTTPException(status_code=400, detail="已确认的薪资单不可修改")

    if data.base_salary is not None:
        record.base_salary = data.base_salary
    if data.bonus is not None:
        record.bonus = data.bonus
    if data.allowances is not None:
        record.allowances = data.allowances
    if data.overtime_pay is not None:
        record.overtime_pay = data.overtime_pay
    if data.notes is not None:
        record.notes = data.notes

    # 重新计算MPF
    gross = float(record.base_salary or 0) + float(record.bonus or 0) + \
            float(record.allowances or 0) + float(record.overtime_pay or 0)
    mpf = calculate_net_pay(gross)
    record.gross_pay    = mpf["gross_pay"]
    record.employee_mpf = mpf["employee_mpf"]
    record.employer_mpf = mpf["employer_mpf"]
    record.mpf_exempt   = mpf["mpf_exempt"]
    record.net_pay      = mpf["net_pay"]
    record.updated_at   = datetime.utcnow()

    db.commit()
    db.refresh(record)
    return {"message": "薪资单已更新", "id": record_id}


@router.post("/payroll/{record_id}/confirm", summary="确认薪资单")
def confirm_payroll(
    company_id: str,
    record_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_company_or_404(company_id, db, current_user)
    record = db.query(PayrollRecord).filter_by(id=record_id, company_id=company_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="薪资记录不存在")
    if record.status == PayrollStatus.confirmed:
        return {"message": "薪资单已经是确认状态", "id": record_id, "already_confirmed": True}

    # ── Step 1: 确认状态 ──────────────────────────────────────────────
    record.status     = PayrollStatus.confirmed
    record.updated_at = datetime.utcnow()
    db.commit()

    # ── Step 2: 自动写入支出凭证（薪酸 + 雇主MPF）─────────────────────
    sync_result = sync_payroll_to_expense(record_id, db)

    return {
        "message": "薪资单已确认",
        "id": record_id,
        "expense_sync": sync_result,   # 返回生成的支出凭证信息，方便前端展示
    }


@router.get("/payroll/labor-cost", summary="月度人力成本汇总")
def get_labor_cost_summary(
    company_id: str,
    month: str = Query(..., description="月份 YYYY-MM"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    返回指定月份已确认薪资对应的人力成本拆解：
      - 总薪酸成本（gross_pay 之和）
      - 雇主 MPF 供款总和
      - 公司总实务成本 = gross_pay + employer_mpf
    同时列出已关联到支出模块的凭证号列表。
    """
    _get_company_or_404(company_id, db, current_user)
    from models.expense import Expense

    records = db.query(PayrollRecord).filter_by(
        company_id=company_id,
        payroll_month=month,
        status=PayrollStatus.confirmed,
    ).all()

    total_gross    = round(sum(float(r.gross_pay or 0) for r in records), 2)
    total_emp_mpf  = round(sum(float(r.employee_mpf or 0) for r in records), 2)
    total_er_mpf   = round(sum(float(r.employer_mpf or 0) for r in records), 2)
    total_net      = round(sum(float(r.net_pay or 0) for r in records), 2)
    total_cost     = round(total_gross + total_er_mpf, 2)

    # 关联的支出凭证
    linked_expenses = db.query(Expense).filter_by(
        company_id=company_id,
        source_type="payroll",
    ).filter(
        Expense.source_ref.in_([r.id for r in records])
    ).all() if records else []

    return {
        "payroll_month":      month,
        "confirmed_count":    len(records),
        "total_gross_pay":    total_gross,
        "total_employee_mpf": total_emp_mpf,
        "total_employer_mpf": total_er_mpf,
        "total_net_pay":      total_net,
        "total_company_cost": total_cost,   # 都是公司实务支出
        "expense_vouchers": [
            {
                "voucher_number": e.voucher_number,
                "description":    e.description,
                "amount_hkd":     float(e.amount_hkd or 0),
                "source_ref":     e.source_ref,
            }
            for e in linked_expenses
        ],
    }


@router.get("/payroll/{record_id}/pdf", summary="下载薪资单 PDF")
def download_payslip(
    company_id: str,
    record_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company = _get_company_or_404(company_id, db, current_user)
    record = db.query(PayrollRecord).filter_by(id=record_id, company_id=company_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="薪资记录不存在")

    emp = db.query(Employee).filter_by(id=record.employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="员工信息不存在")

    payroll_dict = {c.name: (float(getattr(record, c.name))
                              if hasattr(getattr(record, c.name, None), '__float__')
                              else getattr(record, c.name))
                   for c in record.__table__.columns}
    employee_dict = {c.name: getattr(emp, c.name) for c in emp.__table__.columns}
    company_dict  = {c.name: getattr(company, c.name) for c in company.__table__.columns}

    pdf_bytes = generate_payslip_pdf(payroll_dict, employee_dict, company_dict)

    filename = f"payslip_{emp.employee_number}_{record.payroll_month}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── MPF 汇总报表 ──────────────────────────────────────────────────────────────

@router.get("/payroll/mpf-summary", summary="月度MPF供款汇总")
def get_mpf_summary(
    company_id: str,
    month: str = Query(..., description="月份 YYYY-MM"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_company_or_404(company_id, db, current_user)
    records = db.query(PayrollRecord).filter_by(
        company_id=company_id,
        payroll_month=month,
        status=PayrollStatus.confirmed,
    ).all()

    result_records = []
    for r in records:
        emp = db.query(Employee).filter_by(id=r.employee_id).first()
        d = {c.name: getattr(r, c.name) for c in r.__table__.columns}
        for k in ["base_salary", "bonus", "allowances", "overtime_pay",
                  "gross_pay", "employee_mpf", "employer_mpf", "net_pay"]:
            if d.get(k) is not None:
                d[k] = float(d[k])
        d["employee_name"] = emp.name_zh if emp else None
        result_records.append(d)

    return {
        "payroll_month": month,
        "total_employees": len(records),
        "total_gross_pay":     round(sum(float(r.gross_pay or 0) for r in records), 2),
        "total_employee_mpf":  round(sum(float(r.employee_mpf or 0) for r in records), 2),
        "total_employer_mpf":  round(sum(float(r.employer_mpf or 0) for r in records), 2),
        "total_mpf":           round(sum(float(r.employee_mpf or 0) + float(r.employer_mpf or 0) for r in records), 2),
        "records": result_records,
    }


@router.get("/payroll/mpf-export", summary="导出 eMPF Bulk Upload CSV 文件")
def export_empf_csv(
    company_id: str,
    month: str = Query(..., description="月份 YYYY-MM"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    生成符合积金易（eMPF）平台 Bulk Upload 标准的 CSV 文件。
    - 编码：UTF-8 with BOM（防止 Excel 中文乱码）
    - 日期格式：DD/MM/YYYY
    - 金额格式：两位小数，无货币符号
    """
    _get_company_or_404(company_id, db, current_user)
    records = db.query(PayrollRecord).filter_by(
        company_id=company_id,
        payroll_month=month,
        status=PayrollStatus.confirmed,
    ).all()

    if not records:
        raise HTTPException(status_code=404, detail="当月无已确认薪资记录，请先确认所有薪资单")

    # 解析月份为"最后一日"（取月份最后一天作为供款期）
    try:
        dt = datetime.strptime(month, "%Y-%m")
        import calendar
        last_day = calendar.monthrange(dt.year, dt.month)[1]
        period_str = f"{last_day:02d}/{dt.month:02d}/{dt.year}"
    except Exception:
        period_str = ""

    output = io.StringIO()
    # eMPF 标准列头
    fieldnames = [
        "Payroll Group ID",
        "Member Number",
        "HKID No",
        "Name",
        "Contribution Period",
        "Relevant Income",
        "Mandatory Contribution (Employee)",
        "Mandatory Contribution (Employer)",
        "Voluntary Contribution (Employee)",
        "Voluntary Contribution (Employer)",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()

    for r in records:
        emp = db.query(Employee).filter_by(id=r.employee_id).first()
        if not emp:
            continue

        writer.writerow({
            "Payroll Group ID":                  "",           # 用户需在eMPF平台确认
            "Member Number":                     emp.mpf_member_no or "",
            "HKID No":                           _mask_hkid(emp.hkid) or "",
            "Name":                              emp.name_en or emp.name_zh,
            "Contribution Period":               period_str,
            "Relevant Income":                   f"{float(r.gross_pay or 0):.2f}",
            "Mandatory Contribution (Employee)": f"{float(r.employee_mpf or 0):.2f}",
            "Mandatory Contribution (Employer)": f"{float(r.employer_mpf or 0):.2f}",
            "Voluntary Contribution (Employee)": "0.00",
            "Voluntary Contribution (Employer)": "0.00",
        })

    # UTF-8 BOM 编码
    csv_content = "\ufeff" + output.getvalue()
    filename = f"eMPF_Contribution_{month}.csv"

    return Response(
        content=csv_content.encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ═══════════════════════════════════════════════════════════════════════════════
# 假期管理
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/leave/balances", summary="全员假期余额")
def get_leave_balances(
    company_id: str,
    year: int = Query(None, description="年份（默认当年）"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_company_or_404(company_id, db, current_user)
    if year is None:
        year = date.today().year

    # 确保所有在职员工都有余额记录
    active_emps = db.query(Employee).filter_by(company_id=company_id, is_active=True).all()
    for emp in active_emps:
        _sync_leave_balance(emp, db, year)

    balances = db.query(LeaveBalance).filter_by(company_id=company_id, year=year).all()
    result = []
    for b in balances:
        emp = db.query(Employee).filter_by(id=b.employee_id).first()
        d = {c.name: getattr(b, c.name) for c in b.__table__.columns}
        d["employee_name"] = emp.name_zh if emp else None
        result.append(d)
    return result


@router.get("/leave", summary="假期申请列表")
def list_leave_requests(
    company_id: str,
    employee_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None, description="pending | approved | rejected"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_company_or_404(company_id, db, current_user)
    q = db.query(LeaveRequest).filter_by(company_id=company_id)
    if employee_id:
        q = q.filter(LeaveRequest.employee_id == employee_id)
    if status:
        q = q.filter(LeaveRequest.status == status)

    requests = q.order_by(LeaveRequest.created_at.desc()).all()
    result = []
    for r in requests:
        emp = db.query(Employee).filter_by(id=r.employee_id).first()
        d = {c.name: getattr(r, c.name) for c in r.__table__.columns}
        d["employee_name"] = emp.name_zh if emp else None
        d["days"] = float(d["days"]) if d.get("days") else 0
        result.append(d)
    return result


@router.post("/leave", summary="提交假期申请")
def create_leave_request(
    company_id: str,
    data: LeaveRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_company_or_404(company_id, db, current_user)
    emp = db.query(Employee).filter_by(id=str(data.employee_id), company_id=company_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="员工不存在")

    req = LeaveRequest(
        id=str(uuid.uuid4()),
        company_id=company_id,
        employee_id=str(data.employee_id),
        leave_type=data.leave_type,
        start_date=data.start_date,
        end_date=data.end_date,
        days=data.days,
        reason=data.reason,
        status=LeaveStatus.pending,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return {"message": "假期申请已提交", "id": req.id}


@router.put("/leave/{request_id}/approve", summary="批准或驳回假期申请")
def approve_leave_request(
    company_id: str,
    request_id: str,
    data: LeaveRequestApprove,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_company_or_404(company_id, db, current_user)
    req = db.query(LeaveRequest).filter_by(id=request_id, company_id=company_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="假期申请不存在")

    new_status = LeaveStatus.approved if data.approved else LeaveStatus.rejected
    req.status     = new_status
    req.approved_at = datetime.utcnow()
    req.notes      = data.notes
    req.updated_at = datetime.utcnow()

    # 如果批准年假/病假，更新余额
    if data.approved and req.leave_type in ("annual", "sick"):
        year = req.start_date.year
        balance = db.query(LeaveBalance).filter_by(
            employee_id=req.employee_id, year=year
        ).first()
        if balance:
            days = float(req.days)
            if req.leave_type == "annual":
                balance.annual_leave_taken  = (balance.annual_leave_taken or 0) + days
                balance.annual_leave_balance = max(0, (balance.annual_leave_balance or 0) - days)
            elif req.leave_type == "sick":
                balance.sick_leave_taken = (balance.sick_leave_taken or 0) + days
            balance.updated_at = datetime.utcnow()

    db.commit()
    action = "已批准" if data.approved else "已驳回"
    return {"message": f"假期申请{action}", "id": request_id, "status": new_status}
