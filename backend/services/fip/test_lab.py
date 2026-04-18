from api_server import AnalyzeRequest, analyze_portfolio
req = AnalyzeRequest(
    isins=["SPY", "TLT"],
    days_back=500,
    max_weight=0.6,
    mc_capital=1000000.0,
    mc_contribution=0.0,
    mc_contribution_years=10,
    mc_withdrawal=0.0,
    mc_withdrawal_start=1,
    mc_withdrawal_end=30,
    mc_years=10,
    mc_target=2000000.0,
    mc_stress=False,
    mc_inflation=0.025
)
print("Running analyze...")
result = analyze_portfolio(req)
print("Done!")
