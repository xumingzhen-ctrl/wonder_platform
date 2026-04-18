"""
inbox_watcher.py — 收据 Inbox 文件夹监控与批量扫描

支持两种运行模式：
  --scan-once    一次性全量扫描（适合历史数据批量导入）
  --watch        持续监控模式（新文件进入即自动处理）

使用方法：
  cd backend/
  # 历史数据批量导入（推荐先用这个）
  ./venv/bin/python -m services.inbox_watcher --scan-once --company-id YOUR_COMPANY_ID

  # 持续监控（日常使用）
  ./venv/bin/python -m services.inbox_watcher --watch --company-id YOUR_COMPANY_ID
"""
import argparse
import asyncio
import logging
import shutil
import sys
from pathlib import Path

# 确保可以在 backend/ 目录直接运行
sys.path.insert(0, str(Path(__file__).parent.parent))

from config import settings, ensure_receipt_dirs
from database import SessionLocal
from services.file_converter import SUPPORTED_FORMATS
from services.receipt_scanner import scan_receipt
from models.expense import Expense, ExpenseCategory, ExpenseStatus

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("inbox_watcher")


async def process_single_file(
    file_path: Path,
    company_id: str,
) -> dict:
    """
    处理单个文件：调用 AI 识别 → 写入数据库 → 归档

    成功后从 inbox 删除（已归档到 receipts_archive/）
    失败后移至 receipts_error/
    """
    filename = file_path.name
    result = {"filename": filename, "status": "unknown"}

    db = SessionLocal()
    try:
        # 检查是否已处理（避免重复录入）
        file_bytes = file_path.read_bytes()

        extracted = await scan_receipt(file_bytes, filename, db, company_id)

        # 查找分类
        category = db.query(ExpenseCategory).filter(
            ExpenseCategory.code == extracted["suggested_category_code"]
        ).first()

        expense = Expense(
            company_id=company_id,
            voucher_number=extracted["voucher_number"],
            receipt_type=extracted.get("receipt_type"),
            receipt_date=extracted.get("receipt_date"),
            vendor_name=extracted.get("vendor_name"),
            vendor_tax_id=extracted.get("vendor_tax_id"),
            description=extracted.get("description"),
            currency=extracted.get("currency", "HKD"),
            amount_original=extracted.get("amount_original"),
            tax_rate=extracted.get("tax_rate"),
            tax_amount=extracted.get("tax_amount"),
            total_amount=extracted.get("total_amount"),
            amount_hkd=extracted.get("amount_hkd"),
            cn_invoice_code=extracted.get("cn_invoice_code"),
            cn_invoice_number=extracted.get("cn_invoice_number"),
            category_id=category.id if category else None,
            ai_confidence=extracted.get("ai_confidence"),
            ai_raw_response=extracted.get("ai_raw_response"),
            receipt_image_path=extracted.get("receipt_image_path"),
            receipt_original_filename=extracted.get("receipt_original_filename"),
            source_format=extracted.get("source_format"),
            fiscal_year=extracted.get("fiscal_year"),
            file_hash=extracted.get("file_hash"),
            status=ExpenseStatus.pending,
        )
        db.add(expense)
        db.commit()

        # 从 inbox 删除（已归档）
        file_path.unlink()

        result = {
            "filename": filename,
            "status": "success",
            "voucher_number": expense.voucher_number,
            "vendor_name": expense.vendor_name,
            "total_amount": float(expense.total_amount) if expense.total_amount else None,
            "currency": expense.currency,
            "receipt_date": str(expense.receipt_date) if expense.receipt_date else None,
            "fiscal_year": expense.fiscal_year,
            "ai_confidence": expense.ai_confidence,
        }
        logger.info(
            f"✅ [{filename}] → 凭证号: {expense.voucher_number} | "
            f"商户: {expense.vendor_name} | "
            f"金额: {expense.currency} {expense.total_amount} | "
            f"置信度: {expense.ai_confidence}%"
        )

    except Exception as e:
        db.rollback()
        logger.error(f"❌ [{filename}] 处理失败: {e}", exc_info=True)

        # 移至错误文件夹
        error_dir = Path(settings.RECEIPTS_ERROR_PATH)
        error_dir.mkdir(parents=True, exist_ok=True)
        error_path = error_dir / filename

        # 如已有同名文件，加时间戳区分
        if error_path.exists():
            import time
            stem = file_path.stem
            suffix = file_path.suffix
            error_path = error_dir / f"{stem}_{int(time.time())}{suffix}"

        shutil.move(str(file_path), str(error_path))

        # 写错误日志
        (error_dir / "error.log").open("a", encoding="utf-8").write(
            f"{filename} | 错误: {e}\n"
        )

        result = {"filename": filename, "status": "error", "error": str(e)}

    finally:
        db.close()

    return result


