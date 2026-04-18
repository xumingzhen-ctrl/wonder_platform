"""
statements_watcher.py — 佣金月结单 Inbox 文件夹监控

对标 inbox_watcher.py，专用于 statements_inbox/ 文件夹。

使用方法：
  cd backend/
  # 历史数据批量导入
  ./venv/bin/python -m services.statements_watcher --scan-once --company-id YOUR_COMPANY_ID

  # 持续监控（日常使用）
  ./venv/bin/python -m services.statements_watcher --watch --company-id YOUR_COMPANY_ID
"""
import argparse
import asyncio
import logging
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import settings, ensure_statement_dirs
from database import SessionLocal
from services.file_converter import SUPPORTED_FORMATS
from services.commission_scanner import scan_commission_statement
from models.commission import CommissionStatement, CommissionStatus

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("statements_watcher")


async def process_single_statement(file_path: Path, company_id: str) -> dict:
    """
    处理单个月结单文件：AI 识别 → 写入数据库 → 归档
    成功后从 inbox 删除，失败后移至 statements_error/
    """
    filename = file_path.name
    result = {"filename": filename, "status": "unknown"}

    db = SessionLocal()
    try:
        file_bytes = file_path.read_bytes()
        extracted = await scan_commission_statement(file_bytes, filename, db, company_id)

        stmt = CommissionStatement(
            company_id=company_id,
            insurer_name=extracted["insurer_name"],
            agent_code=extracted.get("agent_code"),
            agent_name=extracted.get("agent_name"),
            statement_month=extracted["statement_month"],
            fiscal_year=extracted["fiscal_year"],

            fyc_life_annual=extracted.get("fyc_life_annual"),
            fyc_life_semi_annual=extracted.get("fyc_life_semi_annual"),
            fyc_life_quarterly=extracted.get("fyc_life_quarterly"),
            fyc_life_monthly=extracted.get("fyc_life_monthly"),
            fyc_life_extra=extracted.get("fyc_life_extra"),
            fyc_pa=extracted.get("fyc_pa"),
            fyc_mpf=extracted.get("fyc_mpf"),
            fyc_subtotal=extracted.get("fyc_subtotal"),

            renewal_life=extracted.get("renewal_life"),
            renewal_pa=extracted.get("renewal_pa"),
            renewal_mpf=extracted.get("renewal_mpf"),
            renewal_subtotal=extracted.get("renewal_subtotal"),

            other_taxable_income=extracted.get("other_taxable_income"),
            total_taxable_income=extracted.get("total_taxable_income"),
            misc_deduction=extracted.get("misc_deduction"),
            allowance_offset=extracted.get("allowance_offset"),
            payment_this_month=extracted.get("payment_this_month"),

            ytd_fyc_subtotal=extracted.get("ytd_fyc_subtotal"),
            ytd_renewal_subtotal=extracted.get("ytd_renewal_subtotal"),
            ytd_other_income=extracted.get("ytd_other_income"),
            ytd_total_taxable=extracted.get("ytd_total_taxable"),
            ytd_payment=extracted.get("ytd_payment"),

            source_image_path=extracted.get("source_image_path"),
            source_original_filename=extracted.get("source_original_filename"),
            ai_confidence=extracted.get("ai_confidence"),
            ai_raw_response=extracted.get("ai_raw_response"),
            status=CommissionStatus.pending,
        )
        db.add(stmt)
        db.commit()

        file_path.unlink()  # 从 inbox 删除（已归档）

        result = {
            "filename": filename,
            "status": "success",
            "statement_month": stmt.statement_month,
            "fiscal_year": stmt.fiscal_year,
            "total_taxable": float(stmt.total_taxable_income) if stmt.total_taxable_income else None,
            "ai_confidence": stmt.ai_confidence,
        }
        logger.info(
            f"✅ [{filename}] → 月份: {stmt.statement_month} | "
            f"应税总额: HKD {stmt.total_taxable_income} | "
            f"置信度: {stmt.ai_confidence}%"
        )

    except Exception as e:
        db.rollback()
        logger.error(f"❌ [{filename}] 处理失败: {e}", exc_info=True)

        error_dir = Path(settings.STATEMENTS_ERROR_PATH)
        error_dir.mkdir(parents=True, exist_ok=True)
        error_path = error_dir / filename

        if error_path.exists():
            import time
            stem = file_path.stem
            suffix = file_path.suffix
            error_path = error_dir / f"{stem}_{int(time.time())}{suffix}"

        shutil.move(str(file_path), str(error_path))
        (error_dir / "error.log").open("a", encoding="utf-8").write(
            f"{filename} | 错误: {e}\n"
        )
        result = {"filename": filename, "status": "error", "error": str(e)}

    finally:
        db.close()

    return result


