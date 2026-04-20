"""
receipt_scanner.py — AI 收据识别核心服务

使用 OpenRouter (Gemini 2.0 Flash Vision) 对收据/发票图片进行结构化数据提取。
支持：香港收据、内地普通收据、内地增值税专票/普票、HEIC、PDF 等格式。
"""
import base64
import json
import logging
import re
from datetime import date, datetime
from pathlib import Path
from typing import Optional

import httpx
from openai import OpenAI
from sqlalchemy.orm import Session

from config import settings
from services.file_converter import convert_to_jpeg_pages, get_source_format

logger = logging.getLogger(__name__)

# ── 汇率换算 ────────────────────────────────────────────────────
_FALLBACK_RATES_TO_HKD = {
    "HKD": 1.0, "CNY": 1.08, "USD": 7.78, "EUR": 8.50,
    "GBP": 10.20, "JPY": 0.052, "SGD": 5.80,
    "AUD": 4.90, "MYR": 1.75, "TWD": 0.24,
}


def convert_to_hkd(amount: Optional[float], currency: str) -> Optional[float]:
    """将金额换算为港元；优先实时汇率，失败则用参考汇率"""
    if amount is None:
        return None
    currency = (currency or "HKD").upper().strip()
    if currency == "HKD":
        return round(amount, 2)
    try:
        resp = httpx.get(
            f"https://api.frankfurter.app/latest?from={currency}&to=HKD",
            timeout=5.0,
        )
        if resp.status_code == 200:
            rate = resp.json()["rates"]["HKD"]
            result = round(amount * rate, 2)
            logger.info(f"实时汇率 1 {currency}={rate} HKD | {amount}→{result} HKD")
            return result
    except Exception as e:
        logger.warning(f"实时汇率失败，用参考汇率：{e}")
    rate = _FALLBACK_RATES_TO_HKD.get(currency)
    if rate:
        result = round(amount * rate, 2)
        logger.info(f"参考汇率 1 {currency}≈{rate} HKD | {amount}→{result} HKD")
        return result
    logger.warning(f"未知货币[{currency}]，直接存原始金额")
    return amount

# ── AI 提取结果的数据结构 ────────────────────────────────────────
EXTRACT_PROMPT = """你是专业的会计助手，需要从收据/发票图片中提取结构化数据。
该图片可能来自：香港收据、内地增值税专用发票、内地增值税普通发票、内地普通收据（小票）。
无论图片语言（中文简体/繁体/英文混合），请认真识别并以纯 JSON 格式返回，不要有任何其他文字：

{
  "receipt_type": "cn_vat_special|cn_vat_general|cn_ordinary|hk_receipt|other",
  "receipt_date": "YYYY-MM-DD",
  "vendor_name": "商户全称",
  "vendor_tax_id": "纳税人识别号（仅内地增值税发票有，其他填null）",
  "currency": "CNY|HKD|USD|EUR|...",
  "amount_original": 0.00,
  "tax_rate": 0.09,
  "tax_amount": 0.00,
  "total_amount": 0.00,
  "cn_invoice_code": "发票代码（20位，仅内地增值税发票有，其他填null）",
  "cn_invoice_number": "发票号码（8位，仅内地增值税发票有，其他填null）",
  "description": "消费内容的简短描述（不超过100字）",
  "suggested_category": "MEAL|TRAVEL|OFFICE|MARKETING|STAFF|PROFESSIONAL|EQUIPMENT|UTILITIES|RENT|INSURANCE|ENTERTAINMENT|OTHER",
  "confidence": 85
}

重要规则：
1. receipt_date 必须是收据/发票上印刷的日期，格式 YYYY-MM-DD
2. amount_original 是不含税价，total_amount 是含税总价
3. 如果无法识别某字段，填 null（数字字段填 null，非填 0）
4. confidence 是你对本次识别准确度的自我评估（0-100）
5. 只返回 JSON，不要有任何解释性文字
6. 【关键规则】识别内地发票的 vendor_name 时：
   - 必须优先读取发票上的【财务专用章】或【发票专用章】印章内圈文字作为商户名称
   - 印章通常是红色圆形章，位于发票右下角或收款方盖章处
   - 印章内的名称才是法律意义上的开票方，比发票抬头文字更权威
   - 如果印章与抬头名称不一致，以印章为准
   - 只有在完全看不到印章的情况下，才使用抬头栏或其他显著位置的名称"""


