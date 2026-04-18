"""
Transaction Sync Plugin
=======================
Imports broker trade history and rebuilds the portfolio ledger using
Weighted Average Cost (WAC). Commission is included in cost basis.

WAC Formula:
    On BUY:  new_avg = (held_qty * old_avg + buy_qty * buy_price + commission) / (held_qty + buy_qty)
    On SELL: avg unchanged; cash received = sell_qty * sell_price - commission
             if all shares sold: avg resets to 0
"""
import os
import json
import sqlite3
import logging
from datetime import datetime, timedelta
from typing import List, Dict

logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "hk_admin.db")
FUTU_MAX_HISTORY_DAYS = 90
IB_MAX_HISTORY_DAYS = 1  # ib_insync executions() is today only; noted clearly in UI


def _ensure_tables(cursor):
    """Create broker_trades and sync_metadata tables if they don't exist."""
    cursor.executescript("""
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
        );

        CREATE TABLE IF NOT EXISTS sync_metadata (
            portfolio_id     INTEGER PRIMARY KEY,
            broker           TEXT,
            last_snapshot_at TEXT,
            last_tx_sync_at  TEXT,
            nlv_usd          REAL DEFAULT 0,
            history_days     INTEGER DEFAULT 90,
            history_warning  TEXT,
            FOREIGN KEY(portfolio_id) REFERENCES portfolios(id)
        );
    """)


def _calc_wac(held_qty: float, old_avg: float, buy_qty: float, buy_price: float, commission: float) -> float:
    """Weighted Average Cost including commission."""
    total_qty = held_qty + buy_qty
    if total_qty <= 0:
        return 0.0
    total_cost = (held_qty * old_avg) + (buy_qty * buy_price) + commission
    return total_cost / total_qty


