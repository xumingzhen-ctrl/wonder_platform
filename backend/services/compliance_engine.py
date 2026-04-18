"""
compliance_engine.py
合规义务规则引擎 — 根据公司法律形式和成立日期自动生成年度合规事件清单

支持的法律形式：
  limited   — 有限公司 (Cap. 32 公司条例)
  unlimited — 无限责任公司 (Cap. 310 商业登记条例)
  sole_prop — 独资经营 (Cap. 310 商业登记条例)
"""

from datetime import date, datetime, timedelta
from dateutil.relativedelta import relativedelta
from typing import Optional, List, Dict, Any

# ── 合规义务主数据表 ─────────────────────────────────────────────────────────
# applies_to: 'all' | 'limited' | 'unlimited' | 'sole_prop'
# has_employees: 仅适用于雇主（需额外拦截）
# calc_type: 'date_of_incorporation' | 'fiscal_year_end' | 'fixed' | 'event'

COMPLIANCE_RULES = [
    {
        "code": "C01",
        "title": "商業登記證續期 (BR)",
        "title_en": "Business Registration Certificate Renewal",
        "category": "ird",
        "authority": "稅務局 (IRD)",
        "applies_to": "all",
        "calc_type": "fixed",
        "legal_ref": "Cap. 310 商業登記條例",
        "penalty_note": "逾期罰款 HK$300–$3,000，每年或每三年續期",
        "reminder_days_before": 45,
        # 注：BR到期日与公司成立日同月份，每年或3年一次
        # 计算逻辑：由于各公司BR到期日不同，本项标记为 needs_manual（需用户确认具体到期日）
        "dynamic": False,
        "description": "商業登記證到期前至少30天辦理續期，逾期將面臨罰款。",
    },
    {
        "code": "C02",
        "title": "周年申報表 (NAR1)",
        "title_en": "Annual Return (Form NAR1)",
        "category": "cr",
        "authority": "公司註冊處 (CR)",
        "applies_to": "limited",
        "calc_type": "date_of_incorporation",
        "offset_days": 42,          # 成立周年日 + 42 天
        "legal_ref": "Cap. 32 § 662",
        "penalty_note": "逾期將被徵收高額登記費並可能被起訴，法定日期不可延期",
        "reminder_days_before": 30,
        "dynamic": True,
        "description": "每年在公司成立周年日後42天內向公司註冊處提交最新公司架構資料。",
    },
    {
        "code": "C03",
        "title": "利得稅申報 BIR51（法團）",
        "title_en": "Profits Tax Return (BIR51) – Corporation",
        "category": "ird",
        "authority": "稅務局 (IRD)",
        "applies_to": "limited",
        "calc_type": "fiscal_year_end",
        "offset_months": 10,        # 財年結束後約9個月發出，發出後1個月內提交，合計≈10個月
        "legal_ref": "Cap. 112 稅務條例 § 51",
        "penalty_note": "須連同核數財務報表提交，逾期罰款及估計評稅",
        "reminder_days_before": 30,
        "dynamic": True,
        "description": "財年結束後稅務局約9個月發出報稅表，收表後須在1個月內連同審計報告提交。",
    },
    {
        "code": "C04",
        "title": "利得稅申報 BIR60（個人入息）",
        "title_en": "Tax Return (BIR60) – Individual/Sole Prop",
        "category": "ird",
        "authority": "稅務局 (IRD)",
        "applies_to": "unlimited,sole_prop",
        "calc_type": "fixed",
        "fixed_month": 5,
        "fixed_day": 31,            # 每年5月31日（網上申報延至6月30日）
        "legal_ref": "Cap. 112 稅務條例 § 51",
        "penalty_note": "逾期罰款及估計評稅；網上申報可延至6月30日",
        "reminder_days_before": 45,
        "dynamic": True,
        "description": "東主或合夥人須在個人報稅表(BIR60)內申報業務盈利，截止日通常為5月31日。",
    },
    {
        "code": "C05",
        "title": "法定核數報告（審計）",
        "title_en": "Statutory Audit Report",
        "category": "internal",
        "authority": "香港會計師公會 (HKICPA)",
        "applies_to": "limited",
        "calc_type": "fiscal_year_end",
        "offset_months": 9,         # 財年結束後9個月內完成
        "legal_ref": "Cap. 32 § 379–406",
        "penalty_note": "審計報告是提交BIR51的前置條件，未完成核數則無法按時報稅",
        "reminder_days_before": 60,
        "dynamic": True,
        "description": "有限公司須委任持牌核數師完成法定審計，並出具審計報告後方可提交利得稅報稅表。",
    },
    {
        "code": "C06",
        "title": "強積金月供 (MPF)",
        "title_en": "MPF Monthly Contribution",
        "category": "mpfa",
        "authority": "強積金管理局 (MPFA)",
        "applies_to": "all",
        "calc_type": "monthly",
        "day_of_month": 10,         # 每月10日前完成上月供款
        "has_employees": True,      # 需有雇员
        "legal_ref": "Cap. 485 強制性公積金計劃條例",
        "penalty_note": "每名員工罰款最高HK$5,000及6個月監禁；2025年5月1日起取消抵銷安排",
        "reminder_days_before": 5,
        "dynamic": True,
        "description": "雇主須於每月10日前為員工繳交強積金。2025年5月1日起，強積金不可再抵銷遣散費/長期服務金。",
    },
    {
        "code": "C07",
        "title": "雇主報稅 IR56B/BIR56A",
        "title_en": "Employer's Return (IR56B/BIR56A)",
        "category": "ird",
        "authority": "稅務局 (IRD)",
        "applies_to": "all",
        "calc_type": "fixed",
        "fixed_month": 5,
        "fixed_day": 1,             # 稅務局於4月1日發出，1個月內提交（即5月1日前）
        "has_employees": True,
        "legal_ref": "Cap. 112 稅務條例 § 52",
        "penalty_note": "逾期罰款；若員工漏報將面臨估計評稅",
        "reminder_days_before": 21,
        "dynamic": True,
        "description": "有員工的公司須於每年4月1日起1個月內提交雇主報稅表，申報所有員工上年度收入。",
    },
    {
        "code": "C08",
        "title": "公司秘書任命/變更通知",
        "title_en": "Company Secretary Appointment/Change Notification",
        "category": "cr",
        "authority": "公司註冊處 (CR)",
        "applies_to": "limited",
        "calc_type": "event",
        "event_days": 14,           # 變更後14天內
        "legal_ref": "Cap. 32 § 476",
        "penalty_note": "逾期14天提交可被起訴，罰款最高HK$25,000",
        "reminder_days_before": 7,
        "dynamic": False,
        "description": "有限公司必須持續委任公司秘書，若秘書變更須在14天內向公司註冊處提交Form ND2A。",
    },
    {
        "code": "C09",
        "title": "注冊地址變更通知 (NR1)",
        "title_en": "Registered Office Address Change (Form NR1)",
        "category": "cr",
        "authority": "公司註冊處 (CR)",
        "applies_to": "limited",
        "calc_type": "event",
        "event_days": 14,
        "legal_ref": "Cap. 32 § 658",
        "penalty_note": "逾期提交可被起訴",
        "reminder_days_before": 7,
        "dynamic": False,
        "description": "有限公司更改注冊辦事處地址後，須在14天內向公司註冊處提交Form NR1。",
    },
    {
        "code": "C10",
        "title": "董事變更通知 (ND2A/ND4)",
        "title_en": "Director Change Notification (ND2A/ND4)",
        "category": "cr",
        "authority": "公司註冊處 (CR)",
        "applies_to": "limited",
        "calc_type": "event",
        "event_days": 14,
        "legal_ref": "Cap. 32 § 641",
        "penalty_note": "逾期提交可被起訴，每日罰款",
        "reminder_days_before": 7,
        "dynamic": False,
        "description": "任命新董事須在14天內提交ND2A；董事辭任須在14天內提交ND4。",
    },
    {
        "code": "C11",
        "title": "新入職員工 MPF 登記",
        "title_en": "New Employee MPF Enrollment",
        "category": "mpfa",
        "authority": "強積金管理局 (MPFA)",
        "applies_to": "all",
        "calc_type": "event",
        "event_days": 60,           # 入職後60天內
        "has_employees": True,
        "legal_ref": "Cap. 485 強制性公積金計劃條例 § 7",
        "penalty_note": "逾期罰款HK$5,000，員工入職60天內必須完成登記",
        "reminder_days_before": 7,
        "dynamic": False,
        "description": "新入職年齡在18至64歲的員工，雇主須在其入職60天內為其完成強積金計劃登記。",
    },
    {
        "code": "C12",
        "title": "無限/獨資業務變更通知",
        "title_en": "Unlimited/Sole Prop Business Change Notification",
        "category": "ird",
        "authority": "稅務局 (IRD) / 公司註冊處 (CR)",
        "applies_to": "unlimited,sole_prop",
        "calc_type": "event",
        "event_days": 30,           # 業務變更後1個月內
        "legal_ref": "Cap. 310 商業登記條例 § 8",
        "penalty_note": "逾期罰款及商業登記證可能被取消",
        "reminder_days_before": 7,
        "dynamic": False,
        "description": "業務性質、地址或東主變更後，須在1個月內向商業登記署通知更新。",
    },
    {
        "code": "C13",
        "title": "雇員補償保險續期 (EC Insurance)",
        "title_en": "Employees' Compensation Insurance Renewal",
        "category": "internal",
        "authority": "勞工處 (LD)",
        "applies_to": "all",
        "calc_type": "fixed",
        "has_employees": True,
        "legal_ref": "Cap. 282 雇員補償條例 § 40",
        "penalty_note": "未投保屬刑事罪行，罰款最高HK$100,000及監禁2年；承包商連帶責任",
        "reminder_days_before": 30,
        "dynamic": False,
        "description": "雇主必須為所有在港受僱員工投購足額雇員補償保險。保單到期前30天需辦理續期，停保任何一日均屬違法。",
    },
]


