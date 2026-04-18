"""
IB Gateway
==========
Translates ib_insync API responses into standardized BrokerSnapshot / BrokerTrade objects.
"""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import List

from gateways.base import BrokerSnapshot, BrokerPosition, BrokerTrade

logger = logging.getLogger(__name__)

try:
    from ib_insync import IB, Stock, Forex, Contract
    _IB_AVAILABLE = True
except ImportError:
    _IB_AVAILABLE = False

US_OVERRIDES = {
    "BRK": "BRK-B",
    "BF":  "BF-B",
}


class IBGateway:
    """Gateway to Interactive Brokers via ib_insync."""

    def __init__(self, host: str = "127.0.0.1", port: int = 7497, client_id: int = 101):
        self.host = host
        self.port = port
        self.client_id = client_id

    @staticmethod
    def normalize_symbol(symbol: str, exchange: str = "") -> str:
        if exchange == "SEHK":
            padded = symbol.lstrip("0") or "0"
            return f"{padded.zfill(4)}.HK"
        return US_OVERRIDES.get(symbol, symbol)

    def _connect(self) -> IB:
        """Create a new IB connection in a fresh event loop."""
        if not _IB_AVAILABLE:
            raise RuntimeError("ib_insync not installed")
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        ib = IB()
        ib.connect(self.host, self.port, clientId=self.client_id, timeout=10)
        return ib

    # ── Snapshot ──────────────────────────────────────────────────────────────

    def get_snapshot(self) -> BrokerSnapshot:
        """Fetch current positions and cash from IB."""
        ib = self._connect()
        snapshot_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        account_positions = {}  # account_id -> {positions, cash}

        try:
            for p in ib.positions():
                acc = p.account
                if acc not in account_positions:
                    account_positions[acc] = {"positions": [], "cash": {}}

                symbol = self.normalize_symbol(p.contract.symbol, p.contract.exchange)
                shares = float(p.position)
                avg_cost = float(p.avgCost)
                if shares <= 0:
                    continue
                currency = "HKD" if p.contract.exchange == "SEHK" else "USD"
                account_positions[acc]["positions"].append(
                    BrokerPosition(symbol=symbol, shares=shares, avg_cost=avg_cost,
                                   current_price=0.0, currency=currency)
                )

            for item in ib.accountSummary():
                acc = item.account
                if acc not in account_positions:
                    account_positions[acc] = {"positions": [], "cash": {}}
                if item.tag == "TotalCashValue" and item.currency != "BASE":
                    account_positions[acc]["cash"][item.currency] = float(item.value)

            ib.disconnect()
        except Exception as e:
            logger.error(f"IBGateway snapshot error: {e}")
            raise

        # Build one snapshot per account
        snapshots = []
        for acc_id, data in account_positions.items():
            snapshots.append(BrokerSnapshot(
                account_id=acc_id,
                broker="IB",
                snapshot_time=snapshot_time,
                positions=data["positions"],
                cash_balances=data["cash"],
            ))

        # If multi-account, return all; caller can pick. For now return list via accounts attribute.
        # We return the first account's snapshot but embed all as a list.
        if not snapshots:
            return BrokerSnapshot(account_id="IB_Empty", broker="IB", snapshot_time=snapshot_time)
        
        # Pack all accounts into the first snapshot's account_id for downstream compatibility
        # Callers that want multi-account should use get_snapshot_all()
        return snapshots[0]

    def get_snapshot_all(self) -> List[BrokerSnapshot]:
        """Returns one BrokerSnapshot per IB account."""
        ib = self._connect()
        snapshot_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        account_positions = {}

        try:
            for p in ib.positions():
                acc = p.account
                if acc not in account_positions:
                    account_positions[acc] = {"positions": [], "cash": {}}
                symbol = self.normalize_symbol(p.contract.symbol, p.contract.exchange)
                shares = float(p.position)
                if shares <= 0:
                    continue
                currency = "HKD" if p.contract.exchange == "SEHK" else "USD"
                account_positions[acc]["positions"].append(
                    BrokerPosition(symbol=symbol, shares=shares, avg_cost=float(p.avgCost),
                                   current_price=0.0, currency=currency)
                )
            for item in ib.accountSummary():
                acc = item.account
                if acc not in account_positions:
                    account_positions[acc] = {"positions": [], "cash": {}}
                if item.tag == "TotalCashValue" and item.currency != "BASE":
                    account_positions[acc]["cash"][item.currency] = float(item.value)
            ib.disconnect()
        except Exception as e:
            logger.error(f"IBGateway multi-account snapshot error: {e}")
            raise

        return [
            BrokerSnapshot(
                account_id=acc_id, broker="IB", snapshot_time=snapshot_time,
                positions=d["positions"], cash_balances=d["cash"]
            )
            for acc_id, d in account_positions.items()
        ]

    # ── Transaction History ───────────────────────────────────────────────────

    def get_transaction_history(self, days: int = 90) -> List[BrokerTrade]:
        """
        Fetch executed trades from IB Flex Query or executions().
        Note: ib_insync's executions() returns today's trades only.
        For full history, Flex Query via the IB website is needed.
        We use executions() for now and document the limitation.
        """
        ib = self._connect()
        trades: List[BrokerTrade] = []
        today_str = datetime.now().strftime("%Y-%m-%d")

        try:
            fills = ib.fills()
            for fill in fills:
                contract = fill.contract
                execution = fill.execution
                commission_report = fill.commissionReport

                symbol = self.normalize_symbol(contract.symbol, contract.exchange)
                side = "BUY" if execution.side.upper() == "BOT" else "SELL"
                qty = float(abs(execution.shares))
                price = float(execution.avgPrice)
                commission = float(commission_report.commission) if commission_report else 0.0
                currency = contract.currency or "USD"
                trade_date = str(execution.time)[:10] if execution.time else today_str

                if qty > 0 and price > 0:
                    trades.append(BrokerTrade(
                        trade_date=trade_date, symbol=symbol, side=side,
                        quantity=qty, price=price, commission=commission,
                        currency=currency, order_id=str(execution.orderId)
                    ))
            ib.disconnect()
        except Exception as e:
            logger.error(f"IBGateway trade history error: {e}")
            raise

        logger.info(f"IBGateway: Fetched {len(trades)} fills")
        return trades
