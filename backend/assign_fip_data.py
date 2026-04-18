import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "hk_admin.db")
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# 1. Get admin user id
cursor.execute("SELECT id FROM users WHERE email = 'admin@wonderhub.hk'")
row = cursor.fetchone()
if not row:
    print("Admin user not found!")
    exit(1)

admin_id = row[0]
print(f"Admin ID: {admin_id}")

# 2. Update portfolios
cursor.execute("UPDATE portfolios SET user_id = ?", (admin_id,))
print(f"Updated {cursor.rowcount} portfolios.")

# 3. Check and update lab_scenarios
cursor.execute("PRAGMA table_info(lab_scenarios)")
columns = [c[1] for c in cursor.fetchall()]

if 'user_id' not in columns:
    print("Adding user_id column to lab_scenarios...")
    cursor.execute("ALTER TABLE lab_scenarios ADD COLUMN user_id VARCHAR(36)")

cursor.execute("UPDATE lab_scenarios SET user_id = ?", (admin_id,))
print(f"Updated {cursor.rowcount} lab scenarios.")

conn.commit()
conn.close()
print("Successfully assigned all FIP data to admin.")
