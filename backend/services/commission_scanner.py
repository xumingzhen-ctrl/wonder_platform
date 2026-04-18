"""
commission_scanner.py — AIA 佣金月结单 AI 识别服务

复用 receipt_scanner.py 的 OpenRouter Vision 架构，
使用专为 AIA Agent Statement Summary 设计的提取 Prompt。
"""
import base64
import json
import logging
import re
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from openai import OpenAI
from sqlalchemy.orm import Session

from config import settings, ensure_statement_dirs
from services.file_converter import convert_to_jpeg_pages

logger = logging.getLogger(__name__)

# ── AIA 月结单专属 AI Prompt ─────────────────────────────────────────────────
AIA_EXTRACT_PROMPT = """你是专业的香港保险代理税务助手。这是一张 AIA International Limited 的 Agent Statement Summary（代理人结算摘要）截图。

请仔细识别截图中的所有数字，以纯 JSON 格式返回以下字段，不要有任何其他文字：

{
  "insurer_name": "AIA International Limited",
  "agent_code": "代理人编号（如 09201-D6400，在截图左上角 CODE 行）",
  "agent_name": "代理人姓名（NAME 行）",
  "statement_month": "结算月份，格式 YYYY-MM（从 FOR THE MONTH OF YYYY-Mon 提取）",

  "fyc_life_annual": 首年寿险年缴佣金数值（FIRST YEAR COMMISSION > LIFE > ANNUAL 当月列）,
  "fyc_life_semi_annual": 首年寿险半年缴佣金,
  "fyc_life_quarterly": 首年寿险季缴佣金,
  "fyc_life_monthly": 首年寿险月缴佣金,
  "fyc_life_extra": 首年寿险10%额外佣金（10% EXTRA）,
  "fyc_pa": 首年意外险佣金（PERSONAL ACCIDENT）,
  "fyc_mpf": 首年强积金佣金（GROUP > MPF）,
  "fyc_subtotal": 首年佣金合计（SUB-TOTAL (A) 当月列）,

  "renewal_life": 续保寿险佣金（RENEWAL COMMISSION > LIFE 当月列）,
  "renewal_pa": 续保意外险佣金,
  "renewal_mpf": 续保强积金佣金（GROUP > MPF）,
  "renewal_subtotal": 续保佣金合计（SUB-TOTAL (B) 当月列）,

  "other_taxable_income": OTHER TAXABLE INCOME (C) 当月列数值,
  "total_taxable_income": TOTAL TAXABLE INCOME (A+B+C) 当月列数值,
  "misc_deduction": MISC. INCOME & DEDUCTION 当月数值（通常为负数）,
  "allowance_offset": INITIAL FYC / ALLOWANCE 当月数值（通常为负数）,
  "payment_this_month": PAYMENT THIS MONTH 当月数值,

  "ytd_fyc_subtotal": SUB-TOTAL (A) YTD列数值,
  "ytd_renewal_subtotal": SUB-TOTAL (B) YTD列数值,
  "ytd_other_income": OTHER TAXABLE INCOME (C) YTD列数值,
  "ytd_total_taxable": TOTAL TAXABLE INCOME (A+B+C) YTD列数值,
  "ytd_payment": PAYMENT THIS MONTH YTD列数值,

  "confidence": 你对本次识别准确度的自我评估（0-100整数）
}

重要规则：
1. 所有金额字段均为数字（浮点数），无法识别填 null，不要填 0
2. 截图左侧紧靠数据的列为 YTD（年累计），最后一列为本月（当月）数据
3. statement_month 月份映射：Jan=01, Feb=02, Mar=03, Apr=04, May=05, Jun=06, Jul=07, Aug=08, Sep=09, Oct=10, Nov=11, Dec=12
4. 负数请保留负号（如 misc_deduction 通常是负数）
5. 只返回 JSON，不要有任何解释性文字
"""


def _get_openrouter_client() -> OpenAI:
    return OpenAI(
        base_url=settings.OPENROUTER_BASE_URL,
        api_key=settings.OPENROUTER_API_KEY,
    )


def _call_vision_api(jpeg_bytes: bytes, model: str, client: OpenAI) -> tuple[dict, str]:
    """
    调用 OpenRouter Vision API 提取 AIA 月结单数据

    Returns:
        (parsed_dict, raw_text)
    Raises:
        ValueError: AI 返回内容无法解析为 JSON
    """
    b64_image = base64.b64encode(jpeg_bytes).decode("utf-8")

    response = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": AIA_EXTRACT_PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64_image}"},
                    },
                ],
            }
        ],
        max_tokens=2048,
        temperature=0.1,
    )

    raw_text = response.choices[0].message.content.strip()

    # 提取 JSON（兼容 AI 输出 markdown 代码块的情况）
    json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
    if not json_match:
        raise ValueError(f"AI 未返回有效 JSON：{raw_text[:300]}")

    return json.loads(json_match.group()), raw_text


