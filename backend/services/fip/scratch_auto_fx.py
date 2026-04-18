import sys
import sqlite3
from portfolio_engine import PortfolioEngine
from data_provider import RealTime

def debug_portfolio():
    conn = sqlite3.connect('portfolio.db')
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, base_currency FROM portfolios")
    portfolios = cursor.fetchall()
    
    for pid, name, base_curr in portfolios:
        print(f"\n--- Checking Portfolio {pid}: {name} (Base: {base_curr}) ---")
        cursor.execute("SELECT isin, SUM(CASE WHEN type IN ('CASH_IN', 'SELL') THEN price*shares ELSE -price*shares END) as balance FROM transactions WHERE portfolio_id=? AND isin LIKE 'CASH_%' GROUP BY isin", (pid,))
        rows = cursor.fetchall()
        for r_isin, r_bal in rows:
            print(f"  Wallet: {r_isin}, Balance: {r_bal}")
            
    conn.close()

if __name__ == '__main__':
    debug_portfolio()
