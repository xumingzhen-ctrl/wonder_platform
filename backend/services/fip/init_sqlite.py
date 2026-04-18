import sqlite3
import os
import json

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "hk_admin.db")


def _add_column_if_missing(cursor, table: str, column: str, col_def: str):
    """Safely add a column to an existing table if it doesn't already exist."""
    cursor.execute(f"PRAGMA table_info({table})")
    cols = [row[1] for row in cursor.fetchall()]
    if column not in cols:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}")


def init_db():
    """Initialize all required tables. Safe to re-run on existing databases."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # ── core tables ───────────────────────────────────────────────────────────
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS portfolios (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        name                TEXT UNIQUE NOT NULL,
        created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
        base_currency       TEXT DEFAULT 'USD',
        dividend_strategy   TEXT DEFAULT 'CASH',
        target_allocations  TEXT
    )''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS transactions (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        portfolio_id INTEGER,
        date         TEXT,
        isin         TEXT,
        type         TEXT,
        shares       REAL,
        price        REAL,
        FOREIGN KEY(portfolio_id) REFERENCES portfolios(id)
    )''')

    # ── price / dividend caches ───────────────────────────────────────────────
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS prices (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        isin     TEXT,
        date     TEXT,
        price    REAL,
        currency TEXT,
        UNIQUE(isin, date)
    )''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS price_cache (
        isin    TEXT,
        date    TEXT,
        price   REAL,
        name    TEXT,
        sector  TEXT,
        country TEXT,
        UNIQUE(isin, date)
    )''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS dividend_cache (
        isin   TEXT,
        date   TEXT,
        amount REAL,
        UNIQUE(isin, date)
    )''')

    # ── manual dividends ──────────────────────────────────────────────────────
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS manual_dividends (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        portfolio_id     INTEGER,
        isin             TEXT,
        date             TEXT,
        amount_per_share REAL,
        currency         TEXT DEFAULT 'USD',
        FOREIGN KEY(portfolio_id) REFERENCES portfolios(id)
    )''')

    # ── portfolio history / stats ─────────────────────────────────────────────
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS portfolio_history (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        portfolio_id   INTEGER,
        date           TEXT,
        total_nav      REAL,
        wallet_balance REAL,
        UNIQUE(portfolio_id, date)
    )''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS portfolio_stats_cache (
        portfolio_id      INTEGER PRIMARY KEY,
        total_nav         REAL,
        wallet_balance    REAL,
        total_pnl         REAL,
        total_divs        REAL,
        cumulative_roi    REAL,
        annualized_return REAL,
        details           TEXT,
        dividend_history  TEXT,
        last_updated      TEXT
    )''')

    # ── asset metadata ────────────────────────────────────────────────────────
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS assets (
        isin       TEXT PRIMARY KEY,
        name       TEXT,
        ticker     TEXT,
        sector     TEXT,
        country    TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    # ── RBAC: users ───────────────────────────────────────────────────────────
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        email           TEXT UNIQUE NOT NULL,
        password_hash   TEXT NOT NULL,
        display_name    TEXT,
        role            TEXT NOT NULL DEFAULT 'free',
        is_active       INTEGER DEFAULT 1,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login_at   TIMESTAMP,
        notes           TEXT
    )''')

    # ── RBAC: advisor-client relationships ────────────────────────────────────
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS advisor_clients (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        advisor_id  INTEGER NOT NULL REFERENCES users(id),
        client_id   INTEGER NOT NULL REFERENCES users(id),
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        assigned_by INTEGER REFERENCES users(id),
        is_active   INTEGER DEFAULT 1,
        UNIQUE(advisor_id, client_id)
    )''')

    # ── RBAC: insurance plans (advisor uploads for clients) ───────────────────
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS insurance_plans (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT NOT NULL,
        advisor_id      INTEGER NOT NULL REFERENCES users(id),
        client_id       INTEGER REFERENCES users(id),
        plan_data       TEXT NOT NULL,
        excel_filename  TEXT,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP,
        is_template     INTEGER DEFAULT 0
    )''')

    # ── live-migrate: add missing columns to existing databases safely ─────────
    _add_column_if_missing(cursor, 'portfolios', 'dividend_strategy', "TEXT DEFAULT 'CASH'")
    _add_column_if_missing(cursor, 'portfolios', 'target_allocations', 'TEXT')
    _add_column_if_missing(cursor, 'portfolios', 'user_id', 'INTEGER')
    _add_column_if_missing(cursor, 'portfolios', 'is_public', 'INTEGER DEFAULT 0')
    _add_column_if_missing(cursor, 'assets', 'sector', 'TEXT')
    _add_column_if_missing(cursor, 'assets', 'country', 'TEXT')

    # ── broker transaction history (immutable ledger) ─────────────────────────
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS broker_trades (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        portfolio_id INTEGER,
        broker       TEXT,
        trade_date   TEXT,
        symbol       TEXT,
        side         TEXT,
        quantity     REAL,
        price        REAL,
        commission   REAL DEFAULT 0,
        currency     TEXT,
        order_id     TEXT,
        imported_at  TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(portfolio_id) REFERENCES portfolios(id)
    )''')

    # ── sync metadata per portfolio ───────────────────────────────────────────
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS sync_metadata (
        portfolio_id     INTEGER PRIMARY KEY,
        broker           TEXT,
        last_snapshot_at TEXT,
        last_tx_sync_at  TEXT,
        nlv_usd          REAL DEFAULT 0,
        history_days     INTEGER DEFAULT 90,
        history_warning  TEXT,
        FOREIGN KEY(portfolio_id) REFERENCES portfolios(id)
    )''')

    _add_column_if_missing(cursor, 'price_cache', 'name', 'TEXT')
    _add_column_if_missing(cursor, 'price_cache', 'sector', 'TEXT')
    _add_column_if_missing(cursor, 'price_cache', 'country', 'TEXT')

    # ── Strategy Lab: saved scenarios ────────────────────────────────────────
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS lab_scenarios (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT NOT NULL,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        assets_json   TEXT NOT NULL,
        weights_json  TEXT NOT NULL,
        settings_json TEXT NOT NULL,
        summary_json  TEXT NOT NULL,
        chart_json    TEXT NOT NULL
    )''')

    conn.commit()
    conn.close()
    print("Database schema initialized / updated successfully.")




def migrate_existing_data():
    if not os.path.exists("transactions.json"):
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Create default portfolio
    cursor.execute("INSERT OR IGNORE INTO portfolios (name) VALUES ('Default Active')")
    cursor.execute("SELECT id FROM portfolios WHERE name = 'Default Active'")
    portfolio_id = cursor.fetchone()[0]

    with open("transactions.json", "r") as f:
        txs = json.load(f)

    for tx in txs:
        cursor.execute('''
        INSERT INTO transactions (portfolio_id, date, isin, type, shares, price)
        VALUES (?, ?, ?, ?, ?, ?)
        ''', (portfolio_id, tx['date'], tx['isin'], tx['type'], tx['shares'], tx['price']))

    # Migrate historical_nav.json cache if exists
    if os.path.exists("historical_nav.json"):
        with open("historical_nav.json", "r") as f:
            h_nav = json.load(f)
            for isin, dates in h_nav.items():
                for date, data in dates.items():
                    cursor.execute('''
                    INSERT OR IGNORE INTO prices (isin, date, price, currency)
                    VALUES (?, ?, ?, ?)
                    ''', (isin, date, data['price'], data.get('currency', 'USD')))

    conn.commit()
    conn.close()
    print("Migration to SQLite complete.")


if __name__ == "__main__":
    init_db()
    migrate_existing_data()
