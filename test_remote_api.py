import requests

# 1. 登录拿 Token
res_login = requests.post("http://47.239.63.70/api/auth/login", json={"email": "admin@wonderhub.hk", "password": "admin"})
if res_login.status_code != 200:
    print("Login Failed:", res_login.status_code, res_login.text)
    exit(1)

token = res_login.json()["access_token"]
user_id = res_login.json()["user_id"]
print(f"Logged in as User ID: {user_id}")

# 2. 获取组合列表
headers = {"Authorization": f"Bearer {token}"}
res_port = requests.get("http://47.239.63.70/api/portfolios", headers=headers)
print("Portfolios Status:", res_port.status_code)
if res_port.status_code == 200:
    ports = res_port.json()
    print(f"Found {len(ports)} portfolios")
    for p in ports:
        print(f" - [{p.get('id')}] {p.get('name')} (is_public={p.get('is_public')})")
else:
    print("Error:", res_port.text)
