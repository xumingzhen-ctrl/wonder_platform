"""
BrokerPriceProvider
===================
Provides real-time market prices sourced directly from broker APIs.

Priority chain for get_price() / batch_get_prices():
  1. Futu OpenD  — uses get_market_snapshot() — HK stocks ONLY
  2. Returns None → caller falls back to yfinance / premium APIs

FX rates and US stock prices are intentionally NOT fetched here.
The IB API runs on a separate asyncio event loop (inside broker_sync.py),
and mixing it into the FastAPI sync thread causes "coroutine never awaited"
warnings and client_id conflicts. All non-HK data goes through yfinance.
"""
import logging
import threading
from typing import Optional

logger = logging.getLogger(__name__)

# ── Futu optional import ──────────────────────────────────────────────────────
try:
    from futu import OpenQuoteContext, RET_OK
    _FUTU_AVAILABLE = True
except ImportError:
    _FUTU_AVAILABLE = False


class BrokerPriceProvider:
    """
    Singleton-style broker price provider.
    Thread-safe via RLock for Futu connections.
    """

    _futu_host: str = "127.0.0.1"
    _futu_port: int = 11111

    _futu_ctx = None
    _futu_lock = threading.RLock()  # RLock: reentrant, avoids deadlock

    # ─── Configuration ────────────────────────────────────────────────────────
    @classmethod
    def configure(cls,
                  futu_host: str = "127.0.0.1", futu_port: int = 11111,
                  ib_host: str = "127.0.0.1", ib_port: int = 7497,
                  ib_client_id: int = 101):
        """
        Configure broker connections.
        ib_* params are kept for API compatibility (used for sync only, not pricing).
        """
        cls._futu_host = futu_host
        cls._futu_port = futu_port
        # Reset Futu connection on reconfiguration
        with cls._futu_lock:
            if cls._futu_ctx:
                try:
                    cls._futu_ctx.close()
                except Exception:
                    pass
            cls._futu_ctx = None
        logger.info(f"BrokerPriceProvider: configured Futu={futu_host}:{futu_port}")

    # ─── Symbol normalisation ─────────────────────────────────────────────────
    @staticmethod
    def _is_hk(isin: str) -> bool:
        return isin.upper().endswith(".HK")

    @staticmethod
    def _to_futu_hk(isin: str) -> str:
        """
        Convert HK ticker to Futu snapshot code.
        '700.HK', '0700.HK', '9988.HK'  ->  'HK.00700', 'HK.09988'
        Futu always uses 5-digit zero-padded codes.
        """
        num = isin.upper().replace(".HK", "").lstrip("0") or "0"
        return f"HK.{num.zfill(5)}"

    # ─── Futu availability cache ──────────────────────────────────────────────
    _futu_unavailable_until: float = 0  # epoch seconds; skip retry until this time

    # ─── Futu connection ──────────────────────────────────────────────────────
    @classmethod
    def _is_futu_port_open(cls) -> bool:
        """
        Quick socket probe (1s timeout) to check if Futu OpenD is listening.
        This runs BEFORE creating any OpenQuoteContext, completely avoiding
        the SDK's internal retry loop when OpenD is not running.
        """
        import socket, time
        # Honour the backoff window: don't probe for 60s after a failed attempt
        if time.time() < cls._futu_unavailable_until:
            return False
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1.0)
            result = sock.connect_ex((cls._futu_host, cls._futu_port))
            sock.close()
            if result == 0:
                return True
            else:
                # Back off: don't retry for 60 seconds
                cls._futu_unavailable_until = time.time() + 60
                logger.debug(f"BrokerPriceProvider: Futu port {cls._futu_port} not open, backing off 60s.")
                return False
        except Exception:
            cls._futu_unavailable_until = time.time() + 60
            return False

    @classmethod
    def _get_futu_ctx(cls) -> Optional[object]:
        if not _FUTU_AVAILABLE:
            return None
        # Pre-check: is the port even open?  Avoids SDK's infinite retry loop.
        if not cls._is_futu_port_open():
            return None
        with cls._futu_lock:
            if cls._futu_ctx is None:
                try:
                    ctx = OpenQuoteContext(host=cls._futu_host, port=cls._futu_port)
                    cls._futu_ctx = ctx
                    logger.info(f"BrokerPriceProvider: Futu connected {cls._futu_host}:{cls._futu_port}")
                except Exception as e:
                    logger.debug(f"BrokerPriceProvider: Futu connect failed: {e}")
        return cls._futu_ctx

    @classmethod
    def _futu_snapshot(cls, codes: list) -> dict:
        """
        Fetch get_market_snapshot for a list of Futu codes.
        Returns dict: {futu_code -> last_price}
        """
        ctx = cls._get_futu_ctx()
        if not ctx:
            return {}
        try:
            ret, df = ctx.get_market_snapshot(codes)
            if ret == RET_OK and not df.empty:
                results = {}
                for _, row in df.iterrows():
                    lp = row.get('last_price')
                    if lp not in (None, '', 'N/A'):
                        try:
                            price = float(lp)
                            if price > 0:
                                results[row['code']] = price
                        except (ValueError, TypeError):
                            pass
                return results
            else:
                logger.debug(f"BrokerPriceProvider: Futu snapshot failed for {codes}: {df}")
        except Exception as e:
            logger.debug(f"BrokerPriceProvider: Futu snapshot error: {e}")
            with cls._futu_lock:
                cls._futu_ctx = None  # force reconnect next time
        return {}

    # ─── Public API ───────────────────────────────────────────────────────────
    @classmethod
    def get_price(cls, isin: str) -> Optional[float]:
        """
        Return real-time price in native currency for HK stocks via Futu.
        Returns None for non-HK stocks (caller uses yfinance).
        """
        if not cls._is_hk(isin):
            return None  # US / other -> yfinance in caller

        futu_code = cls._to_futu_hk(isin)
        prices = cls._futu_snapshot([futu_code])
        price = prices.get(futu_code)
        if price:
            logger.info(f"BrokerPriceProvider: [Futu] {isin} = {price} HKD")
        return price

    @classmethod
    def get_fx_rate(cls, from_curr: str, to_curr: str = "USD") -> Optional[float]:
        """
        Futu does not expose reliable FX data for non-HK pairs.
        Return None so callers fall back to yfinance.
        """
        if from_curr.upper() == to_curr.upper():
            return 1.0
        return None  # yfinance handles all FX

    @classmethod
    def batch_get_prices(cls, isins: list) -> dict:
        """
        Batch-fetch prices for multiple ISINs.
        - HK stocks: single Futu snapshot call (fast, no rate limit)
        - Non-HK: returns nothing here; caller uses yfinance concurrently
        Returns dict: {isin -> price} for whichever isins succeed.
        """
        results = {}

        hk_isins = [i for i in isins if cls._is_hk(i)]
        # non-HK intentionally skipped — yfinance is used by caller

        if hk_isins:
            futu_codes = [cls._to_futu_hk(i) for i in hk_isins]
            prices = cls._futu_snapshot(futu_codes)
            for isin, fc in zip(hk_isins, futu_codes):
                if fc in prices:
                    results[isin] = prices[fc]
                    logger.info(f"BrokerPriceProvider: [Futu batch] {isin} = {prices[fc]}")

        return results


# Module-level singleton
BrokerPrices = BrokerPriceProvider()
