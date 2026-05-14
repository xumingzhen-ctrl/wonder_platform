import sys
import os
import sqlite3
import json

sys.path.append(os.path.join(os.getcwd(), 'backend'))
sys.path.append(os.path.join(os.getcwd(), 'backend', 'services', 'fip'))

try:
    import portfolio_engine
    portfolio_engine.DB_PATH = os.path.join(os.getcwd(), 'backend', 'hk_admin_cloud.db')
    from portfolio_engine import PortfolioEngine
except Exception as e:
    print("Failed to import PortfolioEngine:", e)

db_path = os.path.join(os.getcwd(), 'backend', 'hk_admin_cloud.db')
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

portfolios = [1016, 1017, 1018]

for pid in portfolios:
    cursor.execute("SELECT * FROM portfolios WHERE id = ?", (pid,))
    row = cursor.fetchone()
    if not row:
        continue
        
    print(f"\n--- Portfolio {pid} ({row['name']}) ---")
    
    # Also check stats cache
    cursor.execute("SELECT * FROM portfolio_stats_cache WHERE portfolio_id = ?", (pid,))
    stats_row = cursor.fetchone()
    if stats_row:
        print(f"NAV: {stats_row['total_nav']}")
        print(f"PNL: {stats_row['total_pnl']}")
        print(f"Divs: {stats_row['total_divs']}")
        print(f"ROI: {stats_row['cumulative_roi']}%")
        print(f"CAGR: {stats_row['annualized_return']}%")
        print(f"Details: {stats_row['details']}")
    else:
        try:
            engine = PortfolioEngine(pid)
            curr = engine.get_current_portfolio()
            nav = engine.calculate_nav()
            perf = engine.calculate_performance(nav)
            print(f"Holdings: {curr}")
            print(f"NAV: {nav}")
            print(f"Performance: {perf}")
            engine.close()
        except Exception as e:
            print(f"Error extracting {pid} with Engine: {e}")

