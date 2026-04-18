"""
Broker Gateway Base Models
==========================
Standardized data classes used by all broker gateways.
Each gateway translates broker-native data into these structures.
"""
from dataclasses import dataclass, field
from typing import List, Dict, Optional


@dataclass
class BrokerPosition:
    """A single position in a brokerage account."""
    symbol: str           # Normalized (e.g., "0700.HK", "AAPL")
    shares: float
    avg_cost: float       # May be negative (house money / Futu trailing cost)
    current_price: float  # Latest known price from broker
    currency: str


@dataclass
class BrokerTrade:
    """A single executed trade (order fill) from broker history."""
    trade_date: str       # ISO format "YYYY-MM-DD"
    symbol: str           # Normalized
    side: str             # "BUY" or "SELL"
    quantity: float
    price: float
    commission: float     # Included in cost basis per user config
    currency: str
    exchange: str = ""
    order_id: str = ""


@dataclass
class BrokerSnapshot:
    """Complete account state from broker at a point in time."""
    account_id: str
    broker: str           # "FUTU" | "IB" | "TIGER"
    snapshot_time: str    # ISO datetime
    positions: List[BrokerPosition] = field(default_factory=list)
    cash_balances: Dict[str, float] = field(default_factory=dict)
    net_liquidation: float = 0.0
    history_days_available: int = 90   # How many days of trade history we can pull
    history_warning: Optional[str] = None  # Warning message if history is limited
