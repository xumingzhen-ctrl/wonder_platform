import sqlite3
import os

OLD_DB_PATH = "/Users/derek/Projects/Wonder_Platform/Financial Information Publist/backend/portfolio.db"
NEW_DB_PATH = "/Users/derek/Projects/Wonder_Platform/backend/hk_admin.db"

old_conn = sqlite3.connect(OLD_DB_PATH)
old_conn.row_factory = sqlite3.Row
old_cursor = old_conn.cursor()

new_conn = sqlite3.connect(NEW_DB_PATH)
new_cursor = new_conn.cursor()

# 1. Get admin user id
new_cursor.execute("SELECT id FROM users WHERE email = 'admin@wonderhub.hk'")
row = new_cursor.fetchone()
if not row:
    print("Admin user not found!")
    exit(1)
admin_id = row[0]

def migrate_table(table_name, add_user_id=False):
    print(f"Migrating {table_name}...")
    old_cursor.execute(f"SELECT * FROM {table_name}")
    rows = old_cursor.fetchall()
    
    if not rows:
        print(f"No rows in {table_name}.")
        return

    # Check columns in new DB
    new_cursor.execute(f"PRAGMA table_info({table_name})")
    new_columns = [col[1] for col in new_cursor.fetchall()]
    
    old_columns = list(rows[0].keys())
    
    # We will only copy columns that exist in BOTH databases (and handle user_id)
    cols_to_copy = [c for c in old_columns if c in new_columns and c != 'user_id']
    
    insert_cols = list(cols_to_copy)
    if add_user_id and 'user_id' in new_columns:
        insert_cols.append('user_id')
        
    placeholders = ", ".join(["?"] * len(insert_cols))
    
    insert_query = f"INSERT OR IGNORE INTO {table_name} ({', '.join(insert_cols)}) VALUES ({placeholders})"
    
    count = 0
    for row in rows:
        values = [row[c] for c in cols_to_copy]
        if add_user_id and 'user_id' in new_columns:
            values.append(admin_id)
        new_cursor.execute(insert_query, values)
        count += 1
        
    print(f"Migrated {count} rows for {table_name}.")

# Tables to migrate
migrate_table("portfolios", add_user_id=True)
migrate_table("lab_scenarios", add_user_id=True)
migrate_table("transactions")
migrate_table("manual_dividends")
migrate_table("portfolio_stats_cache")
migrate_table("portfolio_history")
migrate_table("price_cache")
migrate_table("dividend_cache")
migrate_table("broker_trades")
migrate_table("sync_metadata")

new_conn.commit()
new_conn.close()
old_conn.close()

print("Migration completed successfully.")
