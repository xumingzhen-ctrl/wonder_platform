"""
Futu Gateway
============
Translates Futu OpenD API responses into standardized BrokerSnapshot / BrokerTrade objects.
All symbol normalization lives here.
"""
import logging
from datetime import datetime, timedelta
from typing import List, Optional

from gateways.base import BrokerSnapshot, BrokerPosition, BrokerTrade

logger = logging.getLogger(__name__)

try:
    from futu import (
        OpenSecTradeContext, OpenQuoteContext,
        TrdMarket, SecurityFirm, TrdSide, RET_OK
    )
    _FUTU_AVAILABLE = True
except ImportError:
    _FUTU_AVAILABLE = False

# ── US Ticker overrides (Futu uses simplified names) ─────────────────────────
US_OVERRIDES = {
    "BRK": "BRK-B",
    "BF":  "BF-B",
}


class FutuGateway:
    """Gateway to Futu OpenD for positions and trade history."""

    def __init__(self, host: str = "127.0.0.1", port: int = 11111):
        self.host = host
        self.port = port

    # ── Symbol normalization ──────────────────────────────────────────────────

    @staticmethod
    def normalize_symbol(futu_code: str) -> str:
        """
        Convert Futu code to our internal format.
        HK.00700 -> 0700.HK
        US.AAPL  -> AAPL
        US.BRK   -> BRK-B
        """
        if futu_code.startswith("HK."):
            numeric = futu_code.split(".")[1].lstrip("0") or "0"
            return f"{numeric.zfill(4)}.HK"
        if futu_code.startswith("US."):
            ticker = futu_code.split(".")[1]
            return US_OVERRIDES.get(ticker, ticker)
        return futu_code

    # ── Snapshot ──────────────────────────────────────────────────────────────

    def get_snapshot(self) -> BrokerSnapshot:
        """Fetch current positions and cash balances from Futu."""
        if not _FUTU_AVAILABLE:
            raise RuntimeError("futu-api not installed")

        snapshot_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        positions: List[BrokerPosition] = []
        cash_balances = {}
        net_liquidation = 0.0

        trd_ctx = OpenSecTradeContext(
            filter_trdmarket=TrdMarket.HK, host=self.host, port=self.port,
            security_firm=SecurityFirm.FUTUSECURITIES
        )
        try:
            # Account info (cash)
            ret, acc_df = trd_ctx.accinfo_query()
            if ret == RET_OK and not acc_df.empty:
                row = acc_df.iloc[0]
                currency = row.get("currency", "HKD") if "currency" in acc_df.columns else "HKD"
                cash_balances[currency] = float(row["cash"])
                net_liquidation = float(row.get("market_val", 0)) + float(row["cash"])

            # Positions
            ret, pos_df = trd_ctx.position_list_query()
            if ret != RET_OK:
                raise RuntimeError(f"Futu position query failed: {pos_df}")

            for _, row in pos_df.iterrows():
                symbol = self.normalize_symbol(row["code"])
                shares = float(row["qty"])
                if shares <= 0:
                    logger.warning(f"FutuGateway: Skipping {symbol} — shares={shares}")
                    continue
                avg_cost = float(row["cost_price"])  # May be negative (house money)
                nominal = row.get("nominal_price", None)
                current_price = float(nominal) if nominal and float(nominal) > 0 else 0.0
                # Currency from Futu code
                currency = "HKD" if row["code"].startswith("HK.") else "USD"
                positions.append(BrokerPosition(
                    symbol=symbol, shares=shares, avg_cost=avg_cost,
                    current_price=current_price, currency=currency
                ))
        finally:
            trd_ctx.close()

        return BrokerSnapshot(
            account_id="Futu_Primary",
            broker="FUTU",
            snapshot_time=snapshot_time,
            positions=positions,
            cash_balances=cash_balances,
            net_liquidation=net_liquidation,
        )

    # ── Transaction History ───────────────────────────────────────────────────

    def get_transaction_history(self, days: int = 90) -> List[BrokerTrade]:
        """
        Fetch executed trades from Futu for the last N days.
        Futu API max is typically 90 days.
        Returns an empty list with a warning if connection fails.
        """
        if not _FUTU_AVAILABLE:
            raise RuntimeError("futu-api not installed")

        trades: List[BrokerTrade] = []
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        start_str = start_date.strftime("%Y-%m-%d %H:%M:%S")
        end_str = end_date.strftime("%Y-%m-%d %H:%M:%S")

        trd_ctx = OpenSecTradeContext(
            filter_trdmarket=TrdMarket.HK, host=self.host, port=self.port,
            security_firm=SecurityFirm.FUTUSECURITIES
        )
        try:
            ret, history_df = trd_ctx.history_order_list_query(
                status_filter_list=[], start=start_str, end=end_str
            )
            if ret != RET_OK:
                logger.error(f"FutuGateway: Trade history query failed: {history_df}")
                return trades

            for _, row in history_df.iterrows():
                # Only process filled orders
                if str(row.get("order_status", "")).upper() not in ("FILLED_ALL", "FILLED_PART"):
                    continue

                symbol = self.normalize_symbol(str(row["code"]))
                side_raw = str(row.get("trd_side", "")).upper()
                side = "BUY" if "BUY" in side_raw else "SELL"
                qty = float(row.get("dealt_qty", 0))
                price = float(row.get("dealt_avg_price", 0))
                commission = float(row.get("commission", 0))
                currency = "HKD" if str(row["code"]).startswith("HK.") else "USD"

                # Parse trade date
                create_time = str(row.get("create_time", ""))
                trade_date = create_time[:10] if create_time else end_date.strftime("%Y-%m-%d")

                if qty > 0 and price > 0:
                    trades.append(BrokerTrade(
                        trade_date=trade_date,
                        symbol=symbol,
                        side=side,
                        quantity=qty,
                        price=price,
                        commission=commission,
                        currency=currency,
                        order_id=str(row.get("order_id", ""))
                    ))
        finally:
            trd_ctx.close()

        logger.info(f"FutuGateway: Fetched {len(trades)} trades in last {days} days")
        return trades