# ── 工具函数 ─────────────────────────────────────────────────────────────────

def _parse_fiscal_year(fiscal_year: str):
    """
    将 "2025-26" 解析为 (start_year=2025, end_year=2026)
    """
    parts = fiscal_year.split("-")
    start_year = int(parts[0])
    end_suffix = parts[1]
    if len(end_suffix) == 2:
        end_year = int(str(start_year)[:2] + end_suffix)
    else:
        end_year = int(end_suffix)
    return start_year, end_year


def _calc_due_date(
    rule: Dict,
    fiscal_year: str,
    incorporation_date: Optional[date],
    fiscal_year_end_month: int,
) -> Dict[str, Any]:
    """
    根据规则类型计算截止日期，返回 {"due_date": date|None, "needs_manual": bool}
    """
    start_year, end_year = _parse_fiscal_year(fiscal_year)
    today = date.today()
    calc_type = rule["calc_type"]

    if calc_type == "date_of_incorporation":
        if not incorporation_date:
            return {"due_date": None, "needs_manual": True}
        # 以目标财年的end_year确定周年日（大多数情况周年日在财年范围内）
        offset_days = rule.get("offset_days", 0)
        try:
            anniversary = incorporation_date.replace(year=end_year)
        except ValueError:
            # 闰年2月29日问题
            anniversary = incorporation_date.replace(year=end_year, day=28)
        due = anniversary + timedelta(days=offset_days)
        return {"due_date": due, "needs_manual": False}

    elif calc_type == "fiscal_year_end":
        # 财年结束日 = end_year的fiscal_year_end_month的最后一天
        import calendar
        last_day = calendar.monthrange(end_year, fiscal_year_end_month)[1]
        fy_end = date(end_year, fiscal_year_end_month, last_day)
        offset_months = rule.get("offset_months", 0)
        due = fy_end + relativedelta(months=offset_months)
        return {"due_date": due, "needs_manual": False}

    elif calc_type == "fixed":
        fixed_month = rule.get("fixed_month")
        fixed_day = rule.get("fixed_day")
        if fixed_month and fixed_day:
            # 使用财年的end_year（大多数固定日期在4月份后的年份）
            target_year = end_year if fixed_month >= 4 else end_year + 1
            # 对于BIR60（5月31日），应该在财年结束的下一个日历年
            # 香港财年4月-3月，BIR60在财年结束后的5月
            try:
                due = date(end_year, fixed_month, fixed_day)
            except ValueError:
                import calendar
                last_day = calendar.monthrange(end_year, fixed_month)[1]
                due = date(end_year, fixed_month, last_day)
            return {"due_date": due, "needs_manual": False}
        # BR续期：无法自动计算（具体到期日因公司而异）
        return {"due_date": None, "needs_manual": True}

    elif calc_type == "monthly":
        # 生成当月的截止日（每月10日）
        day_of_month = rule.get("day_of_month", 10)
        due = date(today.year, today.month, day_of_month)
        return {"due_date": due, "needs_manual": False}

    elif calc_type == "event":
        # 事件触发型：无法预先计算，标记为 na（等待触发）
        return {"due_date": None, "needs_manual": False}

    return {"due_date": None, "needs_manual": True}


