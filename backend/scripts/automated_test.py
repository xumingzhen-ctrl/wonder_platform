#!/usr/bin/env python3
"""
automated_test.py - Wonder Platform 自动化 API 测试
运行方式: cd /Users/derek/Projects/Wonder_Platform/backend && source venv/bin/activate && python3 scripts/automated_test.py
"""
import requests
import json
import sys

BASE = "http://localhost:8000"
ADMIN_EMAIL = "admin@wonderhub.hk"
# Try both known passwords
ADMIN_PASSWORDS = ["Admin@1234", "Maqoc6uu%", "admin123", "Wonder@2024"]
FREE_EMAIL = "free.eve@test.com"
FREE_PASSWORD = "Test@1234"
ADVISOR_EMAIL = "advisor.alice@test.com"
ADVISOR_PASSWORD = "Test@1234"

PASS = "✅"
FAIL = "❌"
WARN = "⚠️ "

results = []
admin_token = None
free_token = None
advisor_token = None
test_portfolio_id = None

def test(name, passed, detail=""):
    symbol = PASS if passed else FAIL
    results.append((symbol, name, detail))
    print(f"{symbol} {name}" + (f" — {detail}" if detail else ""))

def h(token): return {"Authorization": f"Bearer {token}"} if token else {}

print("=" * 60)
print("Wonder Platform 自动化测试")
print("=" * 60)

# ── 模块一/十四：认证 & 组合可见性 ────────────────────────────────

print("\n--- 模块一 & 十四: 认证 + 组合可见性 ---")

# 1.1 无 Token 公开组合（14.5）
r = requests.get(f"{BASE}/portfolios")
data = r.json()
test("14.5 无Token只返回公开组合", 
     r.status_code == 200 and len(data) == 2 and all(p["is_public"] == 1 for p in data),
     f"返回 {len(data)} 条: {[p['name'] for p in data]}")

# 1.1 管理员登录
admin_token_found = False
for pwd in ADMIN_PASSWORDS:
    r = requests.post(f"{BASE}/auth/login", json={"email": ADMIN_EMAIL, "password": pwd})
    if r.status_code == 200:
        d = r.json()
        admin_token = d.get("access_token") or d.get("token")
        admin_token_found = True
        test("1.1 Admin 正常登录", True, f"密码: {pwd}, role={d['role']}")
        break
if not admin_token_found:
    test("1.1 Admin 正常登录", False, f"所有密码均失败: {ADMIN_PASSWORDS}")

# 1.2 错误密码
r = requests.post(f"{BASE}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong_password"})
test("1.2 错误密码拒绝", r.status_code == 401, f"status={r.status_code}")

# Free 用户登录
r = requests.post(f"{BASE}/auth/login", json={"email": FREE_EMAIL, "password": FREE_PASSWORD})
if r.status_code == 200:
    d = r.json()
    free_token = d.get("access_token") or d.get("token")
    test("Free用户登录", True, f"role={d['role']}")
else:
    test("Free用户登录", False, f"status={r.status_code} {r.text[:100]}")

# Advisor 用户登录
r = requests.post(f"{BASE}/auth/login", json={"email": ADVISOR_EMAIL, "password": ADVISOR_PASSWORD})
if r.status_code == 200:
    d = r.json()
    advisor_token = d.get("access_token") or d.get("token")
    test("Advisor用户登录", True, f"role={d['role']}")
else:
    test("Advisor用户登录", False, f"status={r.status_code}")

# ── 模块十四：组合可见性分角色验证 ────────────────────────────────

print("\n--- 模块十四: 组合可见性 ---")

# 14.1 Admin 看全部
if admin_token:
    r = requests.get(f"{BASE}/portfolios", headers=h(admin_token))
    data = r.json()
    test("14.1 Admin看全部组合",
         r.status_code == 200 and len(data) >= 4,
         f"返回 {len(data)} 条: {[p['name'] for p in data]}")

