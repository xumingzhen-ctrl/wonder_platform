import sys
import os
import sqlite3

sys.path.append(os.path.join(os.getcwd(), 'backend'))
# To import portfolio_engine, it's inside backend/services/fip
sys.path.append(os.path.join(os.getcwd(), 'backend', 'services', 'fip'))

try:
    import portfolio_engine
    portfolio_engine.DB_PATH = os.path.join(os.getcwd(), 'backend', 'hk_admin.db')
    from portfolio_engine import PortfolioEngine
except Exception as e:
    print("Failed to import PortfolioEngine:", e)

import json

db_path = os.path.join(os.getcwd(), 'backend', 'hk_admin.db')
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

portfolios = [1019, 1020, 1021]

for pid in portfolios:
    cursor.execute("SELECT * FROM portfolios WHERE id = ?", (pid,))
    row = cursor.fetchone()
    if not row:
        continue
        
    print(f"--- Portfolio {pid} ({row['name']}) ---")
    
    # Try using PortfolioEngine to get the full stats
    try:
        engine = PortfolioEngine(pid)
        curr = engine.get_current_portfolio()
        nav = engine.calculate_nav()
        perf = engine.calculate_performance(nav)
        
        try:
            div_proj = engine.get_dividend_projections()
            metrics = div_proj.get('portfolio_metrics', {})
        except:
            metrics = {}
            
        data = {
            "name": row["name"],
            "base_currency": row.get("base_currency", "USD"),
            "holdings": curr,
            "nav": nav,
            "performance": perf,
            "metrics": metrics
        }
        
        with open(f"portfolio_{pid}.json", "w") as f:
            json.dump(data, f, indent=2)
            
        engine.close()
    except Exception as e:
        print(f"Error extracting {pid} with Engine: {e}")
        # fallback
        with open(f"portfolio_{pid}.json", "w") as f:
            json.dump(dict(row), f, indent=2)

