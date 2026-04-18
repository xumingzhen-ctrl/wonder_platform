"""
薪资单 PDF 生成器 — ReportLab 繁体中英双语薪资单
风格与发票PDF保持一致（传统商务黑白灰）
"""
import io
from datetime import datetime
from decimal import Decimal
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_LEFT
import os

# 复用发票PDF的颜色主题
COLOR_PRIMARY  = colors.black
COLOR_LIGHT_BG = colors.HexColor("#F0F0F0")
COLOR_TEXT     = colors.black
COLOR_BORDER   = colors.black
COLOR_ACCENT   = colors.HexColor("#2563EB")   # 蓝色强调（标题边框等）
COLOR_GREEN    = colors.HexColor("#16A34A")
COLOR_MUTED    = colors.HexColor("#6B7280")


def _get_font_path():
    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/Library/Fonts/Arial Unicode MS.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


def _register_fonts():
    font_path = _get_font_path()
    if font_path:
        try:
            pdfmetrics.registerFont(TTFont("ChineseFont", font_path))
            return "ChineseFont"
        except Exception:
            pass
    return "Helvetica"


def _make_styles(font_name: str) -> dict:
    return {
        "h1": ParagraphStyle("h1", fontName=font_name, fontSize=18, textColor=COLOR_PRIMARY, leading=22, alignment=TA_LEFT),
        "h1_en": ParagraphStyle("h1_en", fontName=font_name, fontSize=11, textColor=COLOR_MUTED, leading=14, alignment=TA_LEFT),
        "company_sub": ParagraphStyle("company_sub", fontName=font_name, fontSize=9, textColor=COLOR_TEXT, leading=12, alignment=TA_LEFT),
        "doc_title": ParagraphStyle("doc_title", fontName=font_name, fontSize=22, textColor=COLOR_PRIMARY, alignment=TA_RIGHT, leading=26),
        "doc_sub": ParagraphStyle("doc_sub", fontName=font_name, fontSize=11, textColor=COLOR_MUTED, alignment=TA_RIGHT, leading=14),
        "meta_label": ParagraphStyle("meta_label", fontName=font_name, fontSize=9, textColor=COLOR_MUTED, alignment=TA_RIGHT, leading=13),
        "meta_value": ParagraphStyle("meta_value", fontName=font_name, fontSize=9, textColor=COLOR_TEXT, alignment=TA_RIGHT, leading=13),
        "section": ParagraphStyle("section", fontName=font_name, fontSize=10, textColor=COLOR_PRIMARY, leading=14, spaceBefore=4),
        "body": ParagraphStyle("body", fontName=font_name, fontSize=9, textColor=COLOR_TEXT, leading=13),
        "body_muted": ParagraphStyle("body_muted", fontName=font_name, fontSize=9, textColor=COLOR_MUTED, leading=13),
        "th": ParagraphStyle("th", fontName=font_name, fontSize=9, textColor=COLOR_TEXT, alignment=TA_CENTER, leading=12),
        "td": ParagraphStyle("td", fontName=font_name, fontSize=9, textColor=COLOR_TEXT, leading=13, alignment=TA_LEFT),
        "td_r": ParagraphStyle("td_r", fontName=font_name, fontSize=9, textColor=COLOR_TEXT, leading=13, alignment=TA_RIGHT),
        "total_label": ParagraphStyle("total_label", fontName=font_name, fontSize=11, textColor=COLOR_PRIMARY, alignment=TA_RIGHT, spaceBefore=3),
        "total_value": ParagraphStyle("total_value", fontName=font_name, fontSize=12, textColor=COLOR_GREEN, alignment=TA_RIGHT, spaceBefore=3),
        "footer": ParagraphStyle("footer", fontName=font_name, fontSize=8, textColor=COLOR_MUTED, alignment=TA_CENTER),
    }


