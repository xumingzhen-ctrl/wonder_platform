from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Depends
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
import sqlite3
import json
import logging
from datetime import datetime
from dotenv import load_dotenv

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "services", "fip"))

load_dotenv()
from services.fip.portfolio_engine import create_report, PortfolioEngine, DB_PATH, get_portfolio_historical_chart
from services.fip.data_provider import RealTime
from apscheduler.schedulers.background import BackgroundScheduler
from services.fip.price_updater import update_daily_prices
from services.fip.strategy_lab import PortfolioOptimizer
from services.fip.plugins.broker_sync import BrokerSyncPlugin
from services.fip.plugins.tx_sync import TxSync
from services.fip.broker_price_provider import BrokerPriceProvider
from services.fip.broker_file_parser import parse as parse_broker_file

from services.auth import get_current_user as get_sa_current_user
from models.company import UserRole

def get_current_user(user = Depends(get_sa_current_user)):
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "display_name": user.name,
        "is_active": user.is_active
    }

def require_role(role: str):
    def role_checker(user: dict = Depends(get_current_user)):
        if user["role"] != role and user["role"] != "admin":
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return role_checker

def require_admin():
    return require_role("admin")

def require_advisor():
    return require_role("advisor")

def require_premium():
    return require_role("premium")

def assert_advisor_owns_client(advisor_id, client_id):
    pass # To be implemented or bridged

def assert_portfolio_access(portfolio_id, user):
    pass # To be implemented or bridged

import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from fastapi import APIRouter

router = APIRouter(tags=["FIP"])

# ── Configure broker live price feeds from .env ───────────────────────────────
BrokerPriceProvider.configure(
    futu_host=os.getenv("FUTU_HOST", "127.0.0.1"),
    futu_port=int(os.getenv("FUTU_PORT", "11111")),
    ib_host=os.getenv("IB_HOST", "127.0.0.1"),
    ib_port=int(os.getenv("IB_PORT", "7497")),
    ib_client_id=int(os.getenv("IB_CLIENT_ID", "1")),
)
logger.info("BrokerPriceProvider configured (Futu → IB → yfinance priority chain).")

# Background Scheduler setup
scheduler = BackgroundScheduler()
scheduler.add_job(update_daily_prices, 'cron', hour=0, minute=5)
scheduler.start()
logger.info("Background scheduler started correctly.")

# app.add_middleware(CORSMiddleware)

class Allocation(BaseModel):
    isin: str
    weight: float

class NewPortfolioRequest(BaseModel):
    name: str
    budget: float
    allocations: Dict[str, float]
    date: Optional[str] = None
    manual_prices: Optional[Dict[str, float]] = None
    dividend_strategy: Optional[str] = "CASH"
    base_currency: Optional[str] = "USD"

class UpdatePortfolioRequest(BaseModel):
    name: Optional[str] = None
    dividend_strategy: Optional[str] = None
    target_allocations: Optional[Dict[str, float]] = None

class UpdateTransactionRequest(BaseModel):
    isin: Optional[str] = None
    shares: Optional[float] = None
    price: Optional[float] = None

class AddAssetRequest(BaseModel):
    isin: str
    weight: float
    shares: float
    price: float
    date: Optional[str] = None

class ManualDividendRequest(BaseModel):
    isin: str
    date: str
    amount_per_share: float
class InsurancePlanYear(BaseModel):
    year: int
    guaranteed_cv: float
    non_guaranteed: float
    withdrawal: float
    total_cv_base: float

class AnalyzeRequest(BaseModel):
    isins: List[str]
    days_back: Optional[int] = 1825
    max_weight: Optional[float] = 0.3
    risk_free_rate: Optional[float] = 0.04
    custom_weights: Optional[Dict[str, float]] = None
    mc_capital: Optional[float] = 1000000.0
    mc_contribution: Optional[float] = 0.0
    mc_contribution_start: Optional[int] = 1
    mc_contribution_years: Optional[int] = 100
    mc_withdrawal: Optional[float] = 0.0
    mc_withdrawal_start: Optional[int] = 1
    mc_withdrawal_end: Optional[int] = 100
    mc_withdrawal_inflation: Optional[bool] = False
    mc_years: Optional[int] = 10
    mc_target: Optional[float] = 2000000.0
    mc_stress: Optional[bool] = False
    mc_inflation: Optional[float] = 0.0
    insurance_plan: Optional[List[InsurancePlanYear]] = None
    insurance_alpha_low: Optional[float] = 0.80
    insurance_alpha_high: Optional[float] = 1.20
    insurance_label: Optional[str] = "储蓄分红险"

@router.post("/lab/insurance/parse")
async def parse_insurance_plan_endpoint(file: UploadFile = File(...)):
    """上传保险计划书 Excel，返回解析后的年度数据预览。"""
    from services.fip.insurance_parser import parse_insurance_plan
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")
    result = parse_insurance_plan(file_bytes, file.filename)
    if not result.get("ok"):
        raise HTTPException(status_code=422, detail=result.get("error", "Parse failed"))
    return result

