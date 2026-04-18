"""
file_converter.py — 格式预处理层

将所有输入格式统一转换为 JPEG bytes，再送给 AI 视觉识别。
支持：JPEG、PNG（直接读取）、HEIC（iPhone 照片）、PDF（逐页转换）
"""
import io
import logging
from pathlib import Path
from typing import List

from PIL import Image

logger = logging.getLogger(__name__)

SUPPORTED_FORMATS = {".jpg", ".jpeg", ".png", ".heic", ".pdf"}


def _register_heic():
    """尝试注册 HEIC 支持，如果库未安装则优雅降级"""
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
        return True
    except ImportError:
        logger.warning("pillow-heif 未安装，HEIC 格式支持不可用")
        return False


_HEIC_SUPPORT = _register_heic()


def convert_to_jpeg_pages(file_bytes: bytes, filename: str) -> List[bytes]:
    """
    将任意支持格式的文件转换为 JPEG 图片列表（每页一张）

    Args:
        file_bytes: 文件的原始字节
        filename: 原始文件名（用于判断格式）

    Returns:
        JPEG bytes 列表（大多数情况下只有一页）

    Raises:
        ValueError: 不支持的格式
        RuntimeError: 转换失败
    """
    suffix = Path(filename).suffix.lower()

    if suffix not in SUPPORTED_FORMATS:
        raise ValueError(f"不支持的文件格式: {suffix}。支持格式：{SUPPORTED_FORMATS}")

    # ── PDF：逐页转换 ─────────────────────────────────────────
    if suffix == ".pdf":
        return _pdf_to_jpegs(file_bytes, filename)

    # ── HEIC：转换为 JPEG ─────────────────────────────────────
    if suffix == ".heic":
        if not _HEIC_SUPPORT:
            raise RuntimeError("HEIC 格式需要安装 pillow-heif 库：pip install pillow-heif")
        return _image_to_jpegs(file_bytes, filename)

    # ── JPEG / PNG：直接处理 ──────────────────────────────────
    return _image_to_jpegs(file_bytes, filename)


def _image_to_jpegs(file_bytes: bytes, filename: str) -> List[bytes]:
    """将单张图片（JPEG/PNG/HEIC）转换为 JPEG bytes"""
    try:
        img = Image.open(io.BytesIO(file_bytes))
        img = img.convert("RGB")  # 统一转为 RGB（处理 RGBA / 灰度图）

        # 如果图片尺寸过大，做一次等比缩放（避免 base64 超出 API 限制）
        max_dimension = 4096
        if img.width > max_dimension or img.height > max_dimension:
            img.thumbnail((max_dimension, max_dimension), Image.LANCZOS)
            logger.info(f"图片 {filename} 已缩放至 {img.size}（原图过大）")

        output = io.BytesIO()
        img.save(output, format="JPEG", quality=90, optimize=True)
        return [output.getvalue()]

    except Exception as e:
        raise RuntimeError(f"图片转换失败 [{filename}]: {e}") from e


def _pdf_to_jpegs(file_bytes: bytes, filename: str) -> List[bytes]:
    """将 PDF 的每一页转换为独立的 JPEG bytes 列表"""
    try:
        import fitz  # pymupdf

        doc = fitz.open(stream=file_bytes, filetype="pdf")
        pages = []

        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            # dpi=150 对发票识别足够清晰，同时控制文件大小
            mat = fitz.Matrix(150 / 72, 150 / 72)
            pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)

            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            output = io.BytesIO()
            img.save(output, format="JPEG", quality=90, optimize=True)
            pages.append(output.getvalue())

            logger.debug(f"PDF [{filename}] 第 {page_num + 1}/{len(doc)} 页已转换")

        doc.close()

        if not pages:
            raise RuntimeError(f"PDF [{filename}] 内容为空")

        logger.info(f"PDF [{filename}] 共 {len(pages)} 页已转换为 JPEG")
        return pages

    except ImportError:
        raise RuntimeError("PDF 格式需要安装 pymupdf 库：pip install pymupdf")
    except Exception as e:
        raise RuntimeError(f"PDF 转换失败 [{filename}]: {e}") from e


def get_source_format(filename: str) -> str:
    """获取文件的标准化格式标识"""
    suffix = Path(filename).suffix.lower().lstrip(".")
    return "jpeg" if suffix in ("jpg", "jpeg") else suffix
