"""
Invoice PDF Generator — 使用 ReportLab 生成繁體中文/英文雙語發票 PDF (傳統商務風)
"""
import io
from datetime import datetime
from decimal import Decimal
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_LEFT
import os

# ── 颜色主题（传统商务黑白灰）────────────────────────────────────────────────
COLOR_PRIMARY = colors.black
COLOR_LIGHT_BG = colors.HexColor("#F0F0F0")     # 极浅灰用于表头背景
COLOR_TEXT = colors.black
COLOR_MUTED = colors.HexColor("#333333")
COLOR_BORDER = colors.black

def _get_font_path():
    """尝试找到支持繁体中文的字体"""
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
    """注册中文字体到ReportLab"""
    font_path = _get_font_path()
    if font_path:
        try:
            pdfmetrics.registerFont(TTFont("ChineseFont", font_path))
            return "ChineseFont"
        except Exception:
            pass
    return "Helvetica"

def generate_invoice_pdf(invoice_data: dict, company_data: dict) -> bytes:
    buffer = io.BytesIO()
    font_name = _register_fonts()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=15*mm,
        leftMargin=15*mm,
        topMargin=20*mm,
        bottomMargin=20*mm,
    )

    styles = {
        "company_name": ParagraphStyle(
            "company_name", fontName=font_name, fontSize=16, textColor=COLOR_PRIMARY, leading=20, alignment=TA_LEFT
        ),
        "company_sub": ParagraphStyle(
            "company_sub", fontName=font_name, fontSize=9, textColor=COLOR_TEXT, leading=12, alignment=TA_LEFT
        ),
        "doc_title": ParagraphStyle(
            "doc_title", fontName=font_name, fontSize=28, textColor=COLOR_PRIMARY, alignment=TA_RIGHT, spaceAfter=2, leading=32
        ),
        "doc_title_en": ParagraphStyle(
            "doc_title_en", fontName=font_name, fontSize=16, textColor=COLOR_PRIMARY, alignment=TA_RIGHT, spaceAfter=15, leading=20
        ),
        "meta_label": ParagraphStyle(
            "meta_label", fontName=font_name, fontSize=9, textColor=COLOR_TEXT, alignment=TA_RIGHT, leading=12
        ),
        "meta_value": ParagraphStyle(
            "meta_value", fontName=font_name, fontSize=9, textColor=COLOR_TEXT, alignment=TA_RIGHT, leading=12
        ),
        "section_title": ParagraphStyle(
            "section_title", fontName=font_name, fontSize=10, textColor=COLOR_PRIMARY, spaceAfter=4, leading=14
        ),
        "body": ParagraphStyle(
            "body", fontName=font_name, fontSize=9, textColor=COLOR_TEXT, leading=14
        ),
        "table_header": ParagraphStyle(
            "table_header", fontName=font_name, fontSize=9, textColor=COLOR_TEXT, alignment=TA_CENTER
        ),
        "table_cell": ParagraphStyle(
            "table_cell", fontName=font_name, fontSize=9, textColor=COLOR_TEXT, leading=14, alignment=TA_LEFT
        ),
        "table_cell_right": ParagraphStyle(
            "table_cell_right", fontName=font_name, fontSize=9, textColor=COLOR_TEXT, leading=14, alignment=TA_RIGHT
        ),
        "summary_label": ParagraphStyle(
            "summary_label", fontName=font_name, fontSize=9, textColor=COLOR_TEXT, alignment=TA_RIGHT
        ),
        "total_label": ParagraphStyle(
            "total_label", fontName=font_name, fontSize=11, textColor=COLOR_TEXT, alignment=TA_RIGHT, spaceBefore=4
        ),
        "total_value": ParagraphStyle(
            "total_value", fontName=font_name, fontSize=11, textColor=COLOR_TEXT, alignment=TA_RIGHT, spaceBefore=4
        ),
    }

    story = []
    page_width = A4[0] - 30*mm

    # 1. Header Section
    is_invoice = invoice_data.get("invoice_type") == "invoice"
    title_zh = "發票" if is_invoice else "報價單"
    title_en = "INVOICE" if is_invoice else "QUOTATION"

    invoice_number = invoice_data.get("invoice_number", "")
    issue_date = invoice_data.get("issue_date", "")
    due_date = invoice_data.get("due_date", "")

    if isinstance(issue_date, datetime):
        issue_date = issue_date.strftime("%Y-%m-%d")
    if isinstance(due_date, datetime):
        due_date = due_date.strftime("%Y-%m-%d")

    header_left = [
        [Paragraph(company_data.get("name_zh", ""), styles["company_name"])],
        [Paragraph(company_data.get("name_en", "") or "", styles["company_sub"])],
        [Paragraph(company_data.get("address", "") or "", styles["company_sub"])],
        [Paragraph(f'Tel: {company_data.get("phone", "") or "-"} | Email: {company_data.get("email", "") or "-"}', styles["company_sub"])],
    ]

    # Meta info Layout (Bilingual and structured to avoid overlapping)
    meta_table_data = [
        [Paragraph("發票號碼 / Invoice No.:", styles["meta_label"]), Paragraph(invoice_number, styles["meta_value"])],
        [Paragraph("開票日期 / Issue Date:", styles["meta_label"]), Paragraph(str(issue_date), styles["meta_value"])],
        [Paragraph("付款期限 / Due Date:", styles["meta_label"]), Paragraph(str(due_date) if due_date else "On Receipt / 收到即付", styles["meta_value"])],
    ]
    # 使用完整的 page_width * 0.47 进行切割，确保完美右对齐：50mm左列(Label)，余下的给右列(Value)
    meta_table = Table(meta_table_data, colWidths=[page_width * 0.47 - 30*mm, 30*mm], hAlign='RIGHT')
    meta_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))

    header_right = [
        [Paragraph(title_zh, styles["doc_title"])],
        [Paragraph(title_en, styles["doc_title_en"])],
        [meta_table]
    ]

    header_data = [[
        Table(header_left, colWidths=[page_width * 0.53]),
        Table(header_right, colWidths=[page_width * 0.47], hAlign='RIGHT')
    ]]
    header_table = Table(header_data, colWidths=[page_width * 0.53, page_width * 0.47])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 4*mm))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_BORDER))
    story.append(Spacer(1, 6*mm))

    # 2. Client Section
    client_content = [
        [Paragraph("<b>帳單致 / Bill To:</b>", styles["section_title"])],
        [Paragraph(invoice_data.get("client_name", ""), styles["body"])],
        [Paragraph(invoice_data.get("client_address", "").replace('\n','<br/>') if invoice_data.get("client_address") else "", styles["body"])],
    ]
    client_table = Table(client_content, colWidths=[page_width * 0.55], hAlign='LEFT')
    client_table.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(client_table)
    story.append(Spacer(1, 8*mm))

    # 3. Invoice Items
    items = invoice_data.get("items", [])
    col_widths = [page_width * 0.08, page_width * 0.46, page_width * 0.12, page_width * 0.16, page_width * 0.18]

    table_data = [[
        Paragraph('<b>項 / Item</b>', styles["table_header"]),
        Paragraph("<b>描述 / Description</b>", styles["table_header"]),
        Paragraph("<b>數量 / Qty</b>", styles["table_header"]),
        Paragraph("<b>單價 / Unit Price</b>", styles["table_header"]),
        Paragraph("<b>金額 / Amount</b>", styles["table_header"]),
    ]]

    currency = invoice_data.get("currency", "HKD")
    for i, item in enumerate(items):
        table_data.append([
            Paragraph(str(i+1), styles["table_cell"]),
            Paragraph(str(item.get("description", "")), styles["table_cell"]),
            Paragraph(str(item.get("quantity", 1)), styles["table_cell_right"]),
            Paragraph(f'{currency} {float(item.get("unit_price", 0)):,.2f}', styles["table_cell_right"]),
            Paragraph(f'{currency} {float(item.get("amount", 0)):,.2f}', styles["table_cell_right"]),
        ])

    while len(table_data) < 8:
        table_data.append(["", "", "", "", ""])

    items_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    items_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_LIGHT_BG),
        ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("ALIGN", (0, 0), (0, -1), "CENTER"), # centers the item index
    ]))
    story.append(items_table)
    story.append(Spacer(1, 4*mm))

    # 4. Summary
    subtotal = float(invoice_data.get("subtotal", 0))
    discount = float(invoice_data.get("discount_amount", 0))
    total = float(invoice_data.get("total_amount", 0))
    paid = float(invoice_data.get("paid_amount", 0))
    balance = total - paid

    summary_data = [
        [Paragraph("<b>小計 / Subtotal:</b>", styles["summary_label"]), Paragraph(f'{currency} {subtotal:,.2f}', styles["table_cell_right"])],
    ]
    if discount > 0:
        summary_data.append([
            Paragraph("<b>折扣 / Discount:</b>", styles["summary_label"]),
            Paragraph(f'- {currency} {discount:,.2f}', styles["table_cell_right"])
        ])
    if paid > 0:
        summary_data.append([
            Paragraph("<b>已付 / Amount Paid:</b>", styles["summary_label"]),
            Paragraph(f'- {currency} {paid:,.2f}', styles["table_cell_right"])
        ])

    summary_data.append([
        Paragraph("<b>應付總額 / Total Due:</b>", styles["total_label"]),
        Paragraph(f'<b>{currency} {balance:,.2f}</b>', styles["total_value"])
    ])

    summary_table = Table(summary_data, colWidths=[page_width * 0.75, page_width * 0.25])
    summary_table.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("LINEABOVE", (0, -1), (-1, -1), 1, COLOR_BORDER),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 8*mm))

    # 5. Bank Info & Notes
    bank_info = invoice_data.get("bank_info", "")
    notes = invoice_data.get("notes", "")
    terms = invoice_data.get("terms", "")

    story.append(Paragraph("<b>付款資訊及備註 / Payment Info & Notes:</b>", styles["section_title"]))
    story.append(Spacer(1, 2*mm))

    if bank_info:
        story.append(Paragraph("<b>銀行賬戶 / Bank Account:</b>", styles["body"]))
        story.append(Paragraph(bank_info.replace("\n", "<br/>"), styles["body"]))
        story.append(Spacer(1, 3*mm))

    if notes:
        story.append(Paragraph("<b>備註 / Remarks:</b>", styles["body"]))
        story.append(Paragraph(notes.replace("\n", "<br/>"), styles["body"]))
        story.append(Spacer(1, 3*mm))

    if terms:
        story.append(Paragraph("<b>條款及細則 / Terms & Conditions:</b>", styles["body"]))
        story.append(Paragraph(terms.replace("\n", "<br/>"), styles["body"]))

    # Authorized Signature Line 
    story.append(Spacer(1, 20*mm))
    sig_data = [
        ["", Paragraph("<b>授權簽名 / Authorized Signature</b>", ParagraphStyle("sig", fontName=font_name, fontSize=9, alignment=TA_CENTER))]
    ]
    sig_table = Table(sig_data, colWidths=[page_width * 0.6, page_width * 0.4])
    sig_table.setStyle(TableStyle([
        ("LINEABOVE", (1, 0), (1, 0), 0.5, COLOR_BORDER),
        ("TOPPADDING", (1, 0), (1, 0), 4),
    ]))
    story.append(sig_table)

    doc.build(story)
    buffer.seek(0)
    return buffer.read()