def _parse_statement_month(month_str: Optional[str]) -> Optional[str]:
    """验证并规范化月份字符串为 YYYY-MM 格式"""
    if not month_str:
        return None
    # 如果已经是 YYYY-MM 格式
    if re.match(r"^\d{4}-\d{2}$", month_str):
        return month_str
    logger.warning(f"月份格式异常：{month_str}")
    return month_str


def _calculate_fiscal_year(month_str: Optional[str]) -> str:
    """
    由于AIA月结单实际发放时间通常在次月，因此将其所属月份+1后来判断归属财年。
    例如 2024-03 月结单，在 2024-04 发放，属于 2024-25 财年。
    """
    if not month_str:
        today = date.today()
        year, month = today.year, today.month
    else:
        try:
            year, month = int(month_str[:4]), int(month_str[5:7])
        except (ValueError, IndexError):
            today = date.today()
            year, month = today.year, today.month

    # AIA 佣金实际发放在次月，因此入账月份（核心所在财年）+1
    payment_month = month + 1
    payment_year = year
    
    # 跨年处理
    if payment_month > 12:
        payment_month = 1
        payment_year += 1

    # 香港财年：4月1日至次年3月31日
    if payment_month >= 4:
        start = payment_year
    else:
        start = payment_year - 1
        
    return f"{start}-{str(start + 1)[-2:]}"


def _generate_statement_number(db: Session, company_id: str, statement_month: str) -> str:
    """
    生成唯一结算单编号：STMT-YYYYMM-XXXX

    在公司+月份维度内自增序号
    """
    from models.commission import CommissionStatement

    year_month = statement_month.replace("-", "")  # "2025-12" → "202512"
    prefix = f"STMT-{year_month}-"

    existing = (
        db.query(CommissionStatement.id)
        .filter(
            CommissionStatement.company_id == company_id,
            CommissionStatement.statement_month == statement_month,
        )
        .count()
    )

    next_num = existing + 1
    return f"{prefix}{next_num:04d}"


def archive_statement_file(
    file_bytes: bytes,
    filename: str,
    stmt_number: str,
    statement_month: Optional[str],
) -> str:
    """
    归档结算单图片到 statements_archive/YYYY-MM/ 目录

    Returns: 相对路径字符串
    """
    if statement_month:
        month_dir = statement_month  # "2025-12"
    else:
        month_dir = datetime.utcnow().strftime("%Y-%m")

    suffix = Path(filename).suffix.lower() or ".jpg"
    archive_dir = Path(settings.STATEMENTS_ARCHIVE_PATH) / month_dir
    archive_dir.mkdir(parents=True, exist_ok=True)

    archive_path = archive_dir / f"{stmt_number}{suffix}"
    archive_path.write_bytes(file_bytes)

    relative_path = f"{settings.STATEMENTS_ARCHIVE_PATH}/{month_dir}/{stmt_number}{suffix}"
    logger.info(f"已归档：{filename} → {archive_path}")
    return relative_path


def _safe_decimal(value) -> Optional[float]:
    """安全转换为浮点数，None/空字符串返回 None"""
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


