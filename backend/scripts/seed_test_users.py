"""
seed_test_users.py
------------------
为本地测试生成一批测试用户（顾问 + 普通用户）和对应的顾问-客户关系。
运行方式：
    cd /Users/derek/Projects/Wonder_Platform/backend
    python scripts/seed_test_users.py
"""
import sqlite3
import uuid
from datetime import datetime

# 与 passlib 保持一致的哈希方式
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

DB_PATH = "hk_admin.db"

# ── 测试账号定义 ──────────────────────────────────────────────────
TEST_USERS = [
    # 顾问账号
    {"email": "advisor.alice@test.com", "name": "Alice Chan (Advisor)",  "password": "Test@1234", "role": "advisor"},
    {"email": "advisor.bob@test.com",   "name": "Bob Li (Advisor)",      "password": "Test@1234", "role": "advisor"},
    # 付费客户
    {"email": "premium.carol@test.com", "name": "Carol Wang (Premium)",  "password": "Test@1234", "role": "premium"},
    {"email": "premium.dave@test.com",  "name": "Dave Zhang (Premium)",  "password": "Test@1234", "role": "premium"},
    # 普通免费用户
    {"email": "free.eve@test.com",      "name": "Eve Liu (Free)",        "password": "Test@1234", "role": "free"},
    {"email": "free.frank@test.com",    "name": "Frank Chen (Free)",     "password": "Test@1234", "role": "free"},
]

# ── 顾问-客户关系（在用户插入后建立）────────────────────────────────
ADVISOR_CLIENT_PAIRS = [
    # (advisor_email, client_email)
    ("advisor.alice@test.com", "premium.carol@test.com"),
    ("advisor.alice@test.com", "premium.dave@test.com"),
    ("advisor.bob@test.com",   "premium.carol@test.com"),  # Carol 有两个顾问
]

def seed():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    inserted = []
    skipped = []
    
    # 插入用户
    for u in TEST_USERS:
        existing = cur.execute("SELECT id FROM users WHERE email=?", (u["email"],)).fetchone()
        if existing:
            skipped.append(u["email"])
            continue
        uid = str(uuid.uuid4())
        pw_hash = pwd_context.hash(u["password"])
        cur.execute(
            "INSERT INTO users (id, email, name, password_hash, role, is_active, created_at) VALUES (?,?,?,?,?,1,?)",
            (uid, u["email"], u["name"], pw_hash, u["role"], datetime.now().isoformat())
        )
        inserted.append({"id": uid, "email": u["email"], "role": u["role"]})
    
    conn.commit()
    
    # 建立顾问-客户关系
    relation_results = []
    for adv_email, cli_email in ADVISOR_CLIENT_PAIRS:
        adv = cur.execute("SELECT id FROM users WHERE email=?", (adv_email,)).fetchone()
        cli = cur.execute("SELECT id FROM users WHERE email=?", (cli_email,)).fetchone()
        if adv and cli:
            cur.execute(
                "INSERT OR REPLACE INTO advisor_clients (advisor_id, client_id, is_active, assigned_at) VALUES (?,?,1,?)",
                (adv["id"], cli["id"], datetime.now().isoformat())
            )
            relation_results.append(f"  {adv_email} → {cli_email}")
    
    conn.commit()
    conn.close()
    
    print("=" * 60)
    print("✅ 测试用户种子数据生成完毕")
    print("=" * 60)
    print(f"\n📌 新增用户 ({len(inserted)} 个)：")
    for u in inserted:
        print(f"  [{u['role']:8s}] {u['email']}  (密码: Test@1234)")
    if skipped:
        print(f"\n⏭  已跳过（邮箱已存在）：{', '.join(skipped)}")
    print(f"\n🔗 顾问-客户关系 ({len(relation_results)} 条)：")
    for r in relation_results:
        print(r)
    print("\n所有账号密码均为：Test@1234")
    print("=" * 60)

if __name__ == "__main__":
    seed()