def generate_payslip_pdf(payroll: dict, employee: dict, company: dict) -> bytes:
    """
    生成薪资单 PDF。

    Args:
        payroll:  薪资记录字典（来自 PayrollRecord）
        employee: 员工字典（来自 Employee）
        company:  公司字典（来自 Company）

    Returns:
        bytes: PDF 文件内容
    """
    buffer = io.BytesIO()
    fn = _register_fonts()
    styles = _make_styles(fn)

    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        rightMargin=15*mm, leftMargin=15*mm,
        topMargin=20*mm, bottomMargin=20*mm,
    )
    story = []
    page_width = A4[0] - 30*mm

    # ── 1. Header ──────────────────────────────────────────────────────────────
    payroll_month = payroll.get("payroll_month", "")
    try:
        dt = datetime.strptime(payroll_month, "%Y-%m")
        month_display_zh = dt.strftime("%Y年%m月")
        month_display_en = dt.strftime("%B %Y")
    except Exception:
        month_display_zh = payroll_month
        month_display_en = payroll_month

    left_col = [
        [Paragraph(company.get("name_zh", ""), styles["h1"])],
        [Paragraph(company.get("name_en", "") or "", styles["h1_en"])],
        [Paragraph(company.get("address", "") or "", styles["company_sub"])],
        [Paragraph(f'Tel: {company.get("phone", "") or "-"}', styles["company_sub"])],
    ]
    right_col = [
        [Paragraph("薪資單", styles["doc_title"])],
        [Paragraph("PAYSLIP", styles["doc_sub"])],
        [Paragraph(f"供款期 / Period: <b>{month_display_en}</b>", styles["meta_value"])],
    ]

    header_tbl = Table(
        [[Table(left_col, colWidths=[page_width * 0.55]),
          Table(right_col, colWidths=[page_width * 0.45], hAlign="RIGHT")]],
        colWidths=[page_width * 0.55, page_width * 0.45]
    )
    header_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_tbl)
    story.append(Spacer(1, 4*mm))
    story.append(HRFlowable(width="100%", thickness=1.5, color=COLOR_ACCENT))
    story.append(Spacer(1, 5*mm))

    # ── 2. 员工信息区 ──────────────────────────────────────────────────────────
    story.append(Paragraph("<b>員工資料 / Employee Details</b>", styles["section"]))
    story.append(Spacer(1, 3*mm))
    emp_data = [
        [Paragraph("姓名 Name:", styles["meta_label"]),
         Paragraph(f'{employee.get("name_zh", "")}  {employee.get("name_en", "") or ""}', styles["body"]),
         Paragraph("員工編號 Emp. No.:", styles["meta_label"]),
         Paragraph(employee.get("employee_number", ""), styles["body"])],
        [Paragraph("職位 Position:", styles["meta_label"]),
         Paragraph(employee.get("position", "") or "-", styles["body"]),
         Paragraph("部門 Dept.:", styles["meta_label"]),
         Paragraph(employee.get("department", "") or "-", styles["body"])],
        [Paragraph("入職日期 Hire Date:", styles["meta_label"]),
         Paragraph(str(employee.get("hire_date", "")) or "-", styles["body"]),
         Paragraph("強積金計劃 MPF:", styles["meta_label"]),
         Paragraph(employee.get("mpf_scheme", "") or "-", styles["body"])],
    ]
    emp_tbl = Table(emp_data, colWidths=[page_width*0.15, page_width*0.35, page_width*0.15, page_width*0.35])
    emp_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FAFAFA")),
        ("BOX", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
    ]))
    story.append(emp_tbl)
    story.append(Spacer(1, 6*mm))

    # ── 3. 薪资明细表 ──────────────────────────────────────────────────────────
    story.append(Paragraph("<b>薪酬明細 / Earnings</b>", styles["section"]))
    story.append(Spacer(1, 3*mm))

    currency = "HKD"
    base_salary  = float(payroll.get("base_salary", 0))
    bonus        = float(payroll.get("bonus", 0))
    allowances   = float(payroll.get("allowances", 0))
    overtime_pay = float(payroll.get("overtime_pay", 0))
    gross_pay    = float(payroll.get("gross_pay", 0))

    earnings_data = [
        [Paragraph("<b>項目 Item</b>", styles["th"]),
         Paragraph("<b>金額 Amount (HKD)</b>", styles["th"])],
        [Paragraph("基本薪酬 Basic Salary", styles["td"]),
         Paragraph(f"{base_salary:,.2f}", styles["td_r"])],
    ]
    if bonus > 0:
        earnings_data.append([Paragraph("獎金 Bonus", styles["td"]),
                              Paragraph(f"{bonus:,.2f}", styles["td_r"])])
    if allowances > 0:
        earnings_data.append([Paragraph("津貼 Allowances", styles["td"]),
                              Paragraph(f"{allowances:,.2f}", styles["td_r"])])
    if overtime_pay > 0:
        earnings_data.append([Paragraph("加班費 Overtime Pay", styles["td"]),
                              Paragraph(f"{overtime_pay:,.2f}", styles["td_r"])])
    earnings_data.append([
        Paragraph("<b>應發合計 Gross Pay</b>", styles["td"]),
        Paragraph(f"<b>{gross_pay:,.2f}</b>", styles["td_r"])
    ])

    earn_tbl = Table(earnings_data, colWidths=[page_width * 0.7, page_width * 0.3], repeatRows=1)
    earn_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_LIGHT_BG),
        ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("LINEABOVE", (0, -1), (-1, -1), 1, COLOR_BORDER),
    ]))
    story.append(earn_tbl)
    story.append(Spacer(1, 6*mm))

    # ── 4. MPF 扣款区 ──────────────────────────────────────────────────────────
    story.append(Paragraph("<b>強積金供款 / MPF Contributions</b>", styles["section"]))
    story.append(Spacer(1, 3*mm))

    employee_mpf = float(payroll.get("employee_mpf", 0))
    employer_mpf = float(payroll.get("employer_mpf", 0))
    mpf_exempt   = payroll.get("mpf_exempt", False)
    net_pay      = float(payroll.get("net_pay", 0))

    exempt_note = " (豁免 Exempt)" if mpf_exempt else ""
    mpf_data = [
        [Paragraph("<b>供款人 Contributor</b>", styles["th"]),
         Paragraph("<b>供款額 Amount (HKD)</b>", styles["th"]),
         Paragraph("<b>備注 Remarks</b>", styles["th"])],
        [Paragraph("僱員供款 Employee MC", styles["td"]),
         Paragraph(f"{employee_mpf:,.2f}", styles["td_r"]),
         Paragraph(f"5% of Relevant Income{exempt_note}", styles["body_muted"])],
        [Paragraph("僱主供款 Employer MC", styles["td"]),
         Paragraph(f"{employer_mpf:,.2f}", styles["td_r"]),
         Paragraph("5% of Relevant Income", styles["body_muted"])],
    ]
    mpf_tbl = Table(mpf_data,
                    colWidths=[page_width * 0.35, page_width * 0.25, page_width * 0.40],
                    repeatRows=1)
    mpf_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_LIGHT_BG),
        ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(mpf_tbl)
    story.append(Spacer(1, 6*mm))

    # ── 5. 实发金额 ────────────────────────────────────────────────────────────
    summary_data = [
        [Paragraph("應發合計 Gross Pay:", styles["total_label"]),
         Paragraph(f"HKD {gross_pay:,.2f}", styles["td_r"])],
        [Paragraph("減：僱員強積金 Less: Employee MPF:", styles["total_label"]),
         Paragraph(f"- HKD {employee_mpf:,.2f}", styles["td_r"])],
        [Paragraph("<b>實發工資 Net Pay:</b>", styles["total_label"]),
         Paragraph(f"<b>HKD {net_pay:,.2f}</b>", styles["total_value"])],
    ]
    sum_tbl = Table(summary_data, colWidths=[page_width * 0.72, page_width * 0.28])
    sum_tbl.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEABOVE", (0, -1), (-1, -1), 1.5, COLOR_ACCENT),
    ]))
    story.append(sum_tbl)
    story.append(Spacer(1, 10*mm))

    # ── 6. 签名栏 ──────────────────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=0.5, color=COLOR_MUTED))
    story.append(Spacer(1, 2*mm))
    sig_data = [[
        Paragraph("", styles["body"]),
        Paragraph("<b>雇主授权签名 / Authorised Signature</b>", ParagraphStyle(
            "sig", fontName=fn, fontSize=9, alignment=TA_CENTER, textColor=COLOR_MUTED)),
        Paragraph("", styles["body"]),
        Paragraph("<b>雇员確認收讫 / Received by Employee</b>", ParagraphStyle(
            "sig2", fontName=fn, fontSize=9, alignment=TA_CENTER, textColor=COLOR_MUTED)),
    ]]
    sig_tbl = Table(sig_data, colWidths=[
        page_width * 0.08, page_width * 0.38,
        page_width * 0.14, page_width * 0.40
    ])
    sig_tbl.setStyle(TableStyle([
        ("LINEABOVE", (1, 0), (1, 0), 0.5, COLOR_BORDER),
        ("LINEABOVE", (3, 0), (3, 0), 0.5, COLOR_BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 18),
    ]))
    story.append(sig_tbl)
    story.append(Spacer(1, 6*mm))

    # ── 7. 页脚 ────────────────────────────────────────────────────────────────
    story.append(Paragraph(
        f"本薪資單由系統自動生成 / Auto-generated payslip | {month_display_zh} | "
        f"本文件僅供參考，如有疑問請聯絡人事部門",
        styles["footer"]
    ))

    doc.build(story)
    buffer.seek(0)
    return buffer.read()
