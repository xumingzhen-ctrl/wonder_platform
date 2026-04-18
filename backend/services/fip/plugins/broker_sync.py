import logging
import json
from datetime import datetime
import asyncio

# Optional imports for broker libraries
try:
    from ib_insync import IB, Stock, Forex, Contract
except ImportError:
    IB = None

try:
    from futu import OpenSecTradeContext, TrdMarket, SecurityFirm, RET_OK
except ImportError:
    OpenSecTradeContext = None

logger = logging.getLogger(__name__)

class BrokerSyncPlugin:
    """
    Plugin to sync portfolio positions from Interactive Brokers and FUTU.
    Normalizes symbols for the PortfolioEngine.
    Supports Advisor (Multi-account) syncing for IB.
    """

    @staticmethod
    def normalize_symbol(symbol: str, exchange: str = "", provider: str = "IB") -> str:
        """
        Converts broker-specific symbols to our system's format.
        HK stocks: always 4-digit zero-padded Yahoo format (e.g. 0700.HK)
        US stocks: plain ticker, with special-case mappings (e.g. BRK -> BRK-B)
        """
        # Special-case US ticker overrides (broker uses simplified names)
        US_OVERRIDES = {
            "BRK": "BRK-B",   # Berkshire Hathaway Class B
            "BF": "BF-B",     # Brown-Forman Class B
        }

        if provider == "FUTU":
            # FUTU: HK.00700 -> 0700.HK, US.AAPL -> AAPL
            if symbol.startswith("HK."):
                # Strip the HK. prefix, then zero-pad to 4 digits
                numeric = symbol.split(".")[1].lstrip("0") or "0"
                return f"{numeric.zfill(4)}.HK"
            if symbol.startswith("US."):
                ticker = symbol.split(".")[1]
                return US_OVERRIDES.get(ticker, ticker)
            return symbol

        if provider == "IB":
            # IB: Symbol '700' Exch 'SEHK' -> 0700.HK
            if exchange == "SEHK":
                padded = symbol.lstrip("0") or "0"
                return f"{padded.zfill(4)}.HK"
            return US_OVERRIDES.get(symbol, symbol)
            
        return symbol

    def sync_ib(self, host: str, port: int, client_id: int):
        if not IB:
            return {"error": "ib_insync library not installed"}
        
        # ib_insync needs an event loop. In FastAPI's thread pool, we create a new one.
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        ib = IB()
        try:
            ib.connect(host, port, clientId=client_id, timeout=10)
            
            # 1. Fetch only positions (skips automatic order requests)
            all_positions = ib.positions()
            account_data = {} # account_id -> {positions: [], cash_balances: {}}
            
            for p in all_positions:
                acc_id = p.account
                if acc_id not in account_data:
                    account_data[acc_id] = {"positions": [], "cash_balances": {}}
                
                norm_symbol = self.normalize_symbol(p.contract.symbol, p.contract.exchange, "IB")
                avg_cost = float(p.avgCost)
                shares = float(p.position)
                # Skip short positions and bad cost data
                if shares <= 0 or avg_cost <= 0:
                    logger.warning(f"IB: Skipping {norm_symbol} — shares={shares}, avg_cost={avg_cost} (short or invalid)")
                    continue
                account_data[acc_id]["positions"].append({
                    "symbol": norm_symbol,
                    "shares": shares,
                    "avg_cost": avg_cost,
                    "current_price": avg_cost  # IB positions() misses live price without reqMktData
                })
            
            # 2. Fetch account summaries (including cash) for all accounts
            # In Advisor accounts, this returns values for all managed accounts.
            summaries = ib.accountSummary()
            for item in summaries:
                acc_id = item.account
                if acc_id not in account_data:
                    # Case where account has cash but no positions
                    account_data[acc_id] = {"positions": [], "cash_balances": {}}
                
                # Capture all currencies
                if item.tag == 'TotalCashValue' and item.currency != 'BASE':
                    account_data[acc_id]["cash_balances"][item.currency] = float(item.value)
            
            # Convert to a flat list for the API response
            results = []
            for acc_id, data in account_data.items():
                results.append({
                    "account": acc_id,
                    "cash_balances": data["cash_balances"],
                    "positions": data["positions"]
                })
            
            ib.disconnect()
            
            # If no positions/cash found at all, but connected
            if not results:
                # Might be a single empty account
                managed = ib.managedAccounts()
                if managed:
                   results = [{"account": m, "cash_balances": {}, "positions": []} for m in managed]

            return {"accounts": results}
        except Exception as e:
            logger.error(f"IB Sync Error: {e}")
            return {"error": str(e)}
        finally:
            loop.close()

    def sync_futu(self, host: str, port: int):
        if not OpenSecTradeContext:
            return {"error": "futu-api library not installed"}
        
        trd_ctx = OpenSecTradeContext(filter_trdmarket=TrdMarket.HK, host=host, port=port, security_firm=SecurityFirm.FUTUSECURITIES)
        try:
            ret, pos_df = trd_ctx.position_list_query()
            if ret != RET_OK:
                return {"error": f"Futu position query failed: {pos_df}"}
            
            ret, acc_df = trd_ctx.accinfo_query()
            cash_balances = {}
            if ret == RET_OK and not acc_df.empty:
                # Futu returns currency in acc_df if we query correctly.
                # Since we filter HK market context above, it often returns HKD or USD
                # For safety, let's assume HKD if not strictly specified, or use the 'currency' column if it exists
                currency = acc_df.iloc[0]['currency'] if 'currency' in acc_df.columns else 'HKD'
                cash_balances[currency] = float(acc_df.iloc[0]['cash'])

            results = []
            for _, row in pos_df.iterrows():
                norm_symbol = self.normalize_symbol(row['code'], provider="FUTU")
                avg_cost = float(row['cost_price'])
                shares = float(row['qty'])
                # FUTU returns negative cost_price for stocks where realized profit > initial investment.
                # We should only skip if shares <= 0.
                if shares <= 0:
                    logger.warning(f"Futu: Skipping {norm_symbol} — shares={shares} (short or invalid)")
                    continue
                # nominal_price is Futu's current market price
                nominal_price = row.get('nominal_price', None)
                current_price = float(nominal_price) if nominal_price and float(nominal_price) > 0 else 0
                results.append({
                    "symbol": norm_symbol,
                    "shares": shares,
                    "avg_cost": avg_cost,
                    "current_price": current_price
                })
            
            trd_ctx.close()
            # FUTU currently returns single account info
            return {"accounts": [{"account": "Futu_Primary", "cash_balances": cash_balances, "positions": results}]}
        except Exception as e:
            logger.error(f"Futu Sync Error: {e}")
            if 'trd_ctx' in locals():
                trd_ctx.close()
            return {"error": str(e)}