def _legal_type_matches(rule_applies_to: str, company_legal_type: str) -> bool:
    """检查规则是否适用于当前公司法律形式"""
    if rule_applies_to == "all":
        return True
    applicable = [x.strip() for x in rule_applies_to.split(",")]
    return company_legal_type in applicable


# ── 主接口 ───────────────────────────────────────────────────────────────────

def generate_annual_items(
    company_id: str,
    company_legal_type: str,
    fiscal_year: str,
    incorporation_date: Optional[date] = None,
    fiscal_year_end_month: int = 3,
) -> List[Dict[str, Any]]:
    """
    根据公司法律形式和财年生成全年合规事件清单
    
    返回值：每个合规事件的字典列表（可直接写入 ComplianceItem 模型）
    """
    items = []
    today = date.today()

    for rule in COMPLIANCE_RULES:
        # 过滤：不适用的法律形式跳过
        if not _legal_type_matches(rule["applies_to"], company_legal_type):
            continue

        # 计算截止日
        date_info = _calc_due_date(
            rule=rule,
            fiscal_year=fiscal_year,
            incorporation_date=incorporation_date,
            fiscal_year_end_month=fiscal_year_end_month,
        )
        due_date = date_info["due_date"]
        needs_manual = date_info["needs_manual"]

        # 确定状态
        calc_type = rule["calc_type"]
        if calc_type == "event":
            status = "na"          # 事件触发型，默认不适用，待事件发生
        elif needs_manual:
            status = "pending"
        elif due_date and due_date < today:
            status = "overdue"
        else:
            status = "pending"

        items.append({
            "company_id": company_id,
            "code": rule["code"],
            "fiscal_year": fiscal_year,
            "title": rule["title"],
            "title_en": rule["title_en"],
            "category": rule["category"],
            "applies_to": rule["applies_to"],
            "authority": rule["authority"],
            "legal_ref": rule["legal_ref"],
            "penalty_note": rule["penalty_note"],
            "reminder_days_before": rule.get("reminder_days_before", 30),
            "due_date": datetime.combine(due_date, datetime.min.time()) if due_date else None,
            "needs_manual": needs_manual,
            "is_manual_date": False,
            "status": status,
            "notes": rule.get("description", ""),
        })

    return items


def get_compliance_summary(items: List[Dict]) -> Dict[str, int]:
    """
    计算合规摘要（用于 Dashboard 警告条）
    返回：{overdue, due_soon_7d, due_soon_30d, total_pending}
    """
    from datetime import date
    today = date.today()
    in_7d = today + timedelta(days=7)
    in_30d = today + timedelta(days=30)

    overdue = 0
    due_soon_7d = 0
    due_soon_30d = 0
    total_pending = 0

    for item in items:
        status = item.get("status")
        due = item.get("due_date")
        if status in ("done", "na", "snoozed"):
            continue
        if status == "overdue":
            overdue += 1
            total_pending += 1
            continue
        total_pending += 1
        if due:
            due_val = due.date() if hasattr(due, "date") else due
            if due_val <= in_7d:
                due_soon_7d += 1
            elif due_val <= in_30d:
                due_soon_30d += 1

    return {
        "overdue": overdue,
        "due_soon_7d": due_soon_7d,
        "due_soon_30d": due_soon_30d,
        "total_pending": total_pending,
    }
