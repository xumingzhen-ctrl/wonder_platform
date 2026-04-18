from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import Base, engine
import models  # 确保所有模型都被注册
from routers import auth, companies, clients, invoices, expenses, commissions, financials, compliance, hr, leases, fip_router
from config import settings, ensure_receipt_dirs, ensure_statement_dirs

# 创建所有数据表
Base.metadata.create_all(bind=engine)

# 确保所有文件夹存在
ensure_receipt_dirs()
ensure_statement_dirs()

app = FastAPI(
    title=settings.APP_NAME,
    description="香港小公司行政管理系統 API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(companies.router)
app.include_router(clients.router)
app.include_router(invoices.router)
app.include_router(expenses.router)
app.include_router(commissions.router)
app.include_router(financials.router)
app.include_router(compliance.router)
app.include_router(hr.router)
app.include_router(leases.router)
app.include_router(fip_router.router)

# 静态文件服务：收据归档
archive_path = Path(settings.RECEIPTS_ARCHIVE_PATH)
archive_path.mkdir(parents=True, exist_ok=True)
app.mount("/receipts", StaticFiles(directory=str(archive_path)), name="receipts")

# 静态文件服务：月结单归档
stmt_archive_path = Path(settings.STATEMENTS_ARCHIVE_PATH)
stmt_archive_path.mkdir(parents=True, exist_ok=True)
app.mount("/statements", StaticFiles(directory=str(stmt_archive_path)), name="statements")


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME}

