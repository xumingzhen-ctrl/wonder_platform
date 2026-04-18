import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "hk_admin.db")
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Set all portfolios to public or specifically those two
# The user asked to make "these two portfolios" public. Since we migrated exactly 5 portfolios, we can find them by name.
portfolio_names = [
    "Accumulation Portfolio",
    "Income Strategy Sample"
]

for name in portfolio_names:
    cursor.execute("UPDATE portfolios SET is_public = 1 WHERE name = ?", (name,))
    print(f"Updated '{name}' to public. Rows affected: {cursor.rowcount}")

conn.commit()
conn.close()
print("Done.")
