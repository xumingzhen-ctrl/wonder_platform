import sys
import os
import pandas as pd
import sqlite3
import json
from datetime import datetime
import logging

# Ensure backend can be imported
sys.path.append(os.path.join(os.getcwd(), 'backend'))

DB_PATH = os.path.join(os.getcwd(), "backend", "portfolio.db")

def apply_refactor():
    target_file = os.path.join(os.getcwd(), 'backend', 'portfolio_engine.py')
    with open(target_file, 'r') as f:
        content = f.read()

    # 1. Refactor calculate_nav
    old_nav_code = """    def calculate_nav(self):
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
        }"""

    new_nav_code = """    def calculate_nav(self):
        holdings = self.get_current_portfolio()
        total_nav = 0
        details = []
        report_date = datetime.now().strftime("%Y-%m-%d %H:%M")
        base_ccy = getattr(self, 'base_currency', 'USD')
        
        # --- STEP 1: Batch-fetch HK prices from Futu (single API call, instant) ---
        from broker_price_provider import BrokerPriceProvider
        fetch_isins = [isin for isin in holdings.keys() if not isin.startswith('CASH_')]
        broker_prices = BrokerPriceProvider.batch_get_prices(fetch_isins)
        if broker_prices:
            logger.info(f"BrokerPriceProvider: Futu batch fetched {len(broker_prices)} HK prices")

        # --- STEP 2: Parallel yfinance prefetch for stocks + FX relative to base_ccy ---
        yf_needed = [i for i in fetch_isins if i not in broker_prices]
        
        # Also pre-fetch FX rates for all cash balances
        currencies_needed = {isin.split('_')[1] for isin in holdings.keys() if isin.startswith('CASH_')}
        for c in currencies_needed:
            if c != base_ccy:
                yf_needed.append(f"{c}{base_ccy}=X")
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=32) as executor:
            list(executor.map(RealTime.get_market_data, yf_needed))

            
        wallet_balance = 0  # Re-aggregated wallet balance in base_currency
        for isin, data in holdings.items():
            if isin.startswith('CASH_'):
                currency = isin.split('_')[1]
                fx = RealTime.get_fx_rate(currency, base_ccy)
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
                isin_curr = market_data.get('currency', 'USD')
                fx_to_base = RealTime.get_fx_rate(isin_curr, base_ccy)
                curr_price = market_data['price'] * fx_to_base
                
                # Failsafe: if the real-time API is rate-limited (price=0), fallback to historical cost basis
                if curr_price == 0 and data['avg_cost'] > 0:
                    curr_price = data['avg_cost'] * fx_to_base
                    
                market_value = data['shares'] * curr_price
                name = market_data.get('name', isin)
                sector = market_data.get('sector', 'Unknown Sector')
                country = market_data.get('country', 'Unknown Region')
                
                # ── Priority: use manually-registered metadata from assets table ──
                assets_row = self.conn.execute(
                    "SELECT name, sector, country FROM assets WHERE isin = ?", (isin,)
                ).fetchone()
                if assets_row:
                    if assets_row[0]: name = assets_row[0]
                    if assets_row[1] and sector == 'Unknown Sector': sector  = assets_row[1]
                    if assets_row[2] and country == 'Unknown Region': country = assets_row[2]
                total_nav += market_value
                cost = data['total_cost'] * fx_to_base
            
            item_pnl = market_value - cost
            item_yield = 0
            if not isin.startswith('CASH_'):
                isin_curr_temp = RealTime.guess_currency_from_isin(isin)
                div_fx = RealTime.get_fx_rate(isin_curr_temp, base_ccy)
                if cost > 0:
                    item_yield = ((market_value + (data['total_div_cash'] * div_fx) - cost) / cost * 100)
                else:
                    item_yield = 999.99 if item_pnl > 0 else 0
            else:
                div_fx = 1.0
            
            details.append({
                "isin": isin,
                "name": name,
                "sector": sector,
                "country": country,
                "shares": int(data['shares']) if not isin.startswith('CASH_') else 1,
                "price": curr_price,
                "market_value": round(market_value, 2),
                "total_cost": round(cost, 2),
                "dividends": round(data['total_div_cash'] * div_fx, 2),
                "pnl": round(item_pnl, 2) if not isin.startswith('CASH_') else 0,
                "yield": round(item_yield, 2)
            })
            
        total_market_value = sum(d['market_value'] for d in details if not d['isin'].startswith('CASH_'))
        
        return {
            "total_nav": round(total_nav, 2), 
            "total_market_value": round(total_market_value, 2),
            "wallet_balance": round(wallet_balance, 2),
            "details": details, 
            "report_date": report_date
        }"""

    # 2. Refactor calculate_performance
    old_perf_code = """    def calculate_performance(self, nav_data=None):
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
        total_pnl = total_market_value - total_invested
        cumulative_roi = total_pnl / total_invested if total_invested > 0 else 0
        
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
        }"""

    new_perf_code = """    def calculate_performance(self, nav_data=None):
        base_ccy = getattr(self, 'base_currency', 'USD')
        logger.info(f"Calculating performance for portfolio {self.portfolio_id} ({base_ccy})")
        if nav_data is None:
            nav_data = self.calculate_nav()
        total_market_value = nav_data['total_nav']
        
        # We need the invested cost (cash in) to calculate portfolio ROI properly
        cursor = self.conn.cursor()
        # ── FX-normalised total invested into BASE_CURRENCY ─────────────────────────
        cursor.execute(
            "SELECT isin, price FROM transactions WHERE portfolio_id = ? AND type = 'CASH_IN'",
            (self.portfolio_id,)
        )
        total_invested = 0.0
        for cash_row in cursor.fetchall():
            raw_isin  = cash_row[0] if isinstance(cash_row, (list, tuple)) else cash_row['isin']
            raw_price = cash_row[1] if isinstance(cash_row, (list, tuple)) else cash_row['price']
            if raw_isin and raw_isin.startswith('CASH_'):
                ccy = raw_isin.split('_')[1]
            else:
                ccy = base_ccy
            fx = RealTime.get_fx_rate(ccy, base_ccy) if ccy != base_ccy else 1.0
            total_invested += float(raw_price or 0) * fx
        
        total_divs = sum([d['dividends'] for d in nav_data['details']])
        
        if total_invested == 0: 
            return {
                "total_pnl": 0, "total_divs": 0, "cumulative_roi": 0, 
                "wallet_balance": nav_data['wallet_balance'],
                "report_date": nav_data['report_date']
            }
        
        # ── CORRECT ROI: Total Return = (Current NAV - Total Invested) / Total Invested ──
        total_pnl = total_market_value - total_invested
        cumulative_roi = total_pnl / total_invested if total_invested > 0 else 0
        
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
        }"""

    # 3. Refactor get_historical_chart_data
    old_hist_code = """    def get_historical_chart_data(self):
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

        return hist_chart"""

    new_hist_code = """    def get_historical_chart_data(self):
        """Builds a historical month-end NAV array matched to base_currency"""
        base_ccy = getattr(self, 'base_currency', 'USD')
        unique_isins = self.df[self.df['isin'] != '']['isin'].dropna().unique().tolist()
        unique_isins = [i for i in unique_isins if not i.startswith('CASH_')]
        
        tx_df = self.df.copy()
        if tx_df.empty:
            return []
            
        start_date_ts = tx_df['date'].min()
        days_since_start = (datetime.now() - start_date_ts).days + 15
        if days_since_start < 30:
            days_since_start = 30
            
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

        # Merge dividends into simulation
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

        # Generate dates
        dates_series = pd.date_range(start=start_date_ts, end=datetime.now(), freq='ME')
        dates = dates_series.strftime('%Y-%m-%d').tolist()
        start_str = start_date_ts.strftime('%Y-%m-%d')
        if not dates or start_str < dates[0]:
            dates.insert(0, start_str)
        today_str = datetime.now().strftime('%Y-%m-%d')
        if not dates or dates[-1] != today_str:
            dates.append(today_str)
         dates = sorted(list(set(dates)))
        
        daily_shares = {isin: 0 for isin in unique_isins}
        cash = 0
        hist_chart = []
        tx_df['date_str'] = tx_df['date'].dt.strftime('%Y-%m-%d')
        tx_df = tx_df.sort_values(by='date')
        tx_idx = 0
        num_tx = len(tx_df)
        
        for d in dates:
            while tx_idx < num_tx and tx_df.iloc[tx_idx]['date_str'] <= d:
                row = tx_df.iloc[tx_idx]
                t = row['type'].upper()
                p = float(row['price'])
                q = float(row['shares']) if pd.notna(row['shares']) else 0
                isin = row['isin']
                
                fx = 1.0
                if isin.startswith('CASH_'):
                    ccy = isin.split('_')[1]
                    if ccy != base_ccy:
                        fx = RealTime.get_fx_rate(ccy, base_ccy)
                else:
                    isin_ccy = RealTime.guess_currency_from_isin(isin)
                    if isin_ccy and isin_ccy != base_ccy:
                        fx = RealTime.get_fx_rate(isin_ccy, base_ccy)
                    
                if t == 'CASH_IN': cash += p * fx
                elif t == 'CASH_OUT': cash -= p * fx
                elif t == 'DIVIDEND': cash += q * p * fx
                elif t == 'BUY' and not isin.startswith('CASH_'):
                    cash -= q * p * fx
                    daily_shares[isin] += q
                elif t == 'SELL' and not isin.startswith('CASH_'):
                    cash += q * p * fx
                    daily_shares[isin] -= q
                tx_idx += 1
                
            daily_nav = cash
            for isin, shares in daily_shares.items():
                if shares > 0:
                    prices = historical_data.get(isin, {})
                    price = prices.get(d)
                    
                    if price is None or price <= 0:
                        d_obj = datetime.strptime(d, '%Y-%m-%d')
                        for b in range(1, 31):
                            pd_str = (d_obj - timedelta(days=b)).strftime('%Y-%m-%d')
                            if pd_str in prices and prices[pd_str] > 0:
                                price = prices[pd_str]
                                break
                    
                    # Cost anchoring logic
                    avg_cost = tx_df[(tx_df['isin'] == isin) & (tx_df['date'] <= d) & (tx_df['type'] == 'BUY')]['price'].mean()
                    if price and avg_cost and price < avg_cost:
                        price = avg_cost
                    
                    if price and price > 0:
                        isin_ccy = RealTime.guess_currency_from_isin(isin)
                        if isin_ccy and isin_ccy != base_ccy:
                            price_fx = RealTime.get_fx_rate(isin_ccy, base_ccy)
                            price = price * price_fx
                        
                    daily_nav += shares * (price or 0)
            
            if daily_nav <= 0 and cash > 0:
                daily_nav = cash
                
            hist_chart.append({"date": d, "value": round(daily_nav, 2)})

        # Authoritative "today" data point
        try:
            live_nav = self.calculate_nav()
            today_nav = round(live_nav['total_nav'], 2)
            if hist_chart and hist_chart[-1]['date'] == today_str:
                hist_chart[-1]['value'] = today_nav
            else:
                hist_chart.append({'date': today_str, 'value': today_nav})
        except Exception:
            pass

        return hist_chart"""

    # Apply changes (manual replacement because string matching failed)
    # WARNING: This script is destructive if the search strings aren't exact.
    # I will use smaller markers.
    
    import re
    
    # 1. calculate_nav
    content = content.replace(old_nav_code, new_nav_code)
    
    # 2. calculate_performance
    content = content.replace(old_perf_code, new_perf_code)
    
    # 3. get_historical_chart_data (multiple points)
    content = content.replace(old_hist_code, new_hist_code)
    
    with open(target_file, 'w') as f:
        f.write(content)
    print("Refactor Applied Successfully")

if __name__ == "__main__":
    apply_refactor()
