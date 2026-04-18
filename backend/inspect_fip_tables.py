import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "hk_admin.db")
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

def print_schema(table):
    print(f"--- Schema for {table} ---")
    cursor.execute(f"PRAGMA table_info({table})")
    for row in cursor.fetchall():
        print(row)

print_schema("users")
print_schema("portfolios")
print_schema("lab_scenarios")

conn.close()