def _get_openrouter_client() -> OpenAI:
    """创建 OpenRouter 客户端（复用 OpenAI SDK）"""
    return OpenAI(
        base_url=settings.OPENROUTER_BASE_URL,
        api_key=settings.OPENROUTER_API_KEY,
    )


def _call_vision_api(jpeg_bytes: bytes, model: str, client: OpenAI) -> dict:
    """
    将单张图片发送给 OpenRouter Vision API，返回解析后的 dict

    Raises:
        ValueError: AI 返回内容无法解析为 JSON
        Exception: API 调用失败
    """
    b64_image = base64.b64encode(jpeg_bytes).decode("utf-8")

    response = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": EXTRACT_PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64_image}"},
                    },
                ],
            }
        ],
        max_tokens=1024,
        temperature=0.1,  # 低温度，确保输出稳定
    )

    raw_text = response.choices[0].message.content.strip()

    # 提取 JSON（处理 AI 可能额外输出 markdown 代码块的情况）
    json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
    if not json_match:
        raise ValueError(f"AI 未返回有效 JSON：{raw_text[:200]}")

    return json.loads(json_match.group()), raw_text


async def scan_receipt(
    file_bytes: bytes,
    filename: str,
    db: Session,
    company_id: str,
) -> dict:
    """
    主入口：对一个收据文件进行完整的 AI 扫描流程

    Args:
        file_bytes: 文件原始字节
        filename: 原始文件名（用于判断格式）
        db: 数据库 Session（用于生成凭证号）
        company_id: 所属公司 ID

    Returns:
        包含提取结果的字典（写入数据库前的中间态）
    """
    source_format = get_source_format(filename)
    
    # 0. 文件级防重检查 (计算 SHA-256)
    import hashlib
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    
    from models.expense import Expense
    existing_file = db.query(Expense).filter(
        Expense.company_id == company_id,
        Expense.file_hash == file_hash
    ).first()
    
    if existing_file:
        raise RuntimeError(f"防重拦截：该图片（文件指纹一致）已作为凭证 {existing_file.voucher_number} 存在，请勿重复上传。")
    
    client = _get_openrouter_client()

    # 1. 格式预处理：统一转为 JPEG 列表
    jpeg_pages = convert_to_jpeg_pages(file_bytes, filename)
    logger.info(f"文件 [{filename}] 转换完成，共 {len(jpeg_pages)} 页")

    # 2. 对每页调用 Vision API
    extracted_data = None
    raw_response_all = []
    best_confidence = 0
    model_used = settings.OPENROUTER_MODEL_FREE

    for page_idx, jpeg_bytes in enumerate(jpeg_pages):
        try:
            page_data, raw_text = _call_vision_api(jpeg_bytes, model_used, client)
            raw_response_all.append({"page": page_idx + 1, "data": page_data})

            page_conf = page_data.get("confidence", 0) or 0
            if page_conf > best_confidence:
                best_confidence = page_conf
                extracted_data = page_data

            logger.info(
                f"[{filename}] 第{page_idx + 1}页识别完成，置信度：{page_conf}，"
                f"商户：{page_data.get('vendor_name')}，金额：{page_data.get('total_amount')}"
            )

        except Exception as e:
            # 免费模型失败时，尝试切换到付费模型
            if model_used == settings.OPENROUTER_MODEL_FREE:
                logger.warning(f"免费模型失败，切换到付费模型：{e}")
                model_used = settings.OPENROUTER_MODEL_PAID
                try:
                    page_data, raw_text = _call_vision_api(jpeg_bytes, model_used, client)
                    raw_response_all.append({"page": page_idx + 1, "data": page_data})
                    page_conf = page_data.get("confidence", 0) or 0
                    if page_conf > best_confidence:
                        best_confidence = page_conf
                        extracted_data = page_data
                except Exception as e2:
                    logger.error(f"[{filename}] 第{page_idx + 1}页识别失败（两种模型均失败）：{e2}")
            else:
                logger.error(f"[{filename}] 第{page_idx + 1}页识别失败：{e}")

    if not extracted_data:
        raise RuntimeError(f"文件 [{filename}] 所有页面识别均失败")

    # 3. 生成凭证号
    receipt_date_raw = extracted_data.get("receipt_date")
    receipt_date = _parse_date(receipt_date_raw)
    voucher_number = generate_voucher_number(db, receipt_date, company_id)

    # 4. 归档图片
    image_path = archive_file(file_bytes, filename, voucher_number, receipt_date, company_id)

    # 5. 计算财政年度
    fiscal_year = calculate_fiscal_year(receipt_date)

    currency = extracted_data.get("currency", "HKD") or "HKD"
    total_amount = _safe_decimal(extracted_data.get("total_amount"))
    amount_hkd = convert_to_hkd(total_amount, currency)

    # 5.5 业务内容防重检查
    vendor_name = extracted_data.get("vendor_name")
    if receipt_date and vendor_name and total_amount:
        # Avoid checking if date/amount are completely None to prevent false positives on badly recognized receipts
        content_dup = db.query(Expense).filter(
            Expense.company_id == company_id,
            Expense.receipt_date == receipt_date,
            Expense.vendor_name == extracted_data.get("vendor_name"),
            Expense.total_amount == total_amount
        ).first()

        if content_dup:
            raise RuntimeError(f"业务防重：该消费（{receipt_date}，{extracted_data.get('vendor_name')}，金额 {total_amount}）似乎已在系统中（凭证号 {content_dup.voucher_number}）。请您人工核对是否重复录入。")

    return {
        "voucher_number": voucher_number,
        "receipt_type": extracted_data.get("receipt_type"),
        "receipt_date": receipt_date,
        "vendor_name": extracted_data.get("vendor_name"),
        "vendor_tax_id": extracted_data.get("vendor_tax_id"),
        "vendor_address": None,
        "description": extracted_data.get("description"),
        "currency": currency,
        "amount_original": _safe_decimal(extracted_data.get("amount_original")),
        "tax_rate": _safe_decimal(extracted_data.get("tax_rate")),
        "tax_amount": _safe_decimal(extracted_data.get("tax_amount")),
        "total_amount": total_amount,
        "amount_hkd": amount_hkd,
        "cn_invoice_code": extracted_data.get("cn_invoice_code"),
        "cn_invoice_number": extracted_data.get("cn_invoice_number"),
        "suggested_category_code": extracted_data.get("suggested_category", "OTHER"),
        "ai_confidence": best_confidence,
        "ai_raw_response": json.dumps(raw_response_all, ensure_ascii=False),
        "receipt_image_path": image_path,
        "receipt_original_filename": filename,
        "source_format": source_format,
        "fiscal_year": fiscal_year,
        "file_hash": file_hash,
    }