# 14.2 Advisor 看全部
if advisor_token:
    r = requests.get(f"{BASE}/portfolios", headers=h(advisor_token))
    data = r.json()
    test("14.2 Advisor看全部组合",
         r.status_code == 200 and len(data) >= 4,
         f"返回 {len(data)} 条")

# 14.4 Free 只看公开
if free_token:
    r = requests.get(f"{BASE}/portfolios", headers=h(free_token))
    data = r.json()
    test("14.4 Free用户只看公开组合",
         r.status_code == 200 and len(data) == 2 and all(p["is_public"] == 1 for p in data),
         f"返回 {len(data)} 条: {[p['name'] for p in data]}")

# ── 模块二/三：组合列表 + 删除 ────────────────────────────────────

print("\n--- 模块三: 组合 CRUD ---")

# 获取所有组合（admin 视角）
if admin_token:
    r = requests.get(f"{BASE}/portfolios", headers=h(admin_token))
    all_portfolios = r.json()
    test("2.1 Admin获取组合列表", r.status_code == 200, f"{len(all_portfolios)} 个组合")

    # 5.1 新建组合
    r = requests.post(f"{BASE}/portfolios/new", headers=h(admin_token), json={
        "name": "AutoTest_删除我",
        "budget": 100000,
        "allocations": {},
        "dividend_strategy": "CASH",
        "base_currency": "USD",
        "date": "2025-01-01"
    })
    if r.status_code == 200:
        test_portfolio_id = r.json().get("portfolio_id")
        test("5.1 新建组合", True, f"新组合 ID={test_portfolio_id}")
    else:
        test("5.1 新建组合", False, f"status={r.status_code} {r.text[:200]}")

    # 3.2/6.1 获取该组合报告
    if test_portfolio_id:
        r = requests.get(f"{BASE}/report/{test_portfolio_id}", headers=h(admin_token))
        test("6.1 获取组合报告", r.status_code == 200, f"status={r.status_code}")

        # 4.1 改名
        r = requests.put(f"{BASE}/portfolios/{test_portfolio_id}", headers=h(admin_token),
                         json={"name": "AutoTest_改名成功"})
        test("4.1 改名功能", r.status_code == 200, f"{r.json()}")

        # 3.3 删除测试组合
        r = requests.delete(f"{BASE}/portfolios/{test_portfolio_id}", headers=h(admin_token))
        test("3.3 删除组合", r.status_code == 200, f"{r.json()}")

        # 验证已删除
        r = requests.get(f"{BASE}/portfolios", headers=h(admin_token))
        remaining_ids = [p["id"] for p in r.json()]
        test("3.4 删除后组合已消失", test_portfolio_id not in remaining_ids,
             f"剩余组合IDs: {remaining_ids}")

# ── 模块六：交易管理 ────────────────────────────────────────────

print("\n--- 模块六: 交易管理 ---")
if admin_token and all_portfolios:
    pid = all_portfolios[0]["id"]  # Accumulation Portfolio id=1
    r = requests.get(f"{BASE}/portfolios/transactions/{pid}", headers=h(admin_token))
    test("6.2 获取交易列表", r.status_code == 200, f"共 {len(r.json().get('transactions', []))} 条记录")

# ── 模块七：股息功能 ────────────────────────────────────────────

print("\n--- 模块七: 股息功能 ---")
if admin_token and all_portfolios:
    pid = all_portfolios[0]["id"]
    # 新增手动股息
    r = requests.post(f"{BASE}/portfolios/dividend/manual/{pid}", headers=h(admin_token),
                      json={"isin": "0P00006T5J", "date": "2025-06-01", "amount_per_share": 0.5})
    div_id = None
    if r.status_code == 200:
        test("7.2 新增手动股息", True)
        # 获取股息列表，找到刚才添加的
        r2 = requests.get(f"{BASE}/portfolios/dividends/export/{pid}", headers=h(admin_token))
        if r2.status_code == 200:
            divs = r2.json()
            test("7.1 获取股息记录", True, f"共 {len(divs)} 条")
    else:
        test("7.2 新增手动股息", False, f"{r.status_code} {r.text[:100]}")

