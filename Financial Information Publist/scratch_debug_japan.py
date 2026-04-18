import sys
import os
import json
import pandas as pd
from datetime import datetime

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from portfolio_engine import PortfolioEngine
from data_provider import RealTime

def test_japan_history():
    portfolio_id = 1005
    engine = PortfolioEngine(portfolio_id)
    
    # 1. Investigate transactions
    print("--- Transactions ---")
    print(engine.df)
    
    # 2. Check base currency
    print(f"\nBase Currency: {engine.base_currency}")
    
    # 3. Simulate history
    print("\n--- Simulation ---")
    hist_chart = engine.get_historical_chart_data()
    
    for point in hist_chart:
        print(f"{point['date']}: {point['value']}")

if __name__ == "__main__":
    test_japan_history()
