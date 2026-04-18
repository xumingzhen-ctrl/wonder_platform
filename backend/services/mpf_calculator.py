"""
MPF 强积金计算器 — 纯函数实现，符合香港强积金局2024年规则

规则说明：
  - 供款率：雇主/雇员各 5%
  - 雇主上限：HK$1,500/月（月薪≥HK$30,000 时封顶）
  - 雇员供款豁免门槛：月薪 < HK$7,100（但雇主仍须供款）
  - 雇员供款上限：HK$1,500/月（月薪≥HK$30,000 时封顶）
  - 新雇员：入职后60天内必须加入MPF（60天豁免期内无须供款）

法定参考：《强制性公积金计划条例》（Cap. 485）
"""
from decimal import Decimal, ROUND_HALF_UP
from datetime import date


# ─── MPF 法定参数（2024年）─────────────────────────────────────────────────────

MPF_RATE             = Decimal("0.05")          # 供款率 5%
MPF_EMPLOYEE_EXEMPT  = Decimal("7100")           # 雇员豁免门槛（月薪低于此值免供）
MPF_CONTRIBUTION_CAP = Decimal("30000")          # 供款计算上限（月薪超过此值按此计算）
MPF_MAX_CONTRIBUTION = Decimal("1500")           # 最高供款额（5% × 30000）

# 年假递进天数表（《雇佣条例》附表3）
# key = 完整服务年数 (0-based), value = 应享年假天数
ANNUAL_LEAVE_TABLE = {
    0: 7,   # 第1年（不足2年）
    1: 7,   # 满1年至不足2年
    2: 8,   # 满2年至不足3年
    3: 9,
    4: 10,
    5: 11,
    6: 12,
    7: 13,
    8: 14,  # 满8年及以上（上限14天）
}


def calculate_mpf(gross_pay: float) -> dict:
    """
    根据月度应发工资计算 MPF 供款。

    Args:
        gross_pay: 当月应发工资（Relevant Income），单位 HKD

    Returns:
        dict:
            employee_mpf  - 雇员强制供款额
            employer_mpf  - 雇主强制供款额
            mpf_exempt    - 雇员是否享受豁免（月薪 < 7100）
            relevant_income  - 用于计算供款的相关入息（封顶后）
    """
    gross = Decimal(str(gross_pay)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    # 相关入息：供款计算上限为 HK$30,000
    relevant_income = min(gross, MPF_CONTRIBUTION_CAP)

    # 雇主供款：无豁免门槛，永远按 5% 计算，最高 HK$1,500
    employer_mpf = (relevant_income * MPF_RATE).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    employer_mpf = min(employer_mpf, MPF_MAX_CONTRIBUTION)

    # 雇员供款：月薪 < HK$7,100 豁免
    if gross < MPF_EMPLOYEE_EXEMPT:
        employee_mpf = Decimal("0.00")
        mpf_exempt = True
    else:
        employee_mpf = (relevant_income * MPF_RATE).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        employee_mpf = min(employee_mpf, MPF_MAX_CONTRIBUTION)
        mpf_exempt = False

    return {
        "employee_mpf":    float(employee_mpf),
        "employer_mpf":    float(employer_mpf),
        "mpf_exempt":      mpf_exempt,
        "relevant_income": float(relevant_income),
    }


def calculate_net_pay(gross_pay: float) -> dict:
    """
    计算完整的薪资明细（应发 → 供款 → 实发）。

    Args:
        gross_pay: 当月应发工资

    Returns:
        dict: 包含所有供款字段和实发工资
    """
    mpf = calculate_mpf(gross_pay)
    gross = Decimal(str(gross_pay)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    net_pay = gross - Decimal(str(mpf["employee_mpf"]))

    return {
        **mpf,
        "gross_pay": float(gross),
        "net_pay":   float(net_pay),
    }


def calc_annual_leave_entitlement(hire_date: date, reference_date: date = None) -> int:
    """
    根据入职日期计算应享年假天数（《雇佣条例》附表3）。

    Args:
        hire_date:      入职日期
        reference_date: 参考日期（默认为今日）

    Returns:
        int: 应享年假天数（7-14天）
    """
    if reference_date is None:
        reference_date = date.today()

    # 计算完整服务年数
    years = reference_date.year - hire_date.year
    if (reference_date.month, reference_date.day) < (hire_date.month, hire_date.day):
        years -= 1

    years = max(0, years)

    # 查表，8年及以上均为14天
    return ANNUAL_LEAVE_TABLE.get(years, 14)


def calc_sick_leave_entitlement(hire_date: date, reference_date: date = None) -> int:
    """
    计算累积的有薪病假天数。
    规则：连续受雇满1个月后每满月累积2天，上限36天。

    Args:
        hire_date:      入职日期
        reference_date: 参考日期（默认为今日）

    Returns:
        int: 累积有薪病假天数（0-36）
    """
    if reference_date is None:
        reference_date = date.today()

    # 计算完整服务月数
    months = (reference_date.year - hire_date.year) * 12 + \
             (reference_date.month - hire_date.month)
    if reference_date.day < hire_date.day:
        months -= 1

    months = max(0, months)
    return min(months * 2, 36)


def is_continuous_contract(weekly_hours: float = None, monthly_hours: float = None) -> bool:
    """
    判断员工是否符合"连续合同"（468规则）。
    规则：连续4周，每周工时≥18小时（即4周共≥68小时）。

    Args:
        weekly_hours:  平均每周工时
        monthly_hours: 平均每月工时（4周）

    Returns:
        bool: True = 符合连续合同，享受全部劳工条例保障
    """
    if weekly_hours is not None:
        return weekly_hours >= 18
    if monthly_hours is not None:
        return monthly_hours >= 68
    return True  # 全职默认为连续合同


def get_hk_fiscal_year(year: int, month: int) -> str:
    """
    根据年月计算香港财政年度（4月-3月制）。

    Args:
        year:  公历年份
        month: 公历月份（1-12）

    Returns:
        str: 财年标识，如 "2025-26"
    """
    if month >= 4:
        return f"{year}-{str(year + 1)[-2:]}"
    else:
        return f"{year - 1}-{str(year)[-2:]}"