# ── 模块十三：用户管理 ─────────────────────────────────────────

print("\n--- 模块十三: 用户管理 ---")
if admin_token:
    # 13.2 查看用户列表
    r = requests.get(f"{BASE}/admin/users", headers=h(admin_token))
    if r.status_code == 200:
        users = r.json()["users"]
        total = r.json()["total"]
        test("13.2 管理员查看用户列表", True, f"共 {total} 个用户")
    else:
        test("13.2 管理员查看用户列表", False, f"status={r.status_code}")
        users = []

    # 13.3 按角色筛选
    r = requests.get(f"{BASE}/admin/users?role=advisor", headers=h(admin_token))
    if r.status_code == 200:
        advisors = r.json()["users"]
        test("13.3 按角色筛选顾问", len(advisors) >= 2, f"找到 {len(advisors)} 个顾问: {[u.get('email') for u in advisors]}")
    else:
        test("13.3 按角色筛选", False, f"{r.status_code}")

    # 13.9 注册新用户
    r = requests.post(f"{BASE}/auth/register", json={
        "email": "autotest.new@test.com",
        "name": "AutoTest NewUser",
        "password": "Test@1234"
    })
    if r.status_code in (200, 201):
        d = r.json()
        new_user_token = d.get("access_token") or d.get("token")
        test("13.9 注册新用户(free)", True, f"role={d.get('role')}")

        # 13.11 重复邮箱注册
        r2 = requests.post(f"{BASE}/auth/register", json={
            "email": "autotest.new@test.com",
            "name": "Dup",
            "password": "Test@1234",
        })
        test("13.11 重复邮箱注册被拒", r2.status_code in (400, 422), f"status={r2.status_code} (400/422均合法)")

        # 找到新用户并删除（清理）
        r3 = requests.get(f"{BASE}/admin/users", headers=h(admin_token))
        if r3.status_code == 200:
            new_user = next((u for u in r3.json()["users"] if u["email"] == "autotest.new@test.com"), None)
            if new_user:
                r4 = requests.delete(f"{BASE}/admin/users/{new_user['id']}", headers=h(admin_token))
                test("13.8 删除测试用户", r4.status_code == 200, f"{r4.json()}")
    else:
        test("13.9 注册新用户", False, f"status={r.status_code} {r.text[:100]}")

    # 13.12 查看顾问-客户关系列表
    r = requests.get(f"{BASE}/admin/advisor-clients", headers=h(admin_token))
    if r.status_code == 200:
        relations = r.json()
        test("13.12 顾问-客户关系列表", True, f"共 {len(relations)} 条关系")
    else:
        test("13.12 顾问-客户关系列表", False, f"status={r.status_code}")

# ── 无权限保护验证 ─────────────────────────────────────────────

print("\n--- 权限保护验证 ---")

# Free 用户不能访问 admin 端点
if free_token:
    r = requests.get(f"{BASE}/admin/users", headers=h(free_token))
    test("权限保护: free不能访问admin/users", r.status_code == 403, f"status={r.status_code}")

# ── 汇总 ─────────────────────────────────────────────────────

print("\n" + "=" * 60)
passed = sum(1 for r in results if r[0] == PASS)
failed = sum(1 for r in results if r[0] == FAIL)
print(f"测试汇总: {passed} 通过 / {failed} 失败 / {len(results)} 总计")
if failed > 0:
    print("\n❌ 失败项目：")
    for symbol, name, detail in results:
        if symbol == FAIL:
            print(f"  {name}: {detail}")
print("=" * 60)

sys.exit(0 if failed == 0 else 1)
