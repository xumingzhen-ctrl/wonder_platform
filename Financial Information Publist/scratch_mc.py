import requests

payload = {
    "isins": ["AAPL", "MSFT", "GOOGL"],
    "days_back": 1825,
    "max_weight": 0.5,
    "mc_capital": 0,
    "mc_contribution": 50000,
    "mc_contribution_start": 1,
    "mc_contribution_years": 10,
    "mc_withdrawal": 0,
    "mc_withdrawal_start": 1,
    "mc_withdrawal_end": 30,
    "mc_years": 30,
    "mc_target": 1000000,
    "mc_stress": False,
    "mc_inflation": 0.0,
    "insurance_plan": [
        {"year": 1, "guaranteed_cv": 0, "non_guaranteed": 0, "withdrawal": 0, "total_cv_base": 0},
        {"year": 2, "guaranteed_cv": 0, "non_guaranteed": 0, "withdrawal": 0, "total_cv_base": 0, "premium": 0}
    ]
}

res = requests.post("http://localhost:8000/lab/analyze", json=payload)
print(res.text)