def generate_voucher_number(db: Session, receipt_date: Optional[date], company_id: str) -> str:
    """
    生成唯一凭证号：EXP-YYYYMM-XXXX

    年月取自收据实际日期（如 AI 无法识别日期则用当前月份）
    序号在公司+月份维度内自增

    注意：数据库中可能存在旧格式的凭证号（如 EXP-YYYYMM-M001 或含哈希的后缀），
    此函数通过正则过滤，只考虑纯数字后缀的凭证号，避免 int() 崩溃。
    """
    from models.expense import Expense

    target_date = receipt_date or date.today()
    year_month = target_date.strftime("%Y%m")
    prefix = f"EXP-{year_month}-"

    # 查询当月所有凭证号（含旧格式），在 Python 层面过滤出纯数字后缀的标准格式
    existing_all = (
        db.query(Expense.voucher_number)
        .filter(
            Expense.company_id == company_id,
            Expense.voucher_number.like(f"{prefix}%"),
        )
        .all()
    )

    max_num = 0
    for (vnum,) in existing_all:
        suffix = vnum[len(prefix):]  # 截取前缀之后的部分
        # 只处理纯数字后缀（忽略 M001、FE7A99、EMP-001 等旧式格式）
        if re.match(r"^\d+$", suffix):
            try:
                num = int(suffix)
                if num > max_num:
                    max_num = num
            except ValueError:
                pass  # 理论上正则已保证是数字，此处仅作双重保险

    next_num = max_num + 1
    return f"{prefix}{next_num:04d}"


