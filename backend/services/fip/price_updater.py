import os
import sqlite3
from datetime import datetime
from data_provider import RealTime
from portfolio_engine import PortfolioEngine
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "hk_admin.db")

def update_daily_prices():
    """
    1. Fetch all unique ISINs from transactions.
    2. Get current prices and save to 'prices' table.
    3. Calculate NAV for all portfolios and save to 'portfolio_history'.
    """
    logger.info("Starting daily portfolio update...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    today = datetime.now().strftime("%Y-%m-%d")

    # 1. Update Asset Prices
    cursor.execute("SELECT DISTINCT isin FROM transactions WHERE isin NOT LIKE 'CASH_%'")
    isins = [row[0] for row in cursor.fetchall()]
    
    for isin in isins:
        try:
            market_data = RealTime.get_market_data(isin)
            price = market_data['price']
            cursor.execute("""
                INSERT OR REPLACE INTO prices (isin, date, price, currency)
                VALUES (?, ?, ?, 'USD')
            """, (isin, today, price))
            logger.info(f"Updated price for {isin}: {price}")
        except Exception as e:
            logger.error(f"Failed to update price for {isin}: {e}")

    # 2. Update Portfolio NAVs
    cursor.execute("SELECT id FROM portfolios")
    portfolio_ids = [row[0] for row in cursor.fetchall()]

    for pid in portfolio_ids:
        try:
            engine = PortfolioEngine(pid)
            try:
                nav_data = engine.calculate_nav()
                cursor.execute("""
                    INSERT OR REPLACE INTO portfolio_history (portfolio_id, date, total_nav, wallet_balance)
                    VALUES (?, ?, ?, ?)
                """, (pid, today, nav_data['total_nav'], nav_data['wallet_balance']))
                logger.info(f"Updated history for portfolio {pid}: NAV={nav_data['total_nav']}")
            finally:
                engine.close()
        except Exception as e:
            logger.error(f"Failed to update history for portfolio {pid}: {e}")

    conn.commit()
    conn.close()

    # FIX: Clear the in-memory lru_cache so next report() call uses fresh prices,
    # not stale values from when the server first started.
    RealTime.get_market_data.cache_clear()
    RealTime.get_historical_series.cache_clear()

    logger.info("Daily update complete. In-memory price cache cleared.")


if __name__ == "__main__":
    update_daily_prices()