class TxSync:
    """Transaction-history based portfolio builder using WAC."""

    def __init__(self, portfolio_id: int):
        self.portfolio_id = portfolio_id

    def _get_or_create_portfolio(self, cursor, name: str) -> int:
        cursor.execute("SELECT id FROM portfolios WHERE name = ?", (name,))
        row = cursor.fetchone()
        if row:
            return row[0]
        cursor.execute(
            "INSERT INTO portfolios (name, created_at) VALUES (?, ?)",
            (name, datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        )
        return cursor.lastrowid

    def sync_futu_transactions(self, host: str = "127.0.0.1", port: int = 11111,
                                days: int = FUTU_MAX_HISTORY_DAYS) -> dict:
        """
        Full Futu transaction sync:
        1. Pull trade history from Futu (last N days)
        2. Import into broker_trades table (idempotent by order_id)
        3. Rebuild transactions table using WAC
        """
        from gateways.futu_gateway import FutuGateway
        gw = FutuGateway(host=host, port=port)

        try:
            trades = gw.get_transaction_history(days=days)
        except Exception as e:
            return {"error": str(e)}

        # Also pull snapshot for current prices and cash
        try:
            snapshot = gw.get_snapshot()
        except Exception as e:
            snapshot = None
            logger.warning(f"TxSync: Could not get Futu snapshot: {e}")

        portfolio_name = "Futu Sync Futu_Primary"
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        try:
            _ensure_tables(cursor)
            portfolio_id = self._get_or_create_portfolio(cursor, portfolio_name)

            # Import trades (skip duplicates by order_id)
            imported = 0
            for t in trades:
                if t.order_id:
                    cursor.execute(
                        "SELECT id FROM broker_trades WHERE portfolio_id=? AND order_id=?",
                        (portfolio_id, t.order_id)
                    )
                    if cursor.fetchone():
                        continue  # Already imported

                cursor.execute("""
                    INSERT INTO broker_trades 
                    (portfolio_id, broker, trade_date, symbol, side, quantity, price, commission, currency, order_id)
                    VALUES (?, 'FUTU', ?, ?, ?, ?, ?, ?, ?, ?)
                """, (portfolio_id, t.trade_date, t.symbol, t.side, t.quantity,
                       t.price, t.commission, t.currency, t.order_id))
                imported += 1

            conn.commit()

            # Rebuild transactions from all broker_trades for this portfolio
            result = self._rebuild_from_trades(cursor, conn, portfolio_id, snapshot)

            # Update sync metadata
            warning = None
            if days >= FUTU_MAX_HISTORY_DAYS:
                warning = (f"History limited to last {FUTU_MAX_HISTORY_DAYS} days. "
                           "Positions held longer are included as opening entries.")

            cursor.execute("""
                INSERT OR REPLACE INTO sync_metadata 
                (portfolio_id, broker, last_tx_sync_at, history_days, history_warning)
                VALUES (?, 'FUTU', ?, ?, ?)
            """, (portfolio_id, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), days, warning))
            conn.commit()

            return {
                "status": "success",
                "portfolio_id": portfolio_id,
                "portfolio_name": portfolio_name,
                "trades_imported": imported,
                "history_days": days,
                "warning": warning,
                **result
            }
        except Exception as e:
            conn.rollback()
            logger.error(f"TxSync Futu error: {e}")
            return {"error": str(e)}
        finally:
            conn.close()

    def sync_ib_transactions(self, host: str = "127.0.0.1", port: int = 7497,
                              client_id: int = 101, account_id: str = None) -> dict:
        """IB transaction sync (uses today's fills from ib_insync)."""
        from gateways.ib_gateway import IBGateway
        gw = IBGateway(host=host, port=port, client_id=client_id)

        try:
            trades = gw.get_transaction_history()
            snapshots = gw.get_snapshot_all()
        except Exception as e:
            return {"error": str(e)}

        results = []
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        try:
            _ensure_tables(cursor)

            for snap in snapshots:
                if account_id and snap.account_id != account_id:
                    continue

                portfolio_name = f"IB Sync {snap.account_id}"
                portfolio_id = self._get_or_create_portfolio(cursor, portfolio_name)

                imported = 0
                for t in trades:
                    if t.order_id:
                        cursor.execute(
                            "SELECT id FROM broker_trades WHERE portfolio_id=? AND order_id=?",
                            (portfolio_id, t.order_id)
                        )
                        if cursor.fetchone():
                            continue
                    cursor.execute("""
                        INSERT INTO broker_trades
                        (portfolio_id, broker, trade_date, symbol, side, quantity, price, commission, currency, order_id)
                        VALUES (?, 'IB', ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (portfolio_id, t.trade_date, t.symbol, t.side,
                           t.quantity, t.price, t.commission, t.currency, t.order_id))
                    imported += 1

                conn.commit()

                warning = ("IB executions() only returns today's fills. For full history, "
                           "use IB Flex Query export.")
                result = self._rebuild_from_trades(cursor, conn, portfolio_id, snap)

                cursor.execute("""
                    INSERT OR REPLACE INTO sync_metadata
                    (portfolio_id, broker, last_tx_sync_at, history_days, history_warning)
                    VALUES (?, 'IB', ?, ?, ?)
                """, (portfolio_id, datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                       IB_MAX_HISTORY_DAYS, warning))
                conn.commit()

                results.append({
                    "account": snap.account_id,
                    "portfolio_id": portfolio_id,
                    "trades_imported": imported,
                    "warning": warning,
                    **result
                })

            return {"status": "success", "accounts": results}
        except Exception as e:
            conn.rollback()
            return {"error": str(e)}
        finally:
            conn.close()

    def _rebuild_from_trades(self, cursor, conn, portfolio_id: int, snapshot) -> dict:
        """
        Rebuild the transactions table from broker_trades using WAC.
        Also writes current_price to price_cache from snapshot if available.
        """
        # Fetch all trades sorted by date
        cursor.execute("""
            SELECT trade_date, symbol, side, quantity, price, commission, currency
            FROM broker_trades
            WHERE portfolio_id = ?
            ORDER BY trade_date ASC, id ASC
        """, (portfolio_id,))
        rows = cursor.fetchall()

        # WAC ledger: symbol -> {qty, avg_cost}
        ledger: Dict[str, dict] = {}
        cash_flows: Dict[str, float] = {}  # currency -> net cash

        for trade_date, symbol, side, qty, price, commission, currency in rows:
            if symbol not in ledger:
                ledger[symbol] = {"qty": 0.0, "avg_cost": 0.0}

            entry = ledger[symbol]

            if side == "BUY":
                new_avg = _calc_wac(entry["qty"], entry["avg_cost"], qty, price, commission)
                entry["qty"] += qty
                entry["avg_cost"] = new_avg
                # Cash outflow
                cash_flows[currency] = cash_flows.get(currency, 0) - (qty * price + commission)

            elif side == "SELL":
                entry["qty"] -= qty
                if entry["qty"] <= 0:
                    entry["qty"] = 0.0
                    entry["avg_cost"] = 0.0
                # Cash inflow
                cash_flows[currency] = cash_flows.get(currency, 0) + (qty * price - commission)

        # Clear existing transactions for this portfolio
        cursor.execute("DELETE FROM transactions WHERE portfolio_id = ?", (portfolio_id,))

        today = datetime.now().strftime("%Y-%m-%d")

        # ── Authorative Cash Management ──────────────────────────────────────────
        # FinalCash = SnapshotCash (if exists) else ComputedCashFlow
        snapshot_cash_val = sum(snapshot.cash_balances.values()) if snapshot and snapshot.cash_balances else 0
        computed_cash_val = sum(cash_flows.values())
        
        # authoritative_cash is what the broker says we have
        authoritative_cash = snapshot_cash_val if (snapshot and snapshot.cash_balances) else computed_cash_val
        
        # Positions Cost (to counterbalance flow-based engine)
        total_pos_cost = sum(entry['qty'] * entry['avg_cost'] for entry in ledger.values())
        
        # Write one single CASH_IN that covers BOTH unspent cash and the cost of all buys
        cursor.execute("""
            INSERT INTO transactions (portfolio_id, date, isin, type, shares, price)
            VALUES (?, ?, ?, 'CASH_IN', 1.0, ?)
        """, (portfolio_id, today, "CASH_USD", float(authoritative_cash + total_pos_cost)))

        # Write positions with WAC cost
        positions_written = 0
        for symbol, entry in ledger.items():
            if entry["qty"] <= 0:
                continue  # Position fully closed

            cursor.execute("""
                INSERT INTO transactions (portfolio_id, date, isin, type, shares, price)
                VALUES (?, ?, ?, 'BUY', ?, ?)
            """, (portfolio_id, today, symbol, entry["qty"], entry["avg_cost"]))
            positions_written += 1

            # Write current_price to price_cache from broker snapshot
            if snapshot:
                for pos in snapshot.positions:
                    if pos.symbol == symbol and pos.current_price > 0:
                        cursor.execute("""
                            INSERT OR REPLACE INTO price_cache (isin, date, price)
                            VALUES (?, ?, ?)
                        """, (symbol, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), pos.current_price))

        conn.commit()
        return {"positions_written": positions_written, "status": "completed"}
