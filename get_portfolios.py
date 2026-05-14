import sys
import os
import sqlite3

sys.path.append(os.path.join('/Users/derek/Projects/Wonder_Platform/Financial Information Publist/backend'))
import portfolio_engine
from portfolio_engine import PortfolioEngine

# Use the real database
portfolio_engine.DB_PATH = '/Users/derek/Projects/Wonder_Platform/Financial Information Publist/backend/portfolio.db'

def get_info(pid):
    try:
        engine = PortfolioEngine(pid)
        curr = engine.get_current_portfolio()
        nav = engine.calculate_nav()
        perf = engine.calculate_performance(nav)
        
        # Stability/Volatility might be in metrics if available
        metrics = {}
        try:
            div_proj = engine.get_dividend_projections()
            metrics = div_proj.get('portfolio_metrics', {})
        except Exception as e:
            pass
            
        print(f"--- Portfolio {pid} ---")
        name = engine._execute_query("SELECT name FROM portfolios WHERE id=?", (pid,), fetchone=True)
        if name:
            print(f"Name: {name['name']}")
        print(f"Holdings: {curr}")
        print(f"NAV: {nav}")
        print(f"Performance: {perf}")
        print(f"Metrics: {metrics}")
        engine.close()
    except Exception as e:
        print(f"Error for {pid}: {e}")

for pid in [1002, 1005, 1010]:
    get_info(pid)
