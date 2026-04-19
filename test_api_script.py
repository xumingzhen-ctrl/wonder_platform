import requests
token_res = requests.post("http://127.0.0.1:8000/auth/login", json={"email": "27050016@qq.com", "password": "Maqoc6uu%"}).json()
print("Token:", token_res.get("access_token")[:10] if token_res.get("access_token") else "None")
headers = {"Authorization": f"Bearer {token_res.get('access_token')}"}
res = requests.get("http://127.0.0.1:8000/portfolios", headers=headers)
print("Portfolios:", [p['name'] for p in res.json()])

# Create one
import time
new_pf = {
    "name": f"Test Python PF {int(time.time())}",
    "budget": 1000,
    "allocations": {"AAPL": 1.0},
    "is_public": False
}
create_res = requests.post("http://127.0.0.1:8000/portfolios/new", json=new_pf, headers=headers)
print("Create response:", create_res.status_code, create_res.text)

# List again
res = requests.get("http://127.0.0.1:8000/portfolios", headers=headers)
print("Portfolios after:", [p['name'] for p in res.json()])