async def scan_commission_statement(
    file_bytes: bytes,
    filename: str,
    db: Session,
    company_id: str,
) -> dict:
    """
    主入口：对一张 AIA 月结单截图进行完整的 AI 扫描流程

    Args:
        file_bytes:  文件原始字节
        filename:    原始文件名
        db:          数据库 Session
        company_id:  所属公司 ID

    Returns:
        包含提取结果的字典（写入数据库前的中间态）
    """
    client = _get_openrouter_client()

    # 1. 格式预处理：统一转为 JPEG
    jpeg_pages = convert_to_jpeg_pages(file_bytes, filename)
    logger.info(f"[{filename}] 转换完成，共 {len(jpeg_pages)} 页（取第1页）")

    # 月结单通常只有1页，取置信度最高的
    extracted_data = None
    raw_response_all = []
    best_confidence = 0
    model_used = settings.OPENROUTER_MODEL_FREE

    for page_idx, jpeg_bytes in enumerate(jpeg_pages[:2]):  # 最多处理2页
        try:
            page_data, raw_text = _call_vision_api(jpeg_bytes, model_used, client)
            raw_response_all.append({"page": page_idx + 1, "data": page_data})

            page_conf = page_data.get("confidence", 0) or 0
            if page_conf > best_confidence:
                best_confidence = page_conf
                extracted_data = page_data

            logger.info(
                f"[{filename}] 第{page_idx + 1}页识别完成 | "
                f"月份：{page_data.get('statement_month')} | "
                f"应税总额：{page_data.get('total_taxable_income')} | "
                f"置信度：{page_conf}%"
            )

        except Exception as e:
            if model_used == settings.OPENROUTER_MODEL_FREE:
                logger.warning(f"免费模型失败，切换付费模型：{e}")
                model_used = settings.OPENROUTER_MODEL_PAID
                try:
                    page_data, raw_text = _call_vision_api(jpeg_bytes, model_used, client)
                    raw_response_all.append({"page": page_idx + 1, "data": page_data})
                    page_conf = page_data.get("confidence", 0) or 0
                    if page_conf > best_confidence:
                        best_confidence = page_conf
                        extracted_data = page_data
                except Exception as e2:
                    logger.error(f"[{filename}] 识别失败（两种模型均失败）：{e2}")
            else:
                logger.error(f"[{filename}] 识别失败：{e}")

    if not extracted_data:
        raise RuntimeError(f"文件 [{filename}] 识别失败")

    # 2. 解析月份和财年
    statement_month = _parse_statement_month(extracted_data.get("statement_month"))
    fiscal_year = _calculate_fiscal_year(statement_month)

    # 3. 生成结算单编号
    stmt_number = _generate_statement_number(db, company_id, statement_month or "unknown")

    # 4. 归档图片
    image_path = archive_statement_file(file_bytes, filename, stmt_number, statement_month)

    return {
        "stmt_number":          stmt_number,
        "insurer_name":         extracted_data.get("insurer_name", "AIA International Limited"),
        "agent_code":           extracted_data.get("agent_code"),
        "agent_name":           extracted_data.get("agent_name"),
        "statement_month":      statement_month,
        "fiscal_year":          fiscal_year,

        "fyc_life_annual":      _safe_decimal(extracted_data.get("fyc_life_annual")),
        "fyc_life_semi_annual": _safe_decimal(extracted_data.get("fyc_life_semi_annual")),
        "fyc_life_quarterly":   _safe_decimal(extracted_data.get("fyc_life_quarterly")),
        "fyc_life_monthly":     _safe_decimal(extracted_data.get("fyc_life_monthly")),
        "fyc_life_extra":       _safe_decimal(extracted_data.get("fyc_life_extra")),
        "fyc_pa":               _safe_decimal(extracted_data.get("fyc_pa")),
        "fyc_mpf":              _safe_decimal(extracted_data.get("fyc_mpf")),
        "fyc_subtotal":         _safe_decimal(extracted_data.get("fyc_subtotal")),

        "renewal_life":         _safe_decimal(extracted_data.get("renewal_life")),
        "renewal_pa":           _safe_decimal(extracted_data.get("renewal_pa")),
        "renewal_mpf":          _safe_decimal(extracted_data.get("renewal_mpf")),
        "renewal_subtotal":     _safe_decimal(extracted_data.get("renewal_subtotal")),

        "other_taxable_income": _safe_decimal(extracted_data.get("other_taxable_income")),
        "total_taxable_income": _safe_decimal(extracted_data.get("total_taxable_income")),
        "misc_deduction":       _safe_decimal(extracted_data.get("misc_deduction")),
        "allowance_offset":     _safe_decimal(extracted_data.get("allowance_offset")),
        "payment_this_month":   _safe_decimal(extracted_data.get("payment_this_month")),

        "ytd_fyc_subtotal":     _safe_decimal(extracted_data.get("ytd_fyc_subtotal")),
        "ytd_renewal_subtotal": _safe_decimal(extracted_data.get("ytd_renewal_subtotal")),
        "ytd_other_income":     _safe_decimal(extracted_data.get("ytd_other_income")),
        "ytd_total_taxable":    _safe_decimal(extracted_data.get("ytd_total_taxable")),
        "ytd_payment":          _safe_decimal(extracted_data.get("ytd_payment")),

        "source_image_path":         image_path,
        "source_original_filename":  filename,
        "ai_confidence":             best_confidence,
        "ai_raw_response":           json.dumps(raw_response_all, ensure_ascii=False),
    }