def archive_file(
    file_bytes: bytes,
    filename: str,
    voucher_number: str,
    receipt_date: Optional[date],
    company_id: str,
) -> str:
    """
    将原始收据文件归档至标准目录，使用凭证号重命名
    加入“瘦身”逻辑：将图片统一压缩并转换为 WebP，大幅节约空间。
    """
    target_date = receipt_date or date.today()
    month_dir = target_date.strftime("%Y-%m")

    suffix = Path(filename).suffix.lower()
    archive_dir = Path(settings.RECEIPTS_ARCHIVE_PATH) / company_id / month_dir
    archive_dir.mkdir(parents=True, exist_ok=True)

    # 尝试压缩图片（仅限常见图片格式）
    if suffix in ('.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp'):
        try:
            import io as _io
            from PIL import Image, ImageOps
            import pillow_heif
            
            # 支持 HEIC
            pillow_heif.register_heif_opener()
            
            img = Image.open(_io.BytesIO(file_bytes))
            
            # 自动根据 EXIF 修正方向（防止手机拍照方向不对）
            img = ImageOps.exif_transpose(img)
            
            # 转为 RGB（去除透明通道）
            if img.mode != "RGB":
                img = img.convert("RGB")
                
            # 限制最大宽高，等比例缩放（保留足够清晰度用于复核）
            img.thumbnail((1200, 1600), Image.Resampling.LANCZOS)
            
            # 转为 WebP 格式保存，质量设为 60（高压缩比，人眼难以分辨差别）
            out = _io.BytesIO()
            img.save(out, format="WEBP", quality=60)
            file_bytes = out.getvalue()
            suffix = '.webp'
            logger.info(f"[归档瘦身] {filename} 已压缩为 WebP，压缩后大小: {len(file_bytes)//1024} KB")
        except Exception as e:
            logger.warning(f"[归档瘦身] 图片压缩失败，保留原格式和大小: {e}")

    archive_path = archive_dir / f"{voucher_number}{suffix}"
    archive_path.write_bytes(file_bytes)

    relative_path = f"{settings.RECEIPTS_ARCHIVE_PATH}/{company_id}/{month_dir}/{voucher_number}{suffix}"
    logger.info(f"已归档：{filename} → {archive_path}")
    return relative_path


def calculate_fiscal_year(receipt_date: Optional[date]) -> str:
    """
    按香港财政年度规则计算财年（4月1日起为新财年）

    例：2023-11-01 → "2023-24"
        2024-03-31 → "2023-24"
        2024-04-01 → "2024-25"
    """
    target = receipt_date or date.today()

    if target.month >= 4:
        start = target.year
    else:
        start = target.year - 1

    return f"{start}-{str(start + 1)[-2:]}"


# ── 工具函数 ─────────────────────────────────────────────────────

def _parse_date(date_str: Optional[str]) -> Optional[date]:
    """尝试解析日期字符串，失败时返回 None"""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        logger.warning(f"日期解析失败：{date_str}")
        return None


def _safe_decimal(value) -> Optional[float]:
    """安全转换为浮点数，None/空字符串返回 None"""
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
