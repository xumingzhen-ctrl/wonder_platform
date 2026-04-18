"""
ir56m_scanner.py — IR56M 年报 AI 识别服务
用于解析香港非雇员报酬申报表 (IR56M)
"""
import base64
import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

from openai import OpenAI
from sqlalchemy.orm import Session

from config import settings
from services.file_converter import convert_to_jpeg_pages

logger = logging.getLogger(__name__)

IR56M_EXTRACT_PROMPT = """你是专业的香港保险代理税务助手。这是一张香港税务局的 IR56M 表格（NOTIFICATION OF REMUNERATION PAID TO PERSONS OTHER THAN EMPLOYEES）。

请仔细识别截图中的所有数字，以纯 JSON 格式返回以下字段，不要有任何其他文字：

{
  "payer_name": "NAME OF PAYER 的内容，如 AIA INTERNATIONAL LIMITED",
  "agent_code": "CODE NO. (如 0920100000D6400)",
  "agent_name": "NAME OF RECIPIENT 的内容文字",
  "period_start": "PERIOD 内容的开始时间 (如 01/04/2024)",
  "period_end": "PERIOD 内容的结束时间 (如 31/03/2025)",
  "fiscal_year": "根据结束时间计算的财年跨度，如 2024-25（如果结束在2025年3月则为2024-25）",
  "total_income": TOTAL 或 COMMISSION 的最终金额，提取成纯数字（如 1410353.00）,
  "confidence": 你对本次识别准确度的自我评估（0-100整数）
}

重点提示：
1. total_income 必须是数字类型（去除逗号）
2. 如果找不到某些值，填 null
3. 请仅仅返回合法的 JSON 格式。
"""

def _get_openrouter_client() -> OpenAI:
    return OpenAI(
        base_url=settings.OPENROUTER_BASE_URL,
        api_key=settings.OPENROUTER_API_KEY,
    )


def _call_vision_api(jpeg_bytes: bytes, model: str, client: OpenAI) -> tuple[dict, str]:
    b64_image = base64.b64encode(jpeg_bytes).decode("utf-8")

    response = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": IR56M_EXTRACT_PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64_image}"},
                    },
                ],
            }
        ],
        max_tokens=1024,
        temperature=0.1,
    )

    raw_text = response.choices[0].message.content.strip()
    json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
    if not json_match:
        raise ValueError(f"AI 未返回有效 JSON：{raw_text[:300]}")

    return json.loads(json_match.group()), raw_text


def archive_ir56m_file(
    file_bytes: bytes,
    filename: str,
    stmt_id: str,
    fiscal_year: Optional[str],
) -> str:
    fy_dir = fiscal_year or datetime.utcnow().strftime("%Y")
    
    suffix = Path(filename).suffix.lower() or ".jpg"
    archive_dir = Path(settings.STATEMENTS_ARCHIVE_PATH) / f"ir56m_{fy_dir}"
    archive_dir.mkdir(parents=True, exist_ok=True)

    archive_path = archive_dir / f"IR56M_{stmt_id}{suffix}"
    archive_path.write_bytes(file_bytes)

    return f"{settings.STATEMENTS_ARCHIVE_PATH}/ir56m_{fy_dir}/IR56M_{stmt_id}{suffix}"


async def scan_ir56m_statement(
    file_bytes: bytes,
    filename: str,
    stmt_id: str,
) -> dict:
    client = _get_openrouter_client()
    jpeg_pages = convert_to_jpeg_pages(file_bytes, filename)
    logger.info(f"[{filename}] IR56M 转换完成，共 {len(jpeg_pages)} 页（取第一页）")

    extracted_data = None
    raw_response_all = []
    best_confidence = 0
    model_used = settings.OPENROUTER_MODEL_FREE

    for page_idx, jpeg_bytes in enumerate(jpeg_pages[:1]): # 通常只有一页
        try:
            page_data, raw_text = _call_vision_api(jpeg_bytes, model_used, client)
            raw_response_all.append({"page": page_idx + 1, "data": page_data})
            page_conf = page_data.get("confidence", 0) or 0
            if page_conf > best_confidence:
                best_confidence = page_conf
                extracted_data = page_data
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
        raise RuntimeError(f"文件 [{filename}] IR56M 识别失败")

    fiscal_year = extracted_data.get("fiscal_year", "unknown")
    image_path = archive_ir56m_file(file_bytes, filename, stmt_id, fiscal_year)

    def _safe_decimal(value):
        if value is None or value == "":
            return None
        try:
            return float(str(value).replace(',', ''))
        except (TypeError, ValueError):
            return None

    return {
        "payer_name":         extracted_data.get("payer_name"),
        "agent_code":         extracted_data.get("agent_code"),
        "agent_name":         extracted_data.get("agent_name"),
        "period_start":       extracted_data.get("period_start"),
        "period_end":         extracted_data.get("period_end"),
        "fiscal_year":        fiscal_year,
        "total_income":       _safe_decimal(extracted_data.get("total_income")),

        "source_image_path":         image_path,
        "source_original_filename":  filename,
        "ai_confidence":             best_confidence,
        "ai_raw_response":           json.dumps(raw_response_all, ensure_ascii=False),
    }
