import sys
sys.path.append('.')
import sqlite3
from datetime import datetime
from portfolio_engine import PortfolioEngine

def fix_all_portfolios():
    conn = sqlite3.connect('portfolio.db')
    cursor = conn.cursor()
    cursor.execute("SELECT id, name FROM portfolios")
    portfolios = cursor.fetchall()
    conn.close()
    
    today = datetime.now().strftime("%Y-%m-%d")
    for pid, name in portfolios:
        print(f"Sweeping portfolio {pid}: {name}")
        engine = PortfolioEngine(pid)
        engine._auto_fx_sweep(today)
    print("Done!")

if __name__ == '__main__':
    fix_all_portfolios()
