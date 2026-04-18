import sys
import sqlite3

def debug_portfolio():
    conn = sqlite3.connect('portfolio.db')
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, base_currency FROM portfolios ORDER BY id DESC LIMIT 5")
    portfolios = cursor.fetchall()
    
    for pid, name, base_curr in portfolios:
        print(f"\n--- Checking Portfolio {pid}: {name} (Base: {base_curr}) ---")
        cursor.execute("SELECT isin, date, type, shares, price FROM transactions WHERE portfolio_id=?", (pid,))
        rows = cursor.fetchall()
        for r in rows:
            print(f"  {r}")
            
    conn.close()

if __name__ == '__main__':
    debug_portfolio()