async def run_scan_once(company_id: str) -> dict:
    """一次性扫描 statements_inbox/ 下所有支持格式的图片"""
    ensure_statement_dirs()
    inbox_path = Path(settings.STATEMENTS_INBOX_PATH)

    pending_files = [
        f for f in inbox_path.iterdir()
        if f.is_file() and f.suffix.lower() in SUPPORTED_FORMATS
    ]

    if not pending_files:
        logger.info(f"Inbox 为空：{inbox_path}")
        return {"total": 0, "success": 0, "failed": 0, "results": []}

    logger.info(f"发现 {len(pending_files)} 个待处理月结单，开始扫描...")

    semaphore = asyncio.Semaphore(settings.INBOX_SCAN_CONCURRENCY)

    async def process_with_semaphore(file_path: Path):
        async with semaphore:
            return await process_single_statement(file_path, company_id)

    tasks = [process_with_semaphore(f) for f in pending_files]
    results = await asyncio.gather(*tasks, return_exceptions=False)

    success_count = sum(1 for r in results if r["status"] == "success")
    failed_count = len(results) - success_count

    logger.info(
        f"扫描完成：总计 {len(results)} 个文件 | 成功 {success_count} | 失败 {failed_count}"
    )
    return {
        "total": len(results),
        "success": success_count,
        "failed": failed_count,
        "results": list(results),
    }


def run_watch_mode(company_id: str):
    """持续监控 statements_inbox/ 文件夹"""
    try:
        from watchdog.observers import Observer
        from watchdog.events import FileSystemEventHandler
    except ImportError:
        logger.error("watchdog 未安装，请运行：pip install watchdog")
        sys.exit(1)

    ensure_statement_dirs()
    inbox_path = str(Path(settings.STATEMENTS_INBOX_PATH).resolve())

    class StatementHandler(FileSystemEventHandler):
        def on_created(self, event):
            if event.is_directory:
                return
            file_path = Path(event.src_path)
            if file_path.suffix.lower() not in SUPPORTED_FORMATS:
                return
            logger.info(f"检测到新月结单：{file_path.name}")
            asyncio.run(process_single_statement(file_path, company_id))

    observer = Observer()
    observer.schedule(StatementHandler(), inbox_path, recursive=False)
    observer.start()
    logger.info(f"👀 持续监控已启动：{inbox_path}")
    logger.info("将月结单截图放入上述目录即可自动处理。按 Ctrl+C 停止。")

    try:
        import time
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        logger.info("监控已停止")
    observer.join()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="佣金月结单 Inbox 处理器")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--scan-once", action="store_true", help="一次性全量扫描")
    mode.add_argument("--watch", action="store_true", help="持续监控")
    parser.add_argument(
        "--company-id",
        default=settings.DEFAULT_COMPANY_ID,
        help="公司 ID"
    )
    args = parser.parse_args()

    if not args.company_id:
        logger.error("必须提供 --company-id 或在 .env 中配置 DEFAULT_COMPANY_ID")
        sys.exit(1)

    if args.scan_once:
        result = asyncio.run(run_scan_once(args.company_id))
        print(f"\n{'='*50}")
        print(f"扫描完成：{result['success']}/{result['total']} 成功")
    elif args.watch:
        run_watch_mode(args.company_id)
