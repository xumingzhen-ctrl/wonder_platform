import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import sqlite3
from services.auth import hash_password
from main import DB_PATH

pwd = "Advisor2026!"
hsh = hash_password(pwd)

conn = sqlite3.connect(DB_PATH)
conn.execute("UPDATE users SET password_hash=? WHERE email=?", (hsh, "advisor.alice@test.com"))
conn.commit()
conn.close()
print("Success")
