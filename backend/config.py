from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./hk_admin.db"
    SECRET_KEY: str = "change-this-secret-key-in-production-32chars"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days
    APP_NAME: str = "HK Admin System"

    # ── CORS 跨域配置 ─────────────────────────────────────────────
    # 本地开发默认值；生产环境在 .env 中以逗号分隔追加公网地址
    # 例如：CORS_ORIGINS=http://1.2.3.4,http://1.2.3.4:5174,http://1.2.3.4:5175
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5174,http://localhost:5175"

    # ── AI 服务配置 ──────────────────────────────────────────────
    DEEPSEEK_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_MODEL_FREE: str = "qwen/qwen2.5-vl-72b-instruct"
    OPENROUTER_MODEL_PAID: str = "qwen/qwen2.5-vl-72b-instruct"

    # ── 收据文件夹配置 ───────────────────────────────────────────
    RECEIPTS_INBOX_PATH: str = "./receipts_inbox"       # 待处理收据投放目录
    RECEIPTS_ARCHIVE_PATH: str = "./receipts_archive"   # 处理完成归档目录
    RECEIPTS_ERROR_PATH: str = "./receipts_error"       # 处理失败隔离目录

    # ── 佣金月结单文件夹配置 ─────────────────────────────────────
    STATEMENTS_INBOX_PATH: str = "./statements_inbox"     # 待处理月结单投放目录
    STATEMENTS_ARCHIVE_PATH: str = "./statements_archive" # 处理完成归档目录
    STATEMENTS_ERROR_PATH: str = "./statements_error"     # 处理失败隔离目录

    # ── 公司配置 ─────────────────────────────────────────────
    DEFAULT_COMPANY_ID: str = ""   # inbox 扫描时使用的默认公司 ID

    # ── inbox 并发扫描设置 ───────────────────────────────────────
    INBOX_SCAN_CONCURRENCY: int = 3   # 并发处理数（避免 API 速率限制）

    # ── 财富问卷通知推送配置 ─────────────────────────────────────
    TELEGRAM_BOT_TOKEN: str = ""           # Telegram Bot Token
    TELEGRAM_ADMIN_CHAT_ID: str = ""       # 管理员 Chat ID（个人或群组）
    GMAIL_SENDER: str = ""                 # Gmail 发件人地址
    GMAIL_APP_PASSWORD: str = ""           # Gmail 应用专用密码（非登录密码）
    ADMIN_EMAIL: str = ""                  # 管理员收件邮箱

    class Config:
        env_file = ".env"


settings = Settings()


def ensure_receipt_dirs():
    """确保收据相关的文件夹都已存在"""
    for path_str in [
        settings.RECEIPTS_INBOX_PATH,
        settings.RECEIPTS_ARCHIVE_PATH,
        settings.RECEIPTS_ERROR_PATH,
    ]:
        Path(path_str).mkdir(parents=True, exist_ok=True)


def ensure_statement_dirs():
    """确保佣金月结单相关的文件夹都已存在"""
    for path_str in [
        settings.STATEMENTS_INBOX_PATH,
        settings.STATEMENTS_ARCHIVE_PATH,
        settings.STATEMENTS_ERROR_PATH,
    ]:
        Path(path_str).mkdir(parents=True, exist_ok=True)

