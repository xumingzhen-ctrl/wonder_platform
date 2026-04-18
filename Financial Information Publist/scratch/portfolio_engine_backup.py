import pandas as pd
from datetime import datetime, timedelta
from data_provider import RealTime
import sqlite3
import os
import json
import logging
import concurrent
import concurrent.futures

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(__file__), "portfolio.db")

class PortfolioEngine:
    def __init__(self, portfolio_id: int):
        self.portfolio_id = portfolio_id
        self.conn = sqlite3.connect(DB_PATH)
        self.conn.row_factory = sqlite3.Row
        self.load_portfolio_meta()
        self.load_transactions()
        
    def close(self):
        if hasattr(self, 'conn') and self.conn:
            self.conn.close()
            self.conn = None
            
    def __del__(self):
        self.close()
        
    def load_portfolio_meta(self):
        cursor = self.conn.cursor()
        cursor.execute("SELECT name, dividend_strategy, target_allocations, created_at, base_currency FROM portfolios WHERE id = ?", (self.portfolio_id,))
        row = cursor.fetchone()
        if row:
            self.name = row['name']
            self.div_strategy = row['dividend_strategy'] or 'CASH'
            self.target_allocations = json.loads(row['target_allocations']) if row['target_allocations'] else {}
            self.created_at = row['created_at']
            self.base_currency = row['base_currency'] or 'USD'
        else:
            self.name = "Unknown"
            self.div_strategy = 'CASH'
            self.target_allocations = {}
            self.created_at = datetime.now().strftime("%Y-%m-%d")
            self.base_currency = 'USD'

    def get_current_portfolio(self):
        portfolio = {}
        cash_balances = {} # isin -> balance
        
        # Process transactions
        for _, row in self.df.iterrows():
            isin = row['isin']
            q = row['shares']
            p = row['price']
            t = row['type'].upper()
            
            if t == 'CASH_IN':
                if isin.startswith("CASH_"): 
                    cash_balances[isin] = cash_balances.get(isin, 0) + p
                else: 
                    cash_balances['CASH_USD'] = cash_balances.get('CASH_USD', 0) + p
                continue
            
            if t == 'CASH_OUT':
                if isin.startswith("CASH_"): 
                    cash_balances[isin] = cash_balances.get(isin, 0) + p  # price is already negative for BUY-driven outflows
                else:
                    cash_balances['CASH_USD'] = cash_balances.get('CASH_USD', 0) + p
                continue
                
            if isin not in portfolio:
                portfolio[isin] = {'shares': 0, 'avg_cost': 0, 'total_div_cash': 0}
            
            curr = portfolio[isin]
            
            if t == 'BUY':
                q = int(q)
                cash_needed = q * p
                currency = RealTime.guess_currency_from_isin(isin)
                c_key = f"CASH_{currency}"
                cash_balances[c_key] = cash_balances.get(c_key, 0) - cash_needed
                new_shares = curr['shares'] + q
                if new_shares > 0:
                    curr['avg_cost'] = (curr['shares'] * curr['avg_cost'] + q * p) / new_shares
                curr['shares'] = new_shares
            elif t == 'SELL':
                q = int(q)
                cash_gained = q * p
                currency = RealTime.guess_currency_from_isin(isin)
                c_key = f"CASH_{currency}"
                cash_balances[c_key] = cash_balances.get(c_key, 0) + cash_gained
                curr['shares'] -= q
            elif t == 'DIV_CASH':
                currency = RealTime.guess_currency_from_isin(isin)
                c_key = f"CASH_{currency}"
                curr['total_div_cash'] += q * p
                cash_balances[c_key] = cash_balances.get(c_key, 0) + (q * p)

        # Calculate and apply dividends
        dividends_list, manual_div_isins = self.get_dividend_details(portfolio)
        for div in dividends_list:
            isin = div['isin']
            div_total = div['total_amount']
            currency = RealTime.guess_currency_from_isin(isin)
            c_key = f"CASH_{currency}"
            
            if div['type'] == 'Manual':
                portfolio[isin]['total_div_cash'] += div_total
                cash_balances[c_key] = cash_balances.get(c_key, 0) + div_total
            else:
                if self.div_strategy == 'REINVEST':
                    p_at_time = RealTime.get_historical_price(isin, div['date'])
                    if p_at_time > 0:
                        shares_to_buy = int(div_total / p_at_time)
                        portfolio[isin]['shares'] += shares_to_buy
                        cash_balances[c_key] = cash_balances.get(c_key, 0) + (div_total - (shares_to_buy * p_at_time))
                else:
                    portfolio[isin]['total_div_cash'] += div_total
                    cash_balances[c_key] = cash_balances.get(c_key, 0) + div_total

        result = {}
        for isin, data in portfolio.items():
            if data['shares'] > 0 or data['total_div_cash'] > 0:
                data['total_cost'] = data['shares'] * data['avg_cost']
                result[isin] = data
        
        # Add Cash Wallets as pseudo-assets
        has_cash = False
        for c_isin, bal in cash_balances.items():
            if bal != 0:
                has_cash = True
                result[c_isin] = {
                    'shares': 1,
                    'avg_cost': bal,
                    'total_cost': bal,
                    'total_div_cash': 0,
                    'market_value': bal,
                    'is_cash': True
                }
                
        if not has_cash:
            result['CASH_USD'] = {
                'shares': 1, 'avg_cost': 0, 'total_cost': 0,
                'total_div_cash': 0, 'market_value': 0, 'is_cash': True
            }
            
        return result

    def load_transactions(self):
        query = "SELECT date, isin, type, shares, price FROM transactions WHERE portfolio_id = ?"
        self.df = pd.read_sql_query(query, self.conn, params=(self.portfolio_id,))
        self.df['date'] = pd.to_datetime(self.df['date'])
        self.df = self.df.sort_values(by='date')

    def calculate_nav(self):
        holdings = self.get_current_portfolio()
        total_nav = 0
        details = []
        report_date = datetime.now().strftime("%Y-%m-%d %H:%M")
        
        # --- STEP 1: Batch-fetch HK prices from Futu (single API call, instant) ---
        from broker_price_provider import BrokerPriceProvider
        fetch_isins = [isin for isin in holdings.keys() if not isin.startswith('CASH_')]
        broker_prices = BrokerPriceProvider.batch_get_prices(fetch_isins)
        if broker_prices:
            logger.info(f"BrokerPriceProvider: Futu batch fetched {len(broker_prices)} HK prices")

        # --- STEP 2: Parallel yfinance prefetch for US stocks + FX (all non-HK) ---
        # include CASH_ currencies in yf_needed to avoid sequential calls in the loop
        yf_needed = [i for i in fetch_isins if i not in broker_prices]
        
        # Also pre-fetch FX rates for all cash balances
        currencies_needed = {isin.split('_')[1] for isin in holdings.keys() if isin.startswith('CASH_')}
        for c in currencies_needed:
            if c != 'USD':
                yf_needed.append(f"{c}USD=X")
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=32) as executor:
            list(executor.map(RealTime.get_market_data, yf_needed))

            
        wallet_balance = 0  # Re-aggregated wallet balance in USD base
        for isin, data in holdings.items():
            if isin.startswith('CASH_'):
                currency = isin.split('_')[1]
                fx = RealTime.get_fx_rate(currency, "USD")
                market_value = data['market_value'] * fx
                name = f"Wallet ({currency})"
                curr_price = fx
                wallet_balance += market_value
                total_nav += market_value
                sector = "Cash & Equivalents"
                country = "Global"
                cost = data['total_cost'] * fx
            else:
                market_data = RealTime.get_market_data(isin)
                fx_rate = market_data.get('fx_rate', 1.0)
                curr_price = market_data.get('base_price', market_data['price']) # Converted price
                
                # Failsafe: if the real-time API is rate-limited (price=0), fallback to historical cost basis
                if curr_price == 0 and data['avg_cost'] > 0:
                    curr_price = data['avg_cost'] * fx_rate
                    
                market_value = data['shares'] * curr_price
                name = market_data.get('name', isin)
                sector = market_data.get('sector', 'Unknown Sector')
                country = market_data.get('country', 'Unknown Region')
                
                # ── Priority: use manually-registered metadata from assets table ──
                # But only fall back to assets.sector/country if get_market_data couldn't resolve them
                # (i.e., don't override a rich lookthrough dict with a plain string)
                assets_row = self.conn.execute(
                    "SELECT name, sector, country FROM assets WHERE isin = ?", (isin,)
                ).fetchone()
                if assets_row:
                    if assets_row[0]: name = assets_row[0]
                    # Only use assets metadata if market_data returned unknown strings
                    if assets_row[1] and sector == 'Unknown Sector': sector  = assets_row[1]
                    if assets_row[2] and country == 'Unknown Region': country = assets_row[2]
                total_nav += market_value
                cost = data['total_cost'] * fx_rate
            
            # For Virtual Wallet, cost is just the current balance (yield should be 0)
            # For assets, cost is the purchase cost. Dividends are extra.
            item_pnl = market_value - cost
            item_yield = 0
            if not isin.startswith('CASH_'):
                if cost > 0:
                    item_yield = ((market_value + (data['total_div_cash'] * fx_rate) - cost) / cost * 100)
                else:
                    # If cost is <= 0 (e.g., realized profits have offset the entire initial cost),
                    # the stock represents pure "house money".
                    # Realistically yield is infinite, but we can set it to a very high number
                    # or calculate absolute percentage based on current market_value vs 1 (dummy)
                    # Let's cleanly show 999.99 for "Infinite" yield to prevent division by zero
                    item_yield = 999.99 if item_pnl > 0 else 0
            
            details.append({
                "isin": isin,
                "name": name,
                "sector": sector,
                "country": country,
                "shares": int(data['shares']) if not isin.startswith('CASH_') else 1,
                "price": curr_price,
                "market_value": round(market_value, 2),
                "total_cost": round(cost, 2),
                "dividends": round(data['total_div_cash'] * (fx_rate if not isin.startswith('CASH_') else 1), 2),
                "pnl": round(item_pnl, 2) if not isin.startswith('CASH_') else 0,
                "yield": round(item_yield, 2)
            })
            
        total_market_value = sum(d['market_value'] for d in details if not d['isin'].startswith('CASH_'))
        # Total Wealth (standard NAV) = Securities + Wallet
        # Pure Portfolio NAV (for some users) = Securities + (Original Wallet - Dividends)
        # But for simplicity, we'll let the frontend decide.
        
        return {
            "total_nav": round(total_nav, 2), 
            "total_market_value": round(total_market_value, 2),
            "wallet_balance": round(wallet_balance, 2),
            "details": details, 
            "report_date": report_date
        }

    def calculate_performance(self, nav_data=None):
        logger.info(f"Calculating performance for portfolio {self.portfolio_id}")
        if nav_data is None:
            nav_data = self.calculate_nav()
        total_market_value = nav_data['total_nav']
        
        # We need the invested cost (cash in) to calculate portfolio ROI properly
        cursor = self.conn.cursor()
        # ── FX-normalised total invested ──────────────────────────────────────
        # Read each CASH_IN row individually so we can apply the correct FX rate
        # for each currency, converting everything to USD before summing.
        cursor.execute(
            "SELECT isin, price FROM transactions WHERE portfolio_id = ? AND type = 'CASH_IN'",
            (self.portfolio_id,)
        )
        total_invested = 0.0
        for cash_row in cursor.fetchall():
            raw_isin  = cash_row[0] if isinstance(cash_row, (list, tuple)) else cash_row['isin']
            raw_price = cash_row[1] if isinstance(cash_row, (list, tuple)) else cash_row['price']
            # Determine the currency of this cash injection
            if raw_isin and raw_isin.startswith('CASH_'):
                ccy = raw_isin.split('_')[1]
            else:
                ccy = getattr(self, 'base_currency', 'USD')
            fx = RealTime.get_fx_rate(ccy, 'USD') if ccy != 'USD' else 1.0
            total_invested += float(raw_price or 0) * fx
        
        total_divs = sum([d['dividends'] for d in nav_data['details']])
        
        if total_invested == 0: 
            return {
                "total_pnl": 0, "total_divs": 0, "cumulative_roi": 0, 
                "wallet_balance": nav_data['wallet_balance'],
                "report_date": nav_data['report_date']
            }
        
        # ── CORRECT ROI: Total Return = (Current NAV - Total Invested) / Total Invested ──
        # NAV already includes: asset market values + wallet cash (which contains dividend income)
        # So (NAV - Invested) captures BOTH capital gains AND dividend income.
        total_pnl = total_market_value - total_invested
        
        cumulative_roi = total_pnl / total_invested if total_invested > 0 else 0
        
        # Calculate annualized return (CAGR)
        annualized_return = 0
        try:
            start_date = datetime.strptime(self.created_at.split(' ')[0], "%Y-%m-%d")
            days_held = (datetime.now() - start_date).days
            if days_held > 0:
                annualized_return = ((1 + cumulative_roi) ** (365 / days_held)) - 1
            else:
                annualized_return = cumulative_roi
        except Exception as e:
            logger.error(f"Annualized calc error: {e}")

        logger.info(f"Performance: PNL={total_pnl}, Divs={total_divs}, ROI={cumulative_roi}, CAGR={annualized_return}")
        return {
            "total_pnl": round(total_pnl, 2),
            "total_divs": round(total_divs, 2),
            "cumulative_roi": round(cumulative_roi * 100, 2),
            "annualized_return": round(annualized_return * 100, 2),
            "wallet_balance": nav_data['wallet_balance'],
            "start_date": self.created_at.split(' ')[0],
            "report_date": nav_data['report_date']
        }

    def get_rebalance_preview(self, as_of_date: str = None):
        """
        Generate rebalance plan.
        
        as_of_date: ISO date string (e.g. '2024-01-01') for historical simulation.
                    If None, uses today's real-time prices.
        
        Cash Dividend Reinvestment: The full portfolio NAV (including accumulated cash/dividends)
        is used as the target base, so idle dividend cash is allocated back into assets.
        Cash is listed as a row in the trades table showing before → after weight.
        """
        if not self.target_allocations: return []
        
        base_ccy = getattr(self, 'base_currency', 'USD')
        
        # ── Step 1: Determine prices (historical or real-time) ──
        def get_price(isin):
            if as_of_date:
                p = RealTime.get_historical_price(isin, as_of_date)
                if p and p > 0:
                    return p
                logger.warning(f"[Rebalance] No historical price for {isin} on {as_of_date}, using real-time.")
            market_data = RealTime.get_market_data(isin)
            return market_data.get('price', 0)
        
        # ── Step 2: Snapshot portfolio state as of given date ──
        if as_of_date:
            snapshot_df = self.df[self.df['date'].dt.strftime('%Y-%m-%d') <= as_of_date]
        else:
            snapshot_df = self.df
        
        # Compute current shares & cash from transaction ledger
        snapshot_shares = {}   # isin -> shares
        snapshot_cash   = {}   # CASH_XXX -> balance (local currency)
        for _, row in snapshot_df.iterrows():
            isin = row['isin']
            q    = float(row['shares'])
            p    = float(row['price'])
            t    = row['type'].upper()
            if t == 'CASH_IN':
                key = isin if isin.startswith('CASH_') else f'CASH_{base_ccy}'
                snapshot_cash[key] = snapshot_cash.get(key, 0) + p
            elif t == 'CASH_OUT':
                key = isin if isin.startswith('CASH_') else f'CASH_{base_ccy}'
                snapshot_cash[key] = snapshot_cash.get(key, 0) + p  # p is already negative for CASH_OUT
            elif t == 'BUY' and not isin.startswith('CASH_'):
                snapshot_shares[isin] = snapshot_shares.get(isin, 0) + int(q)
                currency = RealTime.guess_currency_from_isin(isin)
                c_key = f'CASH_{currency}'
                snapshot_cash[c_key] = snapshot_cash.get(c_key, 0) - q * p
            elif t == 'SELL' and not isin.startswith('CASH_'):
                snapshot_shares[isin] = snapshot_shares.get(isin, 0) - int(q)
                currency = RealTime.guess_currency_from_isin(isin)
                c_key = f'CASH_{currency}'
                snapshot_cash[c_key] = snapshot_cash.get(c_key, 0) + q * p
            elif t == 'DIV_CASH' and not isin.startswith('CASH_'):
                currency = RealTime.guess_currency_from_isin(isin)
                c_key = f'CASH_{currency}'
                snapshot_cash[c_key] = snapshot_cash.get(c_key, 0) + q * p

        # ── Step 2b: Include AUTO dividends up to as_of_date in cash snapshot ──
        # (Ledger only stores manual dividends; auto-dividends from yfinance are computed on-the-fly)
        cutoff = as_of_date or datetime.now().strftime('%Y-%m-%d')
        for isin, shares in snapshot_shares.items():
            if shares <= 0 or isin.startswith('CASH_'):
                continue
            try:
                first_buy_date = snapshot_df[snapshot_df['isin'] == isin]['date'].min().strftime('%Y-%m-%d')
                div_history = RealTime.get_dividend_history(isin, first_buy_date)
                currency = RealTime.guess_currency_from_isin(isin)
                c_key = f'CASH_{currency}'
                if isinstance(div_history, dict) or hasattr(div_history, 'items'):
                    for div_date, amt in div_history.items():
                        date_str = div_date.strftime('%Y-%m-%d') if hasattr(div_date, 'strftime') else str(div_date)[:10]
                        if date_str <= cutoff:
                            shares_at_time = self.get_shares_on_date(isin, date_str)
                            if shares_at_time > 0:
                                snapshot_cash[c_key] = snapshot_cash.get(c_key, 0) + shares_at_time * float(amt)
            except Exception as e:
                logger.warning(f"[Rebalance] Auto-div fetch failed for {isin}: {e}")

        # ── Step 3: Calculate total value in USD (internal normalisation) ──
        total_value     = 0.0
        asset_mvs_usd   = {}   # isin -> market value in USD
        
        for isin, shares in snapshot_shares.items():
            if shares <= 0: continue
            price = get_price(isin)
            if price <= 0: continue
            currency = RealTime.guess_currency_from_isin(isin)
            fx = RealTime.get_fx_rate(currency, 'USD') if currency != 'USD' else 1.0
            mv = shares * price * fx
            asset_mvs_usd[isin] = mv
            total_value += mv
        
        # Sum cash balances (all converted to USD)
        total_cash_usd = 0.0
        cash_by_ccy    = {}   # ccy -> local balance (for display)
        for c_key, bal in snapshot_cash.items():
            if not c_key.startswith('CASH_'): continue
            ccy = c_key.split('_')[1]
            fx  = RealTime.get_fx_rate(ccy, 'USD') if ccy != 'USD' else 1.0
            total_cash_usd += bal * fx
            cash_by_ccy[ccy] = cash_by_ccy.get(ccy, 0) + bal
        total_value += total_cash_usd
        
        if total_value <= 0:
            return []
        
        # ── Step 3b: Convert totals to base currency for display ──
        fx_base = RealTime.get_fx_rate('USD', base_ccy) if base_ccy != 'USD' else 1.0
        total_nav_base  = total_value     * fx_base
        total_cash_base = total_cash_usd  * fx_base
        
        # Primary cash display: use base_currency balance directly if available
        primary_cash_local = cash_by_ccy.get(base_ccy, total_cash_base)
        
        # ── Step 4: Build rebalance trade list ──
        preview = []
        total_target_weight = sum(self.target_allocations.values())
        # Expected cash weight after rebalance = 1 - sum(target weights)
        # (If targets sum to 1.0 exactly, cash will be near 0 after rebalance)
        cash_target_weight = max(0.0, 1.0 - total_target_weight)
        
        for isin, target_weight in self.target_allocations.items():
            target_amount_usd = total_value * target_weight
            
            price = get_price(isin)
            if price <= 0:
                logger.warning(f"[Rebalance] No price for {isin}, skipping.")
                continue
            
            market_data = RealTime.get_market_data(isin) if not as_of_date else {}
            name = market_data.get('name', isin)
            
            currency = RealTime.guess_currency_from_isin(isin)
            fx = RealTime.get_fx_rate(currency, 'USD') if currency != 'USD' else 1.0
            target_amount_local = target_amount_usd / fx if fx > 0 else target_amount_usd
            target_shares       = int(target_amount_local / price)
            
            current_shares = snapshot_shares.get(isin, 0)
            current_mv     = asset_mvs_usd.get(isin, 0)
            current_weight = current_mv / total_value if total_value > 0 else 0
            
            diff = target_shares - current_shares
            if abs(diff) > 0:
                preview.append({
                    "isin":           isin,
                    "name":           name,
                    "is_cash":        False,
                    "action":         "BUY" if diff > 0 else "SELL",
                    "shares":         abs(diff),
                    "price":          price,
                    "currency":       currency,
                    "amount":         round(abs(diff) * price, 2),
                    "amount_usd":     round(abs(diff) * price * fx, 2),
                    "current_weight": round(current_weight * 100, 2),
                    "target_weight":  round(target_weight * 100, 2)
                })
        
        # ── Step 5: Append Cash as a pseudo-asset row ──
        cash_current_weight = total_cash_usd / total_value if total_value > 0 else 0
        preview.append({
            "isin":           f"CASH_{base_ccy}",
            "name":           f"Cash & Equivalents ({base_ccy})",
            "is_cash":        True,
            "action":         "HOLD" if cash_target_weight > 0.01 else "DEPLOY",
            "shares":         None,
            "price":          None,
            "currency":       base_ccy,
            "amount":         round(primary_cash_local, 2),
            "amount_usd":     round(total_cash_usd, 2),
            "current_weight": round(cash_current_weight * 100, 2),
            "target_weight":  round(cash_target_weight * 100, 2)
        })
        
        # ── Step 6: Return with base-currency totals ──
        return {
            "trades":            preview,
            "as_of_date":        as_of_date or datetime.now().strftime("%Y-%m-%d"),
            "base_currency":     base_ccy,
            "total_nav_usd":     round(total_value, 2),
            "total_nav_base":    round(total_nav_base, 2),
            "total_cash_usd":    round(total_cash_usd, 2),
            "total_cash_base":   round(primary_cash_local, 2),
            "cash_pct":          round(cash_current_weight * 100, 2)
        }


    def rebalance(self, as_of_date: str = None):
        """Execute rebalance trades. Optionally specify a historical date."""
        if not self.target_allocations: return
        result = self.get_rebalance_preview(as_of_date=as_of_date)
        if not result or 'trades' not in result:
            return
        preview = result['trades']
        cursor = self.conn.cursor()
        # Use the as_of_date if provided; otherwise today
        date_str = as_of_date if as_of_date else datetime.now().strftime("%Y-%m-%d")
        for trade in preview:
            # Insert the BUY / SELL trade record
            cursor.execute("INSERT INTO transactions (portfolio_id, date, isin, type, shares, price) VALUES (?, ?, ?, ?, ?, ?)",
                         (self.portfolio_id, date_str, trade['isin'], trade['action'], trade['shares'], trade['price']))
            # Record matching cash movement in the correct currency
            cash_delta = trade['shares'] * trade['price']
            currency = trade.get('currency', self.base_currency)
            cash_isin = f'CASH_{currency}'
            if trade['action'] == 'BUY':
                cursor.execute("INSERT INTO transactions (portfolio_id, date, isin, type, shares, price) VALUES (?, ?, ?, 'CASH_OUT', 1, ?)",
                             (self.portfolio_id, date_str, cash_isin, -cash_delta))
            else:  # SELL
                cursor.execute("INSERT INTO transactions (portfolio_id, date, isin, type, shares, price) VALUES (?, ?, ?, 'CASH_IN', 1, ?)",
                             (self.portfolio_id, date_str, cash_isin, cash_delta))
        self.conn.commit()
        self.load_transactions()

    def get_shares_on_date(self, isin, target_date):
        # Ensure target_date is a string to prevent tz-aware Timestamp vs naive datetime64[ns] crash
        if hasattr(target_date, 'strftime'):
            target_date = target_date.strftime('%Y-%m-%d')
            
        temp_df = self.df[(self.df['isin'] == isin) & (self.df['date'] <= target_date)]
        shares = 0
        for _, row in temp_df.iterrows():
            t = row['type'].upper()
            if t == 'BUY': shares += int(row['shares'])
            elif t == 'SELL': shares -= int(row['shares'])
        return shares

    def get_dividend_details(self, current_holdings=None):
        if current_holdings is None:  # FIX: use is None — empty dict {} is valid and must NOT trigger rebuild
            # If called stand-alone, build base portfolio to know ISINs (without applying dividends yet)
            current_holdings = {}
            for _, row in self.df.iterrows():
                isin, q, t = row['isin'], int(row['shares']), row['type'].upper()
                if t not in ('BUY', 'SELL') or isin.startswith('CASH_'): continue
                if isin not in current_holdings: current_holdings[isin] = {'shares': 0}
                if t == 'BUY': current_holdings[isin]['shares'] += q
                elif t == 'SELL': current_holdings[isin]['shares'] -= q

        # --- HYPER-SPEED DASHBOARD: Concurrent Pre-Fetch (Dividends Route) ---
        import concurrent.futures
        fetch_isins = [isin for isin in current_holdings.keys() if not isin.startswith('CASH_')]
        
        def _prefetch_data(isin):
            RealTime.get_market_data(isin)
            try:
                first_date = self.df[self.df['isin'] == isin]['date'].min().strftime('%Y-%m-%d')
                RealTime.get_dividend_history(isin, first_date)
            except Exception:
                pass
                
        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as executor:
            list(executor.map(_prefetch_data, fetch_isins))

        cursor = self.conn.cursor()
        dividends_list = []
        
        # 1. Manual Dividends
        cursor.execute("SELECT id, isin, date, amount_per_share FROM manual_dividends WHERE portfolio_id = ?", (self.portfolio_id,))
        manual_div_isins = set()
        for mdiv in cursor.fetchall():
            isin = mdiv['isin']
            manual_div_isins.add(isin)
            if isin in current_holdings and current_holdings[isin]['shares'] > 0:
                shares = int(current_holdings[isin]['shares']) # For manual, we approximate using current shares
                amount_per_share = mdiv['amount_per_share']
                total = shares * amount_per_share
                
                market_data = RealTime.get_market_data(isin)
                name = market_data.get('name', isin)
                
                dividends_list.append({
                    "id": mdiv['id'],
                    "date": mdiv['date'],
                    "isin": isin,
                    "name": name,
                    "type": "Manual",
                    "shares_held": shares,
                    "amount_per_share": float(amount_per_share),
                    "total_amount": float(total)
                })

        # 2. Automatic Dividends
        for isin in current_holdings:
            if isin in manual_div_isins or isin.startswith('CASH_'): continue
            if current_holdings[isin]['shares'] > 0:
                first_date = self.df[self.df['isin'] == isin]['date'].min().strftime('%Y-%m-%d')
                div_history = RealTime.get_dividend_history(isin, first_date)
                
                market_data = RealTime.get_market_data(isin)
                name = market_data.get('name', isin)
                
                for date, amt in div_history.items():
                    date_str = date.strftime('%Y-%m-%d')
                    shares_at_time = int(self.get_shares_on_date(isin, date_str))
                    if shares_at_time > 0:
                        total = shares_at_time * amt
                        dividends_list.append({
                            "id": None,
                            "date": date_str,
                            "isin": isin,
                            "name": name,
                            "type": "Auto",
                            "shares_held": shares_at_time,
                            "amount_per_share": float(amt),
                            "total_amount": float(total)
                        })
                        
        dividends_list.sort(key=lambda x: x['date'], reverse=True)
        return dividends_list, manual_div_isins

    def get_dividend_projections(self, tax_rate: float = 0.0, drip: bool = False):
        """
        Main engine for Dividend Hub. 
        Calculates YOC, Current Yield, and Future 12-Month Projections.
        Supports global tax rate deduction and DRIP compounding simulation.
        """
        holdings = self.get_current_portfolio()
        isins = [i for i in holdings.keys() if not i.startswith('CASH_')]
        
        # 0. Pre-fetch Market Data and Dividend Metrics concurrently
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            list(executor.map(RealTime.get_market_data, isins))
            list(executor.map(RealTime.get_dividend_metrics, isins))

        today = datetime.now()
        projection_months = {} # {'2026-04': amount, ...}
        # Initialize precisely next 12 months
        for i in range(1, 13):
            month_key = (today + timedelta(days=31*i)).strftime('%Y-%m')
            projection_months[month_key] = 0.0

        assets_metrics = []
        total_annual_income = 0.0
        total_market_value = 0.0
        total_cost_basis = 0.0

        # ── Pre-fetch manual dividend history (used as fallback when yfinance has no data) ──
        manual_divs_by_isin = {}  # isin → [{'date': datetime, 'amount': float}]
        cursor_m = self.conn.cursor()
        cursor_m.execute(
            "SELECT isin, date, amount_per_share FROM manual_dividends WHERE portfolio_id = ? ORDER BY isin, date ASC",
            (self.portfolio_id,)
        )
        for row in cursor_m.fetchall():
            key = row['isin']
            try:
                manual_divs_by_isin.setdefault(key, []).append({
                    'date': datetime.strptime(row['date'], '%Y-%m-%d'),
                    'amount': float(row['amount_per_share'])
                })
            except Exception:
                continue
        
        for isin in isins:
            data = holdings[isin]
            initial_shares = data['shares']
            avg_cost = data['avg_cost']
            
            market_data = RealTime.get_market_data(isin)
            curr_price = market_data.get('price', 0) if market_data else 0
            base_price = market_data.get('base_price', curr_price) if market_data else 0
            fx_rate = market_data.get('fx_rate', 1.0) if market_data else 1.0
            
            div_metrics = RealTime.get_dividend_metrics(isin)
            
            trailing_sum = div_metrics.get('trailing_sum', 0.0) if div_metrics else 0.0
            next_date = div_metrics.get('next_date') if div_metrics else None
            next_amount = div_metrics.get('next_amount') if div_metrics else None
            
            # --- After-Tax Static Calculations ---
            # Apply FX Rate to normalize to Base Currency (USD) for Total Income Projection
            net_trailing_sum = trailing_sum * (1 - tax_rate) * fx_rate
            
            total_market_value += (float(initial_shares or 0) * float(base_price or 0))
            total_cost_basis += (float(initial_shares or 0) * float(avg_cost or 0) * fx_rate)

            # --- Hybrid Projection Logic ---
            is_manual_projection = False
            manual_growth_rate = 0.0
            manual_freq_label = ''

            if trailing_sum == 0.0 and isin in manual_divs_by_isin:
                # ── FALLBACK: extrapolate from manual dividend history ──
                man_recs  = manual_divs_by_isin[isin]
                man_dates  = [r['date']   for r in man_recs]
                man_amounts = [r['amount'] for r in man_recs]

                # 1. Trailing 12-month sum (local currency)
                one_yr_ago = today - timedelta(days=365)
                recent_amts = [a for d, a in zip(man_dates, man_amounts) if d >= one_yr_ago]
                trailing_sum = sum(recent_amts) if recent_amts else sum(man_amounts)

                # 2. Detect payment frequency from gaps
                if len(man_dates) > 1:
                    gaps = [(man_dates[i+1] - man_dates[i]).days for i in range(len(man_dates)-1)]
                    avg_gap = sum(gaps) / len(gaps)
                else:
                    avg_gap = 365

                if avg_gap <= 45:   freq_days, manual_freq_label = 30,  'Monthly'
                elif avg_gap <= 120: freq_days, manual_freq_label = 91, 'Quarterly'
                elif avg_gap <= 250: freq_days, manual_freq_label = 182, 'Semi-Annual'
                else:               freq_days, manual_freq_label = 365, 'Annual'

                # 3. Average growth rate per period
                n = len(man_amounts)
                if n >= 2:
                    rates = [(man_amounts[i+1] - man_amounts[i]) / man_amounts[i]
                             for i in range(n - 1) if man_amounts[i] > 0]
                    manual_growth_rate = max(-0.5, min(0.5, sum(rates) / len(rates))) if rates else 0.0

                # 4. Generate future events starting from last known date
                events = []
                curr_date = man_dates[-1] + timedelta(days=freq_days)
                curr_amt  = man_amounts[-1] * (1 + manual_growth_rate)
                while curr_date <= today + timedelta(days=365):
                    if curr_date > today:
                        events.append({
                            "date": curr_date.strftime('%Y-%m-%d'),
                            "amount_per_share": curr_amt,
                            "type": "Manual Extrapolation"
                        })
                    curr_amt  *= (1 + manual_growth_rate)
                    curr_date += timedelta(days=freq_days)

                is_manual_projection = True
                net_trailing_sum = trailing_sum * (1 - tax_rate) * fx_rate  # recalc with filled trailing_sum

            else:
                # ── STANDARD: build events from yfinance official + historical shift ──
                one_year_ago_str = (today - timedelta(days=365)).strftime('%Y-%m-%d')
                hist_divs = RealTime.get_dividend_history(isin, one_year_ago_str)

                events = []
                processed_historical_slots = set()

                if next_date and next_amount is not None:
                    m_key = next_date[:7]
                    events.append({"date": next_date, "amount_per_share": float(next_amount), "type": "Official"})
                    processed_historical_slots.add(m_key)

                if isinstance(hist_divs, pd.Series):
                    for date, amt in hist_divs.items():
                        if amt is None: continue
                        try:
                            shifted_date = date + timedelta(days=365)
                            m_key = shifted_date.strftime('%Y-%m')
                            if shifted_date.date() > today.date() and m_key in projection_months and m_key not in processed_historical_slots:
                                events.append({"date": shifted_date.strftime('%Y-%m-%d'), "amount_per_share": float(amt), "type": "Projected"})
                        except:
                            continue

            # Sort events chronologically to allow DRIP compounding
            events.sort(key=lambda x: x['date'])
            
            current_shares = float(initial_shares)
            asset_projected_annual_income = 0.0
            projected_individual = []
            
            for event in events:
                # Add FX rate to dividend payout
                net_amount_per_share = event['amount_per_share'] * (1 - tax_rate) * fx_rate
                payout = net_amount_per_share * current_shares
                
                m = event['date'][:7]
                if m in projection_months:
                    projection_months[m] += payout
                
                projected_individual.append({
                    "date": event['date'], 
                    "amount": payout, 
                    "type": event['type']
                })
                asset_projected_annual_income += payout
                
                # DRIP Simulation: reinvest net payout (in local currency) to buy more shares
                local_payout = event['amount_per_share'] * (1 - tax_rate) * current_shares
                if drip and curr_price and curr_price > 0:
                    current_shares += (local_payout / curr_price)
            
            total_annual_income += asset_projected_annual_income
            
            # ── Yield Ratios: MUST use local currency for both numerator & denominator ──
            # net_trailing_sum is FX-adjusted (USD), but curr_price & avg_cost are in local CCY.
            # Mixing them gives ~0.02% instead of ~3%. Use after-tax LOCAL amount instead.
            local_trailing_sum = trailing_sum * (1 - tax_rate)  # stays in stock's local currency (e.g. JPY)
            current_yield = (float(local_trailing_sum or 0) / float(curr_price or 1) * 100) if curr_price and curr_price > 0 else 0
            yoc = (float(local_trailing_sum or 0) / float(avg_cost or 1) * 100) if avg_cost and avg_cost > 0 else 0

            assets_metrics.append({
                "isin": isin,
                "name": market_data.get('name', isin) if market_data else isin,
                "shares": round(current_shares if drip else initial_shares, 4),
                "avg_cost": round(avg_cost, 2),
                "curr_price": round(curr_price, 2) if curr_price else 0,
                "trailing_div_per_share": round(net_trailing_sum, 4),
                "current_yield": round(current_yield, 2),
                "yoc": round(yoc, 2),
                "est_annual_income": round(asset_projected_annual_income, 2),
                "next_date": next_date,
                "projections": projected_individual,
                # ── Projection source metadata for frontend display ──
                "source": "manual_extrapolation" if is_manual_projection else ("yfinance" if trailing_sum > 0 else "none"),
                "manual_freq": manual_freq_label,
                "manual_growth_pct": round(manual_growth_rate * 100, 2) if is_manual_projection else None
            })

        # Final Formatting for Recharts
        chart_data = []
        for m in sorted(projection_months.keys()):
            chart_data.append({"month": m, "amount": round(projection_months[m], 2)})

        return {
            "portfolio_metrics": {
                "total_annual_income": round(total_annual_income, 2),
                "portfolio_current_yield": round((total_annual_income / total_market_value * 100), 2) if total_market_value > 0 else 0,
                "portfolio_yoc": round((total_annual_income / total_cost_basis * 100), 2) if total_cost_basis > 0 else 0
            },
            "chart_data": chart_data,
            "assets": sorted(assets_metrics, key=lambda x: x['est_annual_income'], reverse=True)
        }

    def get_historical_chart_data(self):
        """Builds a historical month-end NAV array perfectly matched to the user's historical ledger activity"""
        unique_isins = self.df[self.df['isin'] != '']['isin'].dropna().unique().tolist()
        unique_isins = [i for i in unique_isins if not i.startswith('CASH_')]
        
        tx_df = self.df.copy()
        if tx_df.empty:
            return []
            
        start_date_ts = tx_df['date'].min()
        days_since_start = (datetime.now() - start_date_ts).days + 15
        if days_since_start < 30:
            days_since_start = 30 # At least 30 days fetching to ensure valid month end pricing
            
        historical_data = {}
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
            futures = {ex.submit(RealTime.get_historical_series, isin, days_since_start): isin for isin in unique_isins}
            for fut in concurrent.futures.as_completed(futures):
                isin = futures[fut]
                try:
                    historical_data[isin] = fut.result()
                except Exception:
                    historical_data[isin] = {}

        # --- FIX: INTEGRATE DIVIDEND TIMELINE INTO CASH BALANCE ---
        # Explicitly fetch historical dividends and merge them into the simulation dataframe
        all_divs, _ = self.get_dividend_details()
        div_records = []
        for d_item in all_divs:
            div_records.append({
                'date': pd.to_datetime(d_item['date']),
                'isin': d_item['isin'],
                'type': 'DIVIDEND',
                'shares': d_item['shares_held'],
                'price': d_item['amount_per_share']
            })
        if div_records:
            div_df = pd.DataFrame(div_records)
            tx_df = pd.concat([tx_df, div_df], ignore_index=True)
            tx_df = tx_df.sort_values(by='date')

        # Generate month-end dates from start_date to today
        dates_series = pd.date_range(start=start_date_ts, end=datetime.now(), freq='ME')
        dates = dates_series.strftime('%Y-%m-%d').tolist()
        
        # Ensure start_date itself is recorded if it's the very beginning
        start_str = start_date_ts.strftime('%Y-%m-%d')
        if not dates or start_str < dates[0]:
            dates.insert(0, start_str)
            
        today_str = datetime.now().strftime('%Y-%m-%d')
        if not dates or dates[-1] != today_str:
            dates.append(today_str)
            
        # Ensure uniqueness and chronological order
        dates = sorted(list(set(dates)))
        
        daily_shares = {isin: 0 for isin in unique_isins}
        cash = 0
        hist_chart = []
        
        tx_df['date_str'] = tx_df['date'].dt.strftime('%Y-%m-%d')
        tx_df = tx_df.sort_values(by='date')
        
        tx_idx = 0
        num_tx = len(tx_df)
        
        # Simulate value purely over the month-end dates instead of daily
        for d in dates:
            while tx_idx < num_tx and tx_df.iloc[tx_idx]['date_str'] <= d:
                row = tx_df.iloc[tx_idx]
                t = row['type'].upper()
                p = float(row['price'])
                q = float(row['shares']) if pd.notna(row['shares']) else 0
                isin = row['isin']
                
                fx = 1.0
                if isin.startswith('CASH_'):
                    # Cash injection/withdrawal in local currency → convert to USD
                    ccy = isin.split('_')[1]
                    if ccy != 'USD':
                        fx = RealTime.get_fx_rate(ccy, 'USD')
                else:
                    # Stock BUY/SELL/DIVIDEND price is in the stock's local currency
                    isin_ccy = RealTime.guess_currency_from_isin(isin)
                    if isin_ccy and isin_ccy != 'USD':
                        fx = RealTime.get_fx_rate(isin_ccy, 'USD')
                    
                if t == 'CASH_IN': cash += p * fx
                elif t == 'CASH_OUT': cash -= p * fx
                elif t == 'DIVIDEND': cash += q * p * fx
                elif t == 'BUY' and not isin.startswith('CASH_'):
                    cash -= q * p * fx  # Deduct purchase cost in USD-normalised value
                    daily_shares[isin] += q
                elif t == 'SELL' and not isin.startswith('CASH_'):
                    cash += q * p * fx
                    daily_shares[isin] -= q
                tx_idx += 1
                
            # Start with cash (Total Wealth includes accumulated dividends)
            daily_nav = cash
            for isin, shares in daily_shares.items():
                if shares > 0:
                    prices = historical_data.get(isin, {})
                    price = prices.get(d)
                    
                    # --- FIX: ROBUST PRICE FALLBACK ---
                    if price is None or price <= 0:
                        # 1. Try past 30 days (weekends/holidays)
                        d_obj = datetime.strptime(d, '%Y-%m-%d')
                        for b in range(1, 31):
                            pd_str = (d_obj - timedelta(days=b)).strftime('%Y-%m-%d')
                            if pd_str in prices and prices[pd_str] > 0:
                                price = prices[pd_str]
                                break
                        
                    # ── COST ANCHORING: Fix the 'Inception Pit' ──────────────────
                    # If the API price is lower than the cost price, use cost.
                    # This prevents artificial drops due to API/cost basis discrepancies.
                    avg_cost = tx_df[(tx_df['isin'] == isin) & (tx_df['date'] <= d) & (tx_df['type'] == 'BUY')]['price'].mean()
                    if price and avg_cost and price < avg_cost:
                        price = avg_cost
                    
                    # ── FX NORMALISATION: Convert local currency price to USD ──────
                    # Japanese stocks trade in JPY, European in EUR, etc.
                    # Without this step, ¥1,000/share inflates the chart 150x vs USD.
                    if price and price > 0:
                        isin_ccy = RealTime.guess_currency_from_isin(isin)
                        if isin_ccy and isin_ccy != 'USD':
                            price_fx = RealTime.get_fx_rate(isin_ccy, 'USD')
                            price = price * price_fx
                        
                    daily_nav += shares * (price or 0)
            
            # Ensure we don't return 0 for initiated portfolios if it's just a data gap
            if daily_nav <= 0 and cash > 0:
                daily_nav = cash
                
            hist_chart.append({"date": d, "value": round(daily_nav, 2)})

        # ── Authoritative "today" data point: always use calculate_nav() ──────
        # This guarantees the chart's last point EXACTLY matches the NAV stat box.
        try:
            live_nav = self.calculate_nav()
            # Restore to total_nav (wealth) for total return chart
            today_nav = round(live_nav['total_nav'], 2)
            # Replace or append today's point
            if hist_chart and hist_chart[-1]['date'] == today_str:
                hist_chart[-1]['value'] = today_nav
            else:
                hist_chart.append({'date': today_str, 'value': today_nav})
        except Exception:
            pass  # Keep the estimate if live calc fails

        return hist_chart