@router.post("/lab/analyze")
def analyze_portfolio(req: AnalyzeRequest):
    """Strategy Lab: Analyze correlation and optimize portfolio."""
    optimizer = PortfolioOptimizer(risk_free_rate=req.risk_free_rate)
    result = optimizer.optimize(
        req.isins, 
        days_back=req.days_back, 
        max_weight=req.max_weight, 
        custom_weights=req.custom_weights,
        mc_settings={
            "capital": req.mc_capital,
            "contribution": req.mc_contribution,
            "contribution_start": req.mc_contribution_start,
            "contribution_years": req.mc_contribution_years,
            "withdrawal": req.mc_withdrawal,
            "withdrawal_start": req.mc_withdrawal_start,
            "withdrawal_end": req.mc_withdrawal_end,
            "withdrawal_inflation": req.mc_withdrawal_inflation,
            "years": req.mc_years,
            "target": req.mc_target,
            "stress": req.mc_stress,
            "inflation": req.mc_inflation,
            "insurance_plan": [y.dict() for y in req.insurance_plan] if req.insurance_plan else None,
            "insurance_alpha_low": req.insurance_alpha_low,
            "insurance_alpha_high": req.insurance_alpha_high,
            "insurance_label": req.insurance_label
        }
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


class ReportRequest(BaseModel):
    lab_result: dict   # 完整的 labData（前端已有）
    mc_settings: dict  # labMcSettings（capital, years, withdrawal...）
    client_info: Optional[dict] = None  # 客户信息（姓名、年龄、目标、顾问）

@router.post("/lab/generate-report")
def generate_report(req: ReportRequest):
    """生成蒙特卡洛分析 Word 报告，返回文件流供浏览器下载。"""
    try:
        from services.fip.report_generator import generate_mc_report
        buf = generate_mc_report(req.lab_result, req.mc_settings, req.client_info)
        filename = f"portfolio_mc_report_{datetime.now().strftime('%Y%m%d')}.docx"
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"}
        )
    except Exception as e:
        logger.error(f"Report generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))



# ══════════════════════════════════════════════════════════════════════════════
# Strategy Lab — Saved Scenarios CRUD
# ══════════════════════════════════════════════════════════════════════════════

class SaveScenarioRequest(BaseModel):
    name: str
    assets: List[str]                 # ['LQD','MOAT','IQLT']
    custom_weights: Dict[str, float]  # {'LQD': 0.4, ...}
    mc_settings: dict                 # labMcSettings from frontend
    summary: dict                     # key stats: sharpe, irr_p50, success_rate, etc.
    chart_data: list                  # monte_carlo.chart array (compact, ~50 rows)

@router.post("/lab/scenarios/save")
def save_scenario(req: SaveScenarioRequest):
    """Persist a completed Strategy Lab analysis snapshot to SQLite."""
    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO lab_scenarios (name, assets_json, weights_json, settings_json, summary_json, chart_json)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            req.name.strip(),
            json.dumps(req.assets, ensure_ascii=False),
            json.dumps(req.custom_weights, ensure_ascii=False),
            json.dumps(req.mc_settings, ensure_ascii=False),
            json.dumps(req.summary, ensure_ascii=False),
            json.dumps(req.chart_data, ensure_ascii=False),
        ))
        conn.commit()
        new_id = cursor.lastrowid
        return {"id": new_id, "name": req.name, "message": "方案已保存成功"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/lab/scenarios")
def list_scenarios():
    """Return a list of all saved scenarios (lightweight — no chart_json)."""
    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, name, created_at, assets_json, weights_json, summary_json
            FROM lab_scenarios ORDER BY created_at DESC
        ''')
        rows = cursor.fetchall()
        result = []
        for row in rows:
            result.append({
                "id": row[0],
                "name": row[1],
                "created_at": row[2],
                "assets": json.loads(row[3]),
                "weights": json.loads(row[4]),
                "summary": json.loads(row[5]),
            })
        return result
    finally:
        conn.close()

@router.get("/lab/scenarios/{scenario_id}")
def load_scenario(scenario_id: int):
    """Load the full data for a single saved scenario (including chart_json)."""
    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, name, created_at, assets_json, weights_json, settings_json, summary_json, chart_json
            FROM lab_scenarios WHERE id = ?
        ''', (scenario_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Scenario not found")
        return {
            "id": row[0],
            "name": row[1],
            "created_at": row[2],
            "assets": json.loads(row[3]),
            "weights": json.loads(row[4]),
            "mc_settings": json.loads(row[5]),
            "summary": json.loads(row[6]),
            "chart_data": json.loads(row[7]),
        }
    finally:
        conn.close()

@router.delete("/lab/scenarios/{scenario_id}")
def delete_scenario(scenario_id: int):
    """Delete a saved scenario by ID."""
    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM lab_scenarios WHERE id = ?", (scenario_id,))
        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Scenario not found")
        return {"message": "方案已删除"}
    finally:
        conn.close()


@router.get("/portfolios")
def list_portfolios(request: Request):
    """
    获取组合列表，根据角色过滤可见性：
    - admin / advisor：返回所有组合
    - premium / free / 未登录：只返回 is_public=1 的公开组合
    """
    from services.auth import get_optional_user
    user = get_optional_user(request)
    role = user.role if user else None

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    if role in ("admin", "advisor"):
        cursor.execute("SELECT id, name, created_at, dividend_strategy, is_public FROM portfolios ORDER BY id")
    else:
        cursor.execute("SELECT id, name, created_at, dividend_strategy, is_public FROM portfolios WHERE is_public=1 ORDER BY id")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@router.post("/portfolios/new")
def create_portfolio(req: NewPortfolioRequest):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # Normalize currency code to uppercase (e.g. 'jpy' -> 'JPY')
    base_currency = (req.base_currency or "USD").upper().strip()
    try:
        cursor.execute(
            "INSERT INTO portfolios (name, created_at, dividend_strategy, target_allocations, base_currency) VALUES (?, ?, ?, ?, ?)",
            (req.name, req.date or datetime.now().strftime("%Y-%m-%d %H:%M:%S"), req.dividend_strategy, json.dumps(req.allocations), base_currency)
        )
        portfolio_id = cursor.lastrowid
        
        date_str = req.date or datetime.now().strftime("%Y-%m-%d")
        
        # 1. First, insert the initial capital using the selected base currency
        cash_isin = f"CASH_{base_currency}"
        cursor.execute(
            "INSERT INTO transactions (portfolio_id, date, isin, type, shares, price) VALUES (?, ?, ?, ?, ?, ?)",
            (portfolio_id, date_str, cash_isin, "CASH_IN", 1.0, float(req.budget))
        )
        
        # 2. Then, insert the BUY transactions with multi-tier price resolution
        skipped = []
        for isin, weight in req.allocations.items():
            price = 0
            price_source = None
            
            # Tier 1: Manual price (user-supplied)
            if req.manual_prices and isin in req.manual_prices:
                price = req.manual_prices[isin]
                price_source = "manual"
            
            # Tier 2: Historical price on target date
            if price <= 0:
                try:
                    price = RealTime.get_historical_price(isin, date_str)
                    if price > 0:
                        price_source = "historical"
                except Exception:
                    pass
            
            # Tier 3: Stooq CSV lookup for the target date
            if price <= 0:
                try:
                    stooq_data = RealTime._fetch_stooq_historical(isin)
                    if stooq_data:
                        # Find the closest date on or before date_str
                        valid_dates = [d for d in sorted(stooq_data.keys()) if d <= date_str]
                        if valid_dates:
                            price = stooq_data[valid_dates[-1]]
                            price_source = "stooq"
                except Exception:
                    pass
            
            # Tier 4: Current realtime price as last resort
            if price <= 0:
                try:
                    market_data = RealTime.get_market_data(isin)
                    if market_data and market_data.get("price", 0) > 0:
                        price = market_data["price"]
                        price_source = "realtime"
                except Exception:
                    pass
            
            if price > 0:
                shares = int((req.budget * weight) / price)
                if shares > 0:
                    cursor.execute(
                        "INSERT INTO transactions (portfolio_id, date, isin, type, shares, price) VALUES (?, ?, ?, ?, ?, ?)",
                        (portfolio_id, date_str, isin, "BUY", shares, price)
                    )
                    logger.info(f"Portfolio {portfolio_id}: BUY {shares} x {isin} @ {price:.4f} (source: {price_source})")
            else:
                skipped.append(isin)
                logger.warning(f"Portfolio {portfolio_id}: SKIPPED {isin} — no price found from any source")
        
        conn.commit()
        
        # Trigger an auto FX sweep on initial build to offset any negative foreign cash wallets
        from services.fip.portfolio_engine import PortfolioEngine
        engine = PortfolioEngine(portfolio_id)
        engine._auto_fx_sweep(date_str)
        
        result = {"status": "success", "portfolio_id": portfolio_id}
        if skipped:
            result["warning"] = f"Could not buy: {', '.join(skipped)} (no price data found)"
            result["skipped_isins"] = skipped
        return result
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@router.put("/portfolios/{id}")
def update_portfolio(id: int, req: UpdatePortfolioRequest):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    if req.name:
        cursor.execute("UPDATE portfolios SET name = ? WHERE id = ?", (req.name, id))
    if req.dividend_strategy:
        cursor.execute("UPDATE portfolios SET dividend_strategy = ? WHERE id = ?", (req.dividend_strategy, id))
    if req.target_allocations is not None:
        cursor.execute("UPDATE portfolios SET target_allocations = ? WHERE id = ?", (json.dumps(req.target_allocations), id))
    conn.commit()
    conn.close()
    return {"status": "success"}

@router.get("/portfolios/transactions/{id}")
def get_portfolio_transactions(id: int):
    """Get all transactions for portfolio composition management."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    # Get target allocations
    cursor.execute("SELECT target_allocations FROM portfolios WHERE id = ?", (id,))
    row = cursor.fetchone()
    target_allocations = json.loads(row['target_allocations']) if row and row['target_allocations'] else {}
    # Get all BUY/SELL transactions (not CASH)
    cursor.execute(
        "SELECT id, date, isin, type, shares, price FROM transactions WHERE portfolio_id = ? AND isin NOT LIKE 'CASH_%' ORDER BY date, isin",
        (id,)
    )
    txs = [dict(r) for r in cursor.fetchall()]
    # Enrich with asset names via cache
    for tx in txs:
        try:
            md = RealTime.get_market_data(tx['isin'])
            tx['name'] = md.get('name', tx['isin'])
        except:
            tx['name'] = tx['isin']
        tx['target_weight'] = target_allocations.get(tx['isin'], 0)
    conn.close()
    return {"transactions": txs, "target_allocations": target_allocations}

@router.put("/portfolios/transactions/{tx_id}")
def update_transaction(tx_id: int, req: UpdateTransactionRequest):
    """Update a specific transaction's ISIN, shares, or price."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    updates = []
    params = []
    if req.isin is not None:
        updates.append("isin = ?")
        params.append(req.isin)
    if req.shares is not None:
        updates.append("shares = ?")
        params.append(req.shares)
    if req.price is not None:
        updates.append("price = ?")
        params.append(req.price)
    if updates:
        params.append(tx_id)
        cursor.execute(f"UPDATE transactions SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return {"status": "success"}

@router.post("/portfolios/transactions/{portfolio_id}")
def add_transaction(portfolio_id: int, req: AddAssetRequest):
    """Add a new asset (BUY transaction) to an existing portfolio."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    date_str = req.date or datetime.now().strftime("%Y-%m-%d")
    cursor.execute(
        "INSERT INTO transactions (portfolio_id, date, isin, type, shares, price) VALUES (?, ?, ?, 'BUY', ?, ?)",
        (portfolio_id, date_str, req.isin, req.shares, req.price)
    )
    # Update target_allocations
    cursor.execute("SELECT target_allocations FROM portfolios WHERE id = ?", (portfolio_id,))
    row = cursor.fetchone()
    ta = json.loads(row[0]) if row and row[0] else {}
    ta[req.isin] = req.weight
    cursor.execute("UPDATE portfolios SET target_allocations = ? WHERE id = ?", (json.dumps(ta), portfolio_id))
    conn.commit()
    conn.close()
    return {"status": "success"}

@router.delete("/portfolios/transactions/{tx_id}")
def delete_transaction(tx_id: int):
    """Delete a specific transaction."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM transactions WHERE id = ?", (tx_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}

@router.delete("/portfolios/{id}")
def delete_portfolio(id: int):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM transactions WHERE portfolio_id = ?", (id,))
    cursor.execute("DELETE FROM manual_dividends WHERE portfolio_id = ?", (id,))
    cursor.execute("DELETE FROM portfolio_stats_cache WHERE portfolio_id = ?", (id,))
    cursor.execute("DELETE FROM portfolio_history WHERE portfolio_id = ?", (id,))
    cursor.execute("DELETE FROM broker_trades WHERE portfolio_id = ?", (id,))
    cursor.execute("DELETE FROM sync_metadata WHERE portfolio_id = ?", (id,))
    cursor.execute("DELETE FROM portfolios WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return {"status": "success"}

class RebalanceExecuteRequest(BaseModel):
    as_of_date: Optional[str] = None  # ISO date e.g. '2024-01-01'; None = today

@router.get("/portfolios/rebalance/preview/{id}")
def get_rebalance_preview(id: int, as_of_date: Optional[str] = None):
    try:
        engine = PortfolioEngine(id)
        return engine.get_rebalance_preview(as_of_date=as_of_date)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/portfolios/rebalance/{id}")
def trigger_rebalance(id: int, req: RebalanceExecuteRequest = None):
    try:
        engine = PortfolioEngine(id)
        as_of_date = req.as_of_date if req else None
        engine.rebalance(as_of_date=as_of_date)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/portfolios/rebalance/undo/{id}")
def undo_latest_transactions(id: int):
    """
    Finds the latest transaction date for the portfolio and deletes all transactions
    on that date. This effectively acts as an 'Undo Rebalance' or 'Undo Latest Batch'.
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 1. Find the latest date
        cursor.execute("SELECT MAX(date) FROM transactions WHERE portfolio_id = ?", (id,))
        row = cursor.fetchone()
        latest_date = row[0] if row else None
        
        if not latest_date:
            conn.close()
            return {"status": "error", "message": "No transactions found to undo."}
            
        # 2. Delete all transactions on that exact date
        cursor.execute("DELETE FROM transactions WHERE portfolio_id = ? AND date = ?", (id, latest_date))
        conn.commit()
        conn.close()
        
        # 3. Clean cache
        try:
            PortfolioEngine(id) # Reloading the engine will rebuild its internal caches based on the remaining transactions
        except Exception as e:
            pass
            
        return {"status": "success", "message": f"Successfully reverted all trades on {latest_date}."}
    except Exception as e:
        logger.error(f"Error in undo_latest_transactions: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/portfolios/dividend/manual/{id}")
def add_manual_dividend(id: int, req: ManualDividendRequest):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO manual_dividends (portfolio_id, isin, date, amount_per_share) VALUES (?, ?, ?, ?)",
        (id, req.isin, req.date, req.amount_per_share)
    )
    conn.commit()
    conn.close()
    return {"status": "success"}

@router.delete("/dividends/manual/{div_id}")
def delete_manual_dividend(div_id: int):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM manual_dividends WHERE id = ?", (div_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}

@router.get("/portfolios/dividends/export/{id}")
def export_dividends(id: int):
    try:
        engine = PortfolioEngine(id)
        dividends_list, _ = engine.get_dividend_details()
        return dividends_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/portfolios/dividends/projections/{id}")
def get_dividend_projections(id: int, tax_rate: float = 0.0, drip: bool = False):
    """Get dividend projections, YOC, and current yield for a portfolio."""
    try:
        engine = PortfolioEngine(id)
        return engine.get_dividend_projections(tax_rate=tax_rate, drip=drip)
    except Exception as e:
        logger.error(f"Error in dividend projections: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/report/{portfolio_id}")
def get_report(portfolio_id: int):
    try:
        return create_report(portfolio_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/report/history/{portfolio_id}")
def get_historical_chart(portfolio_id: int):
    try:
        return get_portfolio_historical_chart(portfolio_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/trigger_update")
def trigger_update():
    try:
        update_daily_prices()
        return {"status": "success", "message": "Manual update triggered and completed."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SyncIBRequest(BaseModel):
    host: str = "127.0.0.1"
    port: int = 7497
    client_id: int = 101

class SyncFutuRequest(BaseModel):
    host: str = "127.0.0.1"
    port: int = 11111

@router.post("/sync/ib")
def sync_ib_func(req: SyncIBRequest):
    plugin = BrokerSyncPlugin()
    data = plugin.sync_ib(req.host, req.port, req.client_id)
    if "error" in data:
        raise HTTPException(status_code=400, detail=data["error"])
    
    # data format: {"accounts": [{"account": "...", "cash": ..., "positions": [...]}, ...]}
    sync_results = []
    for acc in data['accounts']:
        portfolio_name = f"IB Sync {acc['account']}"
        res = _process_sync_data(portfolio_name, acc)
        sync_results.append(res)
    
    return {"status": "success", "count": len(sync_results), "portfolios": sync_results}

@router.post("/sync/futu")
def sync_futu_func(req: SyncFutuRequest):
    plugin = BrokerSyncPlugin()
    data = plugin.sync_futu(req.host, req.port)
    if "error" in data:
        raise HTTPException(status_code=400, detail=data["error"])
    
    sync_results = []
    for acc in data['accounts']:
        portfolio_name = f"Futu Sync {acc['account']}"
        res = _process_sync_data(portfolio_name, acc)
        sync_results.append(res)
        
    return {"status": "success", "count": len(sync_results), "portfolios": sync_results}

def _process_sync_data(portfolio_name, data):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        # Check if portfolio exists, else create
        cursor.execute("SELECT id FROM portfolios WHERE name = ?", (portfolio_name,))
        row = cursor.fetchone()
        if row:
            portfolio_id = row[0]
            # Clear old transactions for this sync portfolio to 'reset' state
            cursor.execute("DELETE FROM transactions WHERE portfolio_id = ?", (portfolio_id,))
        else:
            cursor.execute("INSERT INTO portfolios (name, created_at) VALUES (?, ?)", 
                           (portfolio_name, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
            portfolio_id = cursor.lastrowid
        
        date_str = datetime.now().strftime("%Y-%m-%d")
        
        # 0. Inflate Cash Balances with Position Costs to avoid negative wallets on BUY simulated sync
        cash_balances = data.get('cash_balances', {})
        from services.fip.data_provider import RealTimeProvider
        rt = RealTimeProvider()
        for pos in data.get('positions', []):
            currency = rt.guess_currency_from_isin(pos['symbol'])
            pos_cost = pos['shares'] * pos['avg_cost']
            cash_balances[currency] = cash_balances.get(currency, 0.0) + pos_cost
        
        # 1. Insert Cash Balances (Multi-Currency)
        for currency, amount in cash_balances.items():
            if amount != 0:
                cursor.execute(
                    "INSERT INTO transactions (portfolio_id, date, isin, type, shares, price) VALUES (?, ?, ?, ?, ?, ?)",
                    (portfolio_id, date_str, f"CASH_{currency.upper()}", "CASH_IN", 1.0, float(amount))
                )
        
        # 2. Insert Positions
        ta = {}
        for pos in data['positions']:
            cursor.execute(
                "INSERT INTO transactions (portfolio_id, date, isin, type, shares, price) VALUES (?, ?, ?, ?, ?, ?)",
                (portfolio_id, date_str, pos['symbol'], "BUY", pos['shares'], pos['avg_cost'])
            )
            # 3. Aggressive Offline Pricing Failsafe
            # Save the EXACT live broker price snapshot into price_cache to completely bypass yfinance if needed!
            if 'current_price' in pos and pos['current_price'] > 0:
                cursor.execute(
                    "INSERT OR REPLACE INTO price_cache (isin, date, price) VALUES (?, ?, ?)",
                    (pos['symbol'], datetime.now().strftime("%Y-%m-%d %H:%M:%S"), float(pos['current_price']))
                )
            # We don't have target weights from sync, so just setting it dummy 1.0/N 
            # Or just leave target_allocations empty if user didn't specify.
            # Usually sync portfolios are 'monitored' not 'target-rebalanced'
        
        conn.commit()
        return {"status": "success", "portfolio_id": portfolio_id, "name": portfolio_name}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ── Heartbeat: Ultra-fast NAV poll (returns cached value, no external calls) ──
@router.get("/heartbeat/{portfolio_id}")
def heartbeat(portfolio_id: int):
    """
    Returns the last-cached NAV and cash in milliseconds.
    Frontend polls this every 10s and only triggers a full /report reload
    if NAV has changed >0.1% or last_updated is older than 5 minutes.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT total_nav, wallet_balance, last_updated FROM portfolio_stats_cache WHERE portfolio_id = ?",
            (portfolio_id,)
        )
        row = cursor.fetchone()
        if row:
            return {
                "portfolio_id": portfolio_id,
                "total_nav": row[0],
                "wallet_balance": row[1],
                "last_updated": row[2],
                "cache_hit": True
            }
        # No cache yet — return zeros, let frontend trigger full load
        return {
            "portfolio_id": portfolio_id,
            "total_nav": 0,
            "wallet_balance": 0,
            "last_updated": None,
            "cache_hit": False
        }
    finally:
        conn.close()


# ── Transaction Sync Endpoints ─────────────────────────────────────────────────

class TxSyncFutuRequest(BaseModel):
    host: str = "127.0.0.1"
    port: int = 11111
    days: int = 90  # Max Futu history

class TxSyncIBRequest(BaseModel):
    host: str = "127.0.0.1"
    port: int = 7497
    client_id: int = 101
    account_id: Optional[str] = None


@router.post("/sync/futu/transactions")
def sync_futu_transactions(req: TxSyncFutuRequest):
    """
    Transaction History Sync for Futu.
    Pulls last N days of trade history and rebuilds ledger using WAC.
    Commission is included in cost basis.
    """
    syncer = TxSync(portfolio_id=0)  # portfolio_id resolved inside
    result = syncer.sync_futu_transactions(host=req.host, port=req.port, days=req.days)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/sync/ib/transactions")
def sync_ib_transactions(req: TxSyncIBRequest):
    """
    Transaction History Sync for IB.
    Uses ib_insync fills() (today's executions). Full history requires IB Flex Query.
    """
    syncer = TxSync(portfolio_id=0)
    result = syncer.sync_ib_transactions(
        host=req.host, port=req.port,
        client_id=req.client_id, account_id=req.account_id
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


# ── Broker File / Screenshot Import ────────────────────────────────────────────

class ImportConfirmRequest(BaseModel):
    portfolio_name: str
    positions: List[Dict]
    date: Optional[str] = None


@router.post("/import/broker-file")
async def import_broker_files(files: List[UploadFile] = File(...)):
    """
    Step 1: Upload CSV(s) / PDF(s) / Screenshot(s).
    Parses the files and returns a preview of detected positions.
    Does NOT write to the database.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    max_size = 10 * 1024 * 1024  # 10 MB per file
    all_positions = []
    sources = set()
    errors = []

    for file in files:
        if not file.filename:
            continue
        
        file_bytes = await file.read()
        if len(file_bytes) > max_size:
            errors.append(f"{file.filename}: File too large (max 10MB)")
            continue

        logger.info(f"Import file received: {file.filename} ({len(file_bytes)} bytes)")
        result = parse_broker_file(file_bytes, file.filename)

        if result.get('error'):
            errors.append(f"{file.filename}: {result['error']}")
        elif result.get('positions'):
            all_positions.extend(result['positions'])
            sources.add(result.get('source', 'unknown'))

    if not all_positions and errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))

    # Optional: Consolidate same symbol from multiple files
    merged_positions = {}
    for pos in all_positions:
        sym = pos['symbol']
        if sym in merged_positions:
            old = merged_positions[sym]
            total_shares = old['shares'] + pos['shares']
            if total_shares > 0:
                avg_cost = ((old['shares'] * old['avg_cost']) + (pos['shares'] * pos['avg_cost'])) / total_shares
                merged_positions[sym]['shares'] = total_shares
                merged_positions[sym]['avg_cost'] = avg_cost
        else:
            merged_positions[sym] = pos

    final_positions = list(merged_positions.values())
    
    return {
        "positions": final_positions,
        "source": ", ".join(sources) if sources else "unknown",
        "count": len(final_positions),
        "errors": errors
    }


@router.post("/import/broker-file/confirm")
def import_confirm(req: ImportConfirmRequest):
    """
    Step 2: Confirm the previewed positions and create a portfolio.
    Writes portfolios + transactions to the DB.
    """
    if not req.positions:
        raise HTTPException(status_code=400, detail="No positions to import")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        date_str = req.date or datetime.now().strftime("%Y-%m-%d")

        # Create portfolio
        cursor.execute(
            "INSERT INTO portfolios (name, created_at, dividend_strategy) VALUES (?, ?, ?)",
            (req.portfolio_name, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), 'CASH')
        )
        portfolio_id = cursor.lastrowid

        # Calculate total value for CASH_IN and target allocations
        total_value = sum(p['shares'] * p.get('avg_cost', 0) for p in req.positions)
        target_allocs = {}

        # Insert cash (total portfolio value = sum of position costs)
        if total_value > 0:
            # Group cash by currency
            cash_by_ccy = {}
            for pos in req.positions:
                ccy = pos.get('currency', 'USD')
                pos_value = pos['shares'] * pos.get('avg_cost', 0)
                cash_by_ccy[ccy] = cash_by_ccy.get(ccy, 0) + pos_value

            for ccy, amount in cash_by_ccy.items():
                cursor.execute(
                    "INSERT INTO transactions (portfolio_id, date, isin, type, shares, price) VALUES (?, ?, ?, ?, ?, ?)",
                    (portfolio_id, date_str, f"CASH_{ccy}", "CASH_IN", 1.0, float(amount))
                )

        # Insert BUY transactions
        for pos in req.positions:
            symbol = pos['symbol']
            shares = float(pos['shares'])
            avg_cost = float(pos.get('avg_cost', 0))

            if shares > 0 and avg_cost > 0:
                cursor.execute(
                    "INSERT INTO transactions (portfolio_id, date, isin, type, shares, price) VALUES (?, ?, ?, ?, ?, ?)",
                    (portfolio_id, date_str, symbol, "BUY", shares, avg_cost)
                )
                logger.info(f"Import portfolio {portfolio_id}: BUY {shares} x {symbol} @ {avg_cost}")

            # Target allocation = position value / total value
            pos_value = shares * avg_cost
            if total_value > 0:
                target_allocs[symbol] = round(pos_value / total_value, 4)

        # Save target allocations
        cursor.execute(
            "UPDATE portfolios SET target_allocations = ? WHERE id = ?",
            (json.dumps(target_allocs), portfolio_id)
        )

        conn.commit()
        logger.info(f"Import complete: portfolio_id={portfolio_id}, {len(req.positions)} positions")
        return {"status": "success", "portfolio_id": portfolio_id}

    except Exception as e:
        conn.rollback()
        logger.error(f"Import confirm error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()




if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


# ══════════════════════════════════════════════════════════════════════════════
# ██  AUTH  ── 注册 / 登录 / 个人信息
# ══════════════════════════════════════════════════════════════════════════════

class RegisterRequest(BaseModel):
    email: str
    password: str
    display_name: Optional[str] = None
    invited_by_advisor_id: Optional[int] = None  # 注册时绑定顾问

class LoginRequest(BaseModel):
    email: str
    password: str

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

class UpdateProfileRequest(BaseModel):
    display_name: Optional[str] = None

@router.post("/auth/register", tags=["auth"])
def register(req: RegisterRequest):
    """新用户注册（默认角色: free；若绑定顾问则自动升级为 premium）"""
    email = req.email.lower().strip()
    if len(req.password) < 6:
        raise HTTPException(400, "密码至少需要6个字符")
    if _get_user_by_email(email):
        raise HTTPException(400, "该邮箱已被注册")

    # 若指定了顾问 ID，验证顾问存在且角色正确
    advisor_ok = False
    if req.invited_by_advisor_id:
        conn_check = sqlite3.connect(DB_PATH)
        try:
            adv = conn_check.execute(
                "SELECT id, role FROM users WHERE id=? AND is_active=1",
                (req.invited_by_advisor_id,)
            ).fetchone()
            advisor_ok = bool(adv and adv[1] in ("advisor", "admin"))
        finally:
            conn_check.close()
        if not advisor_ok:
            raise HTTPException(400, "所选顾问不存在或无效")

    initial_role = "premium" if advisor_ok else "free"
    display = req.display_name or email.split("@")[0]

    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            "INSERT INTO users (email, password_hash, display_name, role) VALUES (?,?,?,?)",
            (email, hash_password(req.password), display, initial_role)
        )
        conn.commit()
        user_id = conn.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()[0]

        # 建立顾问-客户关系
        if advisor_ok and req.invited_by_advisor_id:
            conn.execute(
                "INSERT OR REPLACE INTO advisor_clients (advisor_id, client_id, assigned_by, is_active) VALUES (?,?,?,1)",
                (req.invited_by_advisor_id, user_id, req.invited_by_advisor_id)
            )
            conn.commit()

        token = create_access_token(user_id, email, initial_role, display)
        return {"token": token, "role": initial_role, "display_name": display, "user_id": user_id}
    finally:
        conn.close()

@router.post("/auth/login", tags=["auth"])
def login(req: LoginRequest):
    """邮件 + 密码登录，返回 JWT Token"""
    email = req.email.lower().strip()
    user = _get_user_by_email(email)
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "邮箱或密码错误")
    if not user["is_active"]:
        raise HTTPException(403, "账号已被停用，请联系管理员")
    # 更新最后登录时间
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("UPDATE users SET last_login_at=? WHERE id=?", (datetime.now().isoformat(), user["id"]))
        conn.commit()
    finally:
        conn.close()
    token = create_access_token(user["id"], email, user["role"], user["display_name"])
    return {"token": token, "role": user["role"], "display_name": user["display_name"], "user_id": user["id"]}

@router.get("/auth/me", tags=["auth"])
def get_me(user: dict = Depends(get_current_user)):
    """获取当前登录用户信息"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            "SELECT id, email, display_name, role, created_at, last_login_at FROM users WHERE id=?",
            (user["id"],)
        ).fetchone()
        me = dict(row)
        # 如果是 premium，附带顾问信息
        if user["role"] == "premium":
            rel = conn.execute(
                """SELECT u.id, u.display_name, u.email
                   FROM advisor_clients ac JOIN users u ON u.id=ac.advisor_id
                   WHERE ac.client_id=? AND ac.is_active=1 LIMIT 1""",
                (user["id"],)
            ).fetchone()
            me["advisor"] = dict(rel) if rel else None
        return me
    finally:
        conn.close()

@router.get("/auth/advisors", tags=["auth"])
def list_advisors():
    """公开接口：获取所有顾问列表（用于注册时选择顾问）"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            "SELECT id, display_name, email FROM users WHERE role IN ('advisor','admin') AND is_active=1 ORDER BY display_name"
        ).fetchall()
        return [{"id": r["id"], "display_name": r["display_name"], "email": r["email"]} for r in rows]
    finally:
        conn.close()

@router.put("/auth/me/profile", tags=["auth"])
def update_profile(req: UpdateProfileRequest, user: dict = Depends(get_current_user)):
    """更新个人资料"""
    conn = sqlite3.connect(DB_PATH)
    try:
        if req.display_name:
            conn.execute("UPDATE users SET display_name=? WHERE id=?", (req.display_name, user["id"]))
        conn.commit()
        return {"status": "success"}
    finally:
        conn.close()

@router.post("/auth/me/change-password", tags=["auth"])
def change_password(req: ChangePasswordRequest, user: dict = Depends(get_current_user)):
    """修改密码"""
    full_user = _get_user_by_email(user["email"])
    if not verify_password(req.old_password, full_user["password_hash"]):
        raise HTTPException(400, "原密码错误")
    if len(req.new_password) < 6:
        raise HTTPException(400, "新密码至少需要6个字符")
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("UPDATE users SET password_hash=? WHERE id=?", (hash_password(req.new_password), user["id"]))
        conn.commit()
        return {"status": "success", "message": "密码已更新"}
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# ██  ADMIN  ── 用户管理（仅管理员）
# ══════════════════════════════════════════════════════════════════════════════

class UpdateUserRoleRequest(BaseModel):
    role: str  # admin | advisor | premium | free

class UpdateUserStatusRequest(BaseModel):
    is_active: bool

class UpdateUserNotesRequest(BaseModel):
    notes: str

class CreateAdvisorClientRequest(BaseModel):
    advisor_id: int
    client_id: int

@router.get("/admin/users", tags=["admin"], dependencies=[Depends(require_role("admin"))])
def admin_list_users(role: Optional[str] = None, page: int = 1, per_page: int = 20):
    """管理员：获取所有用户列表（支持角色过滤 + 分页）"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        base_sql = "SELECT id, email, name, role, is_active, created_at FROM users"
        params = []
        if role:
            base_sql += " WHERE role=?"
            params.append(role)
        base_sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params += [per_page, (page - 1) * per_page]
        rows = conn.execute(base_sql, params).fetchall()
        users = []
        for r in rows:
            u = dict(r)
            # 附带顾问信息（若为 premium 用户）
            if u["role"] == "premium":
                rel = conn.execute(
                    """SELECT u2.id, u2.name as display_name FROM advisor_clients ac
                       JOIN users u2 ON u2.id=ac.advisor_id
                       WHERE ac.client_id=? AND ac.is_active=1 LIMIT 1""",
                    (u["id"],)
                ).fetchone()
                u["advisor"] = dict(rel) if rel else None
            users.append(u)
        total = conn.execute("SELECT COUNT(*) FROM users" + (" WHERE role=?" if role else ""),
                             ([role] if role else [])).fetchone()[0]
        return {"users": users, "total": total, "page": page, "per_page": per_page}
    finally:
        conn.close()

@router.put("/admin/users/{user_id}/role", tags=["admin"], dependencies=[Depends(require_role("admin"))])
def admin_update_role(user_id: str, req: UpdateUserRoleRequest):
    """管理员：修改用户角色"""
    ROLES = ["admin", "advisor", "premium", "free"]
    if req.role not in ROLES:
        raise HTTPException(400, f"无效角色，可选：{ROLES}")
    conn = sqlite3.connect(DB_PATH)
    try:
        result = conn.execute("UPDATE users SET role=? WHERE id=?", (req.role, user_id))
        if result.rowcount == 0:
            raise HTTPException(404, "用户不存在")
        conn.commit()
        return {"status": "success", "user_id": user_id, "new_role": req.role}
    finally:
        conn.close()

@router.put("/admin/users/{user_id}/status", tags=["admin"], dependencies=[Depends(require_role("admin"))])
def admin_update_status(user_id: str, req: UpdateUserStatusRequest):
    """管理员：激活或封禁用户账号"""
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("UPDATE users SET is_active=? WHERE id=?", (1 if req.is_active else 0, user_id))
        conn.commit()
        return {"status": "success", "user_id": user_id, "is_active": req.is_active}
    finally:
        conn.close()

@router.put("/admin/users/{user_id}/notes", tags=["admin"], dependencies=[Depends(require_role("admin"))])
def admin_update_notes(user_id: int, req: UpdateUserNotesRequest):
    """管理员：更新用户备注（暂存在内存，表中无 notes 字段时直接返回成功）"""
    # users 表目前没有 notes 字段，晨2组备注先返回成功
    return {"status": "success", "note": "notes 字段尚未实现到 DB"}

@router.delete("/admin/users/{user_id}", tags=["admin"], dependencies=[Depends(require_role("admin"))])
def admin_delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """管理员：删除用户（不能删除自己）"""
    if user_id == current_user["id"]:
        raise HTTPException(400, "不能删除自己的账号")
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("DELETE FROM advisor_clients WHERE advisor_id=? OR client_id=?", (user_id, user_id))
        result = conn.execute("DELETE FROM users WHERE id=?", (user_id,))
        if result.rowcount == 0:
            raise HTTPException(404, "用户不存在")
        conn.commit()
        return {"status": "success"}
    finally:
        conn.close()

@router.get("/admin/advisor-clients", tags=["admin"], dependencies=[Depends(require_role("admin"))])
def admin_list_advisor_clients():
    """管理员：查看所有顾问-客户关系"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute("""
            SELECT ac.id, ac.assigned_at, ac.is_active,
                   a.id as advisor_id, a.name as advisor_name, a.email as advisor_email,
                   c.id as client_id, c.name as client_name, c.email as client_email
            FROM advisor_clients ac
            JOIN users a ON a.id=ac.advisor_id
            JOIN users c ON c.id=ac.client_id
            ORDER BY ac.assigned_at DESC
        """).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@router.post("/admin/advisor-clients", tags=["admin"], dependencies=[Depends(require_role("admin"))])
def admin_assign_advisor_client(req: CreateAdvisorClientRequest, admin: dict = Depends(get_current_user)):
    """管理员：建立顾问-客户关系"""
    conn = sqlite3.connect(DB_PATH)
    try:
        # 验证两个用户存在且角色正确
        advisor = conn.execute("SELECT role FROM users WHERE id=?", (req.advisor_id,)).fetchone()
        client = conn.execute("SELECT role FROM users WHERE id=?", (req.client_id,)).fetchone()
        if not advisor or advisor[0] not in ("advisor", "admin"):
            raise HTTPException(400, "顾问用户不存在或角色不正确")
        if not client:
            raise HTTPException(400, "客户用户不存在")
        conn.execute(
            "INSERT OR REPLACE INTO advisor_clients (advisor_id, client_id, assigned_by, is_active) VALUES (?,?,?,1)",
            (req.advisor_id, req.client_id, admin["id"])
        )
        conn.commit()
        return {"status": "success", "message": "顾问-客户关系建立成功"}
    finally:
        conn.close()

@router.delete("/admin/advisor-clients/{relation_id}", tags=["admin"], dependencies=[Depends(require_role("admin"))])
def admin_remove_advisor_client(relation_id: int):
    """管理员：解除顾问-客户关系"""
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("UPDATE advisor_clients SET is_active=0 WHERE id=?", (relation_id,))
        conn.commit()
        return {"status": "success"}
    finally:
        conn.close()

@router.get("/admin/stats", tags=["admin"], dependencies=[Depends(require_role("admin"))])
def admin_stats():
    """管理员：系统统计概览"""
    conn = sqlite3.connect(DB_PATH)
    try:
        users_by_role = {}
        for role in ["admin", "advisor", "premium", "free"]:
            count = conn.execute("SELECT COUNT(*) FROM users WHERE role=?", (role,)).fetchone()[0]
            users_by_role[role] = count
        total_portfolios = conn.execute("SELECT COUNT(*) FROM portfolios").fetchone()[0]
        total_scenarios = conn.execute("SELECT COUNT(*) FROM lab_scenarios").fetchone()[0]
        total_insurance = conn.execute("SELECT COUNT(*) FROM insurance_plans").fetchone()[0]
        return {
            "users_total": sum(users_by_role.values()),
            "users_by_role": users_by_role,
            "portfolios": total_portfolios,
            "lab_scenarios": total_scenarios,
            "insurance_plans": total_insurance,
        }
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# ██  ADVISOR  ── 客户管理 + 保险方案管理（顾问及以上）
# ══════════════════════════════════════════════════════════════════════════════

class CreateInsurancePlanRequest(BaseModel):
    name: str
    client_id: Optional[int] = None
    plan_data: dict          # 解析后的保险数据（行年度数组）
    excel_filename: Optional[str] = None
    is_template: bool = False

class UpdateInsurancePlanRequest(BaseModel):
    name: Optional[str] = None
    client_id: Optional[int] = None
    is_template: Optional[bool] = None

@router.get("/advisor/clients", tags=["advisor"])
def advisor_list_clients(user: dict = Depends(require_role("advisor"))):
    """顾问：获取我的客户列表"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute("""
            SELECT u.id, u.email, u.name as display_name, u.last_login_at, ac.assigned_at,
                   (SELECT COUNT(*) FROM portfolios WHERE user_id=u.id) as portfolio_count,
                   (SELECT COUNT(*) FROM insurance_plans WHERE client_id=u.id AND advisor_id=?) as insurance_count
            FROM advisor_clients ac JOIN users u ON u.id=ac.client_id
            WHERE ac.advisor_id=? AND ac.is_active=1
            ORDER BY ac.assigned_at DESC
        """, (user["id"], user["id"])).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@router.get("/advisor/clients/{client_id}/portfolios", tags=["advisor"])
def advisor_get_client_portfolios(client_id: int, user: dict = Depends(require_role("advisor"))):
    """顾问：查看指定客户的所有组合"""
    if user["role"] != "admin":
        assert_advisor_owns_client(user["id"], client_id)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            "SELECT id, name, created_at, base_currency, dividend_strategy FROM portfolios WHERE user_id=?",
            (client_id,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

# ── 保险方案 CRUD ─────────────────────────────────────────────────────────────

@router.post("/advisor/insurance", tags=["advisor"])
def advisor_create_insurance(req: CreateInsurancePlanRequest, user: dict = Depends(require_role("advisor"))):
    """顾问：为客户创建/上传保险方案"""
    if req.client_id and user["role"] != "admin":
        assert_advisor_owns_client(user["id"], req.client_id)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("""
            INSERT INTO insurance_plans (name, advisor_id, client_id, plan_data, excel_filename, is_template)
            VALUES (?,?,?,?,?,?)
        """, (req.name, user["id"], req.client_id, json.dumps(req.plan_data),
              req.excel_filename, 1 if req.is_template else 0))
        conn.commit()
        plan_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        return {"status": "success", "plan_id": plan_id, "message": "保险方案已保存"}
    finally:
        conn.close()

@router.post("/advisor/insurance/upload/{client_id}", tags=["advisor"])
async def advisor_upload_insurance_excel(
    client_id: int,
    file: UploadFile = File(...),
    user: dict = Depends(require_role("advisor"))
):
    """顾问：直接上传 Excel 文件并解析，自动保存为客户方案"""
    if user["role"] != "admin":
        assert_advisor_owns_client(user["id"], client_id)
    from services.fip.insurance_parser import parse_insurance_plan
    if not file.filename:
        raise HTTPException(400, "未提供文件")
    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(400, "文件过大（最大 10MB）")
    result = parse_insurance_plan(file_bytes, file.filename)
    if not result.get("ok"):
        raise HTTPException(422, result.get("error", "解析失败"))
    # 自动保存
    plan_name = file.filename.replace(".xlsx", "").replace(".xls", "")
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("""
            INSERT INTO insurance_plans (name, advisor_id, client_id, plan_data, excel_filename)
            VALUES (?,?,?,?,?)
        """, (plan_name, user["id"], client_id, json.dumps(result), file.filename))
        conn.commit()
        plan_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        result["plan_id"] = plan_id
        result["message"] = "文件已解析并保存到客户账号"
        return result
    finally:
        conn.close()

@router.get("/advisor/insurance/templates", tags=["advisor"])
def advisor_list_templates(user: dict = Depends(require_role("advisor"))):
    """顾问：获取我的保险方案模板库"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            "SELECT id, name, created_at, excel_filename FROM insurance_plans WHERE advisor_id=? AND is_template=1",
            (user["id"],)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@router.put("/advisor/insurance/{plan_id}", tags=["advisor"])
def advisor_update_insurance(plan_id: int, req: UpdateInsurancePlanRequest, user: dict = Depends(require_role("advisor"))):
    """顾问：更新保险方案元信息"""
    conn = sqlite3.connect(DB_PATH)
    try:
        existing = conn.execute("SELECT advisor_id FROM insurance_plans WHERE id=?", (plan_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "方案不存在")
        if user["role"] != "admin" and existing[0] != user["id"]:
            raise HTTPException(403, "无权修改此方案")
        updates, params = [], []
        if req.name is not None:
            updates.append("name=?"); params.append(req.name)
        if req.client_id is not None:
            updates.append("client_id=?"); params.append(req.client_id)
        if req.is_template is not None:
            updates.append("is_template=?"); params.append(1 if req.is_template else 0)
        if updates:
            updates.append("updated_at=?"); params.append(datetime.now().isoformat())
            params.append(plan_id)
            conn.execute(f"UPDATE insurance_plans SET {','.join(updates)} WHERE id=?", params)
            conn.commit()
        return {"status": "success"}
    finally:
        conn.close()

@router.delete("/advisor/insurance/{plan_id}", tags=["advisor"])
def advisor_delete_insurance(plan_id: int, user: dict = Depends(require_role("advisor"))):
    """顾问：删除保险方案"""
    conn = sqlite3.connect(DB_PATH)
    try:
        existing = conn.execute("SELECT advisor_id FROM insurance_plans WHERE id=?", (plan_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "方案不存在")
        if user["role"] != "admin" and existing[0] != user["id"]:
            raise HTTPException(403, "无权删除此方案")
        conn.execute("DELETE FROM insurance_plans WHERE id=?", (plan_id,))
        conn.commit()
        return {"status": "success", "message": "方案已删除"}
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# ██  MY  ── 付费用户个人端点（查看顾问上传的方案）
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/my/insurance-plans", tags=["my"])
def my_insurance_plans(user: dict = Depends(require_role("premium"))):
    """付费用户：查看顾问为我准备的所有保险方案"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute("""
            SELECT ip.id, ip.name, ip.created_at, ip.excel_filename, ip.plan_data,
                   u.display_name as advisor_name
            FROM insurance_plans ip JOIN users u ON u.id=ip.advisor_id
            WHERE ip.client_id=?
            ORDER BY ip.created_at DESC
        """, (user["id"],)).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["plan_data"] = json.loads(d["plan_data"])
            result.append(d)
        return result
    finally:
        conn.close()

@router.get("/my/advisor", tags=["my"])
def my_advisor(user: dict = Depends(require_role("premium"))):
    """付费用户：获取自己的顾问信息"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute("""
            SELECT u.id, u.display_name, u.email
            FROM advisor_clients ac JOIN users u ON u.id=ac.advisor_id
            WHERE ac.client_id=? AND ac.is_active=1 LIMIT 1
        """, (user["id"],)).fetchone()
        if not row:
            return {"advisor": None, "message": "暂未分配专属顾问"}
        return {"advisor": dict(row)}
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# ██  PUBLIC  ── 公开端点（无需登录）
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/public/portfolios", tags=["public"])
def public_portfolios():
    """获取所有公开组合（如 Wonder Portfolio），无需登录"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            "SELECT id, name, created_at, base_currency FROM portfolios WHERE is_public=1"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
