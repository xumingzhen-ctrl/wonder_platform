import sys, os
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from portfolio_engine import PortfolioEngine

def debug_chen():
    port_id = 1010
    engine = PortfolioEngine(port_id)
    print(f"Base Currency: {engine.base_currency}")
    print("\n--- Transactions ---")
    print(engine.df.to_string())
    
    print("\n--- Simulation ---")
    hist = engine.get_historical_chart_data()
    for row in hist:
        print(f"{row['date']}: {row['value']}")
        
    engine.close()

if __name__ == "__main__":
    debug_chen()