def create_report(portfolio_id: int):
    engine = PortfolioEngine(portfolio_id)
    base_currency = 'USD'
    try:
        nav_info = engine.calculate_nav()
        perf_info = engine.calculate_performance(nav_data=nav_info)
        base_currency = engine.base_currency
    finally:
        engine.close()
    
    # Compute FX multiplier: 1 USD → base_currency (for frontend display)
    usd_to_base_fx = 1.0
    if base_currency != 'USD':
        try:
            usd_to_base_fx = RealTime.get_fx_rate('USD', base_currency)
        except Exception:
            usd_to_base_fx = 1.0
    
    # --- SMART CACHE: Save stats for heartbeat polling ---
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO portfolio_stats_cache 
            (portfolio_id, total_nav, wallet_balance, total_pnl, total_divs, cumulative_roi, annualized_return, details, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            portfolio_id,
            nav_info['total_nav'],
            nav_info['wallet_balance'],
            perf_info.get('total_pnl', 0),
            perf_info.get('total_divs', 0),
            perf_info.get('cumulative_roi', 0),
            perf_info.get('annualized_return', 0),
            json.dumps(nav_info['details']),
            datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        ))
        conn.commit()
    except Exception as e:
        logger.error(f"Error updating portfolio_stats_cache: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

    return {**nav_info, **perf_info, 'base_currency': base_currency, 'usd_to_base_fx': round(usd_to_base_fx, 6)}

def get_portfolio_historical_chart(portfolio_id: int):
    engine = PortfolioEngine(portfolio_id)
    try:
        return engine.get_historical_chart_data()
    finally:
        engine.close()