async def run_scan_once(company_id: str, db=None) -> dict:
    """
    一次性扫描 inbox 文件夹内所有支持格式的文件

    可从 API 接口调用（传入 db），也可命令行独立调用（db=None）
    """
    ensure_receipt_dirs()
    inbox_path = Path(settings.RECEIPTS_INBOX_PATH)

    # 收集所有待处理文件
    pending_files = [
        f for f in inbox_path.iterdir()
        if f.is_file() and f.suffix.lower() in SUPPORTED_FORMATS
    ]

    if not pending_files:
        logger.info(f"Inbox 文件夹为空：{inbox_path}")
        return {"total": 0, "success": 0, "failed": 0, "results": []}

    logger.info(f"发现 {len(pending_files)} 个待处理文件，开始扫描...")
    logger.info(f"并发数: {settings.INBOX_SCAN_CONCURRENCY}")

    # 分批并发处理（控制 API 速率）
    results = []
    semaphore = asyncio.Semaphore(settings.INBOX_SCAN_CONCURRENCY)

    async def process_with_semaphore(file_path: Path):
        async with semaphore:
            return await process_single_file(file_path, company_id)

    tasks = [process_with_semaphore(f) for f in pending_files]
    results = await asyncio.gather(*tasks, return_exceptions=False)

    success_count = sum(1 for r in results if r["status"] == "success")
    failed_count = len(results) - success_count

    logger.info(
        f"扫描完成：总计 {len(results)} 个文件 | "
        f"成功 {success_count} | 失败 {failed_count}"
    )

    return {
        "total": len(results),
        "success": success_count,
        "failed": failed_count,
        "results": list(results),
    }


def run_watch_mode(company_id: str):
    """持续监控模式：使用 watchdog 实时监听 inbox 文件夹"""
    try:
        from watchdog.observers import Observer
        from watchdog.events import FileSystemEventHandler, FileCreatedEvent
    except ImportError:
        logger.error("watchdog 未安装，请运行：pip install watchdog")
        sys.exit(1)

    ensure_receipt_dirs()
    inbox_path = str(Path(settings.RECEIPTS_INBOX_PATH).resolve())

    class ReceiptHandler(FileSystemEventHandler):
        def on_created(self, event):
            if event.is_directory:
                return
            file_path = Path(event.src_path)
            if file_path.suffix.lower() not in SUPPORTED_FORMATS:
                logger.debug(f"跳过不支持的格式：{file_path.name}")
                return
            logger.info(f"检测到新文件：{file_path.name}")
            asyncio.run(process_single_file(file_path, company_id))

    observer = Observer()
    observer.schedule(ReceiptHandler(), inbox_path, recursive=False)
    observer.start()
    logger.info(f"👀 持续监控已启动：{inbox_path}")
    logger.info("将收据文件放入上述目录即可自动处理。按 Ctrl+C 停止。")

    try:
        import time
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        logger.info("监控已停止")
    observer.join()


# ── 命令行入口 ─────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="收据 Inbox 处理器")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--scan-once", action="store_true", help="一次性全量扫描 inbox 文件夹")
    mode.add_argument("--watch", action="store_true", help="持续监控 inbox 文件夹")
    parser.add_argument(
        "--company-id",
        default=settings.DEFAULT_COMPANY_ID,
        help="公司 ID（默认使用 .env 中的 DEFAULT_COMPANY_ID）"
    )
    args = parser.parse_args()

    if not args.company_id:
        logger.error("必须提供 --company-id 或在 .env 中配置 DEFAULT_COMPANY_ID")
        sys.exit(1)

    logger.info(f"公司 ID: {args.company_id}")

    if args.scan_once:
        result = asyncio.run(run_scan_once(args.company_id))
        print(f"\n{'='*50}")
        print(f"扫描完成：{result['success']}/{result['total']} 成功")
        if result['failed'] > 0:
            print(f"失败文件已移至：{settings.RECEIPTS_ERROR_PATH}/")
    elif args.watch:
        run_watch_mode(args.company_id)
