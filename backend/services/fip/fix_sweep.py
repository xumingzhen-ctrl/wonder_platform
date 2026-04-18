import sys
import os
from portfolio_engine import PortfolioEngine

def fix():
    try:
        # User's portfolio ID is usually 1010
        engine = PortfolioEngine(1010)
        # get the latest transaction date
        if engine.df.empty:
            print("No transactions")
            return
        last_date = engine.df['date'].max().strftime("%Y-%m-%d")
        print(f"Triggering auto fx sweep for date: {last_date}")
        engine._auto_fx_sweep(last_date)
        print("Success!")
    except Exception as e:
        print("Error:", e)

if __name__ == '__main__':
    fix()
