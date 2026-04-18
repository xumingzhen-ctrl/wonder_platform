import sqlite3
import yfinance as yf
import pandas as pd
import functools
import requests
import os
import logging
from dotenv import load_dotenv
from datetime import datetime, timedelta
import requests_cache

# Inject Persistent HTTP Cache for all requests (yfinance, eodhd, fmp)
requests_cache.install_cache(
    'api_response_cache',
    backend='memory',
    expire_after=timedelta(hours=12)
)

# Load Ultimate Engine APIs

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "hk_admin.db")

# Lazy import so broker_price_provider import errors don't break the entire module
try:
    from broker_price_provider import BrokerPriceProvider
    _BROKER_PROVIDER_AVAILABLE = True
except ImportError:
    _BROKER_PROVIDER_AVAILABLE = False

    class BrokerPriceProvider:  # dummy
        @classmethod
        def get_price(cls, isin): return None
        @classmethod
        def get_fx_rate(cls, f, t="USD"): return None

try:
    from plugins.akshare_gateway import AKShareGateway
    _AKSHARE_AVAILABLE = True
except ImportError:
    _AKSHARE_AVAILABLE = False
    
    class AKShareGateway: # dummy
        @classmethod
        def get_price(cls, isin): return 0.0
        @classmethod
        def get_dividend_history(cls, isin): return pd.Series(dtype=float)
        @classmethod
        def is_target_market(cls, isin): return False

class RealTimeProvider:
    """
    Antigravity.Finance.RealTime wrapper for yfinance.
    Provides real-time and historical market prices and dividend data.
    """
    @classmethod
    def guess_currency_from_isin(cls, isin: str) -> str:
        """Deterministically infer the native currency from the ticker suffix to avoid API rate limits."""
        isin = str(isin).upper()
        if isin.endswith('.HK'):
            return 'HKD'
        elif isin.endswith('.T'):
            return 'JPY'
        elif isin.endswith('.L'):
            return 'GBP'
        elif isin.endswith('.PA') or isin.endswith('.AS') or isin.endswith('.DE'):
            return 'EUR'
        elif isin.endswith('.TO') or isin.endswith('.V'):
            return 'CAD'
        elif isin.endswith('.AX'):
            return 'AUD'
        elif isin.endswith('.SZ') or isin.endswith('.SS'):
            return 'CNY'
        return 'USD'

    @classmethod
    def get_fx_rate(cls, from_curr: str, to_curr: str = "USD") -> float:
        """
        Fetches the real-time exchange rate from a currency to another (default USD).
        Priority: 1-hour SQLite Cache → Broker (Futu → IB) → yfinance
        """
        if not from_curr or from_curr.upper() == to_curr.upper():
            return 1.0

        ticker = f"{from_curr.upper()}{to_curr.upper()}=X"
        
        # 1. Check SQLite Cache with 1-hour expiry
        try:
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            # expiry_cutoff: 1 hour ago
            cutoff = (datetime.now() - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")
            c.execute("SELECT price FROM price_cache WHERE isin = ? AND date > ? ORDER BY date DESC LIMIT 1", (ticker, cutoff))
            row = c.fetchone()
            conn.close()
            if row: return float(row[0])
        except Exception: pass

        # 2. Broker (Futu → IB)
        broker_rate = BrokerPriceProvider.get_fx_rate(from_curr, to_curr)
        if broker_rate:
            return broker_rate

        # 3. yfinance fallback
        try:
            yt = yf.Ticker(ticker)
            history = yt.history(period="1d")
            price = 1.0
            if not history.empty:
                price = float(history['Close'].iloc[-1])
            else:
                price = float(yt.info.get('regularMarketPrice') or yt.info.get('currentPrice') or 1.0)
            
            # Save back to cache
            try:
                conn = sqlite3.connect(DB_PATH)
                c = conn.cursor()
                c.execute("INSERT OR REPLACE INTO price_cache (isin, date, price) VALUES (?, ?, ?)", 
                          (ticker, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), price))
                conn.commit()
                conn.close()
            except Exception: pass
            
            return price
        except Exception as e:
            logger.error(f"Failed to fetch FX rate {ticker}: {e}")
            return 1.0

    # ── Yahoo Finance symbol quirks map ──────────────────────────────────────
    _YAHOO_OVERRIDES = {
        # Berkshire / dual-class shares stored without class suffix
        "BRK":  "BRK-B",
        "BF":   "BF-B",
        # Hong Kong tickers: yfinance needs 4-digit zero-padded codes
        # e.g. "700.HK" -> "0700.HK"  (handled dynamically below)
    }

    @classmethod
    def _normalize_for_yahoo(cls, isin: str) -> str:
        """Normalise internal ISIN/ticker to the format yfinance understands."""
        # Static overrides
        upper = isin.upper()
        if upper in cls._YAHOO_OVERRIDES:
            return cls._YAHOO_OVERRIDES[upper]

        # HK stocks: pad numeric part to 4 digits
        # "700.HK" -> "0700.HK", "9988.HK" stays "9988.HK"
        if isin.upper().endswith(".HK"):
            num, suffix = isin.rsplit(".", 1)
            num_stripped = num.lstrip("0") or "0"
            return f"{num_stripped.zfill(4)}.{suffix}"

        return isin

    @classmethod
    @functools.lru_cache(maxsize=128)
    def get_market_data(cls, isin: str):
        yahoo_isin = cls._normalize_for_yahoo(isin)
        current_price = None
        name = isin # default to ISIN
        sector = 'Unknown Sector'
        country = 'Unknown Region'

        try:
            # ── Fast-Path 1: Local Price Cache ──
            # Price is ONLY used if it was cached today (intraday).
            # Metadata (name, sector, country) is always used regardless of age.
            try:
                conn = sqlite3.connect(DB_PATH)
                c = conn.cursor()
                today_str = datetime.now().strftime("%Y-%m-%d")
                c.execute(
                    "SELECT price, name, sector, country, date FROM price_cache WHERE isin = ? ORDER BY date DESC LIMIT 1",
                    (isin,)
                )
                res = c.fetchone()
                conn.close()
                if res:
                    # Use price only if cached today (real-time data)
                    if res[0] and res[0] > 0 and res[4] and res[4][:10] == today_str:
                        current_price = res[0]
                    # Always use metadata from cache (stored permanently after first resolution)
                    if res[1]: name = res[1]
                    if res[2]:
                        # sector may be stored as JSON dict (fund lookthrough) or plain string
                        try:    sector = json.loads(res[2])
                        except: sector = res[2]
                    if res[3]:
                        try:    country = json.loads(res[3])
                        except: country = res[3]
            except Exception:
                pass

            # ── Fast-Path 2: Futu (HK stocks only) ──
            if current_price is None:
                current_price = BrokerPriceProvider.get_price(isin)

            # ── Fast-Path 2.5: AKShare Gateway (A-shares, ETFs, HK fallback) ──
            if current_price is None and AKShareGateway.is_target_market(isin):
                ak_price = AKShareGateway.get_price(isin)
                if ak_price > 0:
                    current_price = ak_price
                    logger.info(f"AKShare Gateway provided real-time price: {isin} = {ak_price}")

            # ── Fast-Path 3: Premium Engine (Price + Name) ──
            if current_price is None or name == isin:
                p_price, p_name = cls._fetch_premium_price(isin)
                if p_price: 
                    if current_price is None: current_price = p_price
                if p_name: name = p_name

            # ── Fast-Path 4: Fund Lookthrough (Sector & Country weight dict) ──
            # For mutual funds (LU*, IE*, 0P*) — EODHD returns full sector/country distributions
            if sector == 'Unknown Sector' and not any(s in isin for s in ['US-T', 'CASH_']):
                try:
                    sect_dict, ctry_dict = cls._fetch_lookthrough(isin)
                    # Filter out zero-weight entries
                    sect_dict = {k: v for k, v in sect_dict.items() if v and v > 0}
                    ctry_dict = {k: v for k, v in ctry_dict.items() if v and v > 0}
                    if sect_dict:
                        sector = sect_dict   # Pass the full dict to frontend
                    if ctry_dict:
                        country = ctry_dict
                    # Persist to price_cache as JSON for fast subsequent reads
                    if sect_dict or ctry_dict:
                        try:
                            conn = sqlite3.connect(DB_PATH)
                            c = conn.cursor()
                            c.execute(
                                "INSERT OR REPLACE INTO price_cache (isin, date, price, name, sector, country) VALUES (?, ?, ?, ?, ?, ?)",
                                (isin, datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                                 current_price or 0,
                                 name if name != isin else None,
                                 json.dumps(sect_dict) if sect_dict else None,
                                 json.dumps(ctry_dict) if ctry_dict else None)
                            )
                            conn.commit()
                            conn.close()
                        except Exception: pass
                except Exception:
                    pass

            # ── Slow-Path: yfinance fallback (ONLY if price is still missing) ──
            SKIP_YF = ['US-T', 'CASH_']
            if current_price is None and not any(s in isin for s in SKIP_YF):
                try:
                    ticker = yf.Ticker(yahoo_isin)
                    # Meta: Name & Currency (Priority: yfinance -> akshare fallback)
                    name = ticker.info.get('longName', ticker.info.get('shortName', isin))
                    
                    # ─── Metadata Enrichment from AKShare ───
                    if _AKSHARE_AVAILABLE and AKShareGateway.is_target_market(isin):
                        ak_name = AKShareGateway.get_name(isin)
                        if ak_name:
                            name = ak_name
                    # Use fast_info (milli-seconds)
                    cp = ticker.fast_info.get('last_price')
                    if cp and cp > 0:
                        current_price = cp
                    else:
                        # last-ditch effort: hist
                        hist = ticker.history(period="1d")
                        if not hist.empty:
                            current_price = hist['Close'].iloc[-1]
                except Exception:
                    pass

            # ── Historical Series Fallback (ISIN format mutual funds like LU*, IE* not recognized by yfinance) ──
            if (current_price is None or current_price == 0.0) and not any(s in isin for s in ['US-T', 'CASH_']):
                try:
                    hist_series = cls.get_historical_series(isin, days_back=10)
                    if hist_series:
                        # Get the most recent price from historical data (last 10 trading days)
                        sorted_dates = sorted(hist_series.keys(), reverse=True)
                        for d in sorted_dates:
                            if hist_series[d] and hist_series[d] > 0:
                                current_price = float(hist_series[d])
                                # Save to price_cache with today's timestamp so it's valid for today
                                try:
                                    conn = sqlite3.connect(DB_PATH)
                                    c = conn.cursor()
                                    c.execute(
                                        "INSERT OR REPLACE INTO price_cache (isin, date, price, name, sector, country) VALUES (?, ?, ?, ?, ?, ?)",
                                        (isin, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), current_price, name if name != isin else None, sector if sector != 'Unknown Sector' else None, country if country != 'Unknown Region' else None)
                                    )
                                    conn.commit()
                                    conn.close()
                                except Exception: pass
                                break
                except Exception:
                    pass

            # --- Final Defaults ---
            if current_price is None: current_price = 0.0
            
            # --- Save back to metadata cache if we found name/sector ---
            if name != isin and current_price > 0:
                try:
                    conn = sqlite3.connect(DB_PATH)
                    c = conn.cursor()
                    c.execute("""
                        INSERT OR REPLACE INTO price_cache (isin, date, price, name, sector, country)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (isin, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), current_price, name, sector, country))
                    conn.commit()
                    conn.close()
                except Exception: pass
            
            # --- BASE CURRENCY CONVERSION ---
            currency = cls.guess_currency_from_isin(isin)
            fx_to_usd = cls.get_fx_rate(currency, "USD")
            base_price = (current_price * fx_to_usd) if current_price else 0.0
            
            return {
                "symbol": isin,
                "price": current_price,
                "currency": currency,
                "base_price": base_price,
                "fx_rate": fx_to_usd,
                "name": name,
                "sector": sector,
                "country": country,
                "market_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
        except Exception as e:
            logger.error(f"Critical error in get_market_data for {isin}: {e}")
            return {
                "symbol": isin,
                "price": 0.0,
                "currency": "USD",
                "base_price": 0.0,
                "fx_rate": 1.0,
                "name": isin,
                "sector": sector,
                "country": country,
                "market_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }

    @classmethod
    @functools.lru_cache(maxsize=128)
    def get_dividend_metrics(cls, isin: str):
        """
        Fetches trailing 12-month dividend sum and official upcoming dividend.
        Returns: { trailing_sum: float, next_date: str|None, next_amount: float|None }
        """
        try:
            ticker = yf.Ticker(isin)
            info = ticker.info
            
            # 1. Trailing 12 Months Sum
            # yfinance info often has 'dividendRate' (forward) vs 'trailingAnnualDividendYield'
            # We'll calculate it ourselves from history for accuracy.
            one_year_ago = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')
            div_history = cls.get_dividend_history(isin, one_year_ago)
            trailing_sum = float(div_history.sum()) if not div_history.empty else 0.0
            
            # 2. Official Declared Upcoming Dividend
            # yfinance provides these in the .info dict (if declared)
            next_date_unf = info.get('exDividendDate') # This is a timestamp
            next_amount = info.get('dividendRate') # This might be the annual rate, we need to be careful
            
            # Better way for next amount: check if there's a declared dividend in the 'dividends' series 
            # that is > today's date.
            today = pd.Timestamp(datetime.now().date())
            all_divs = ticker.dividends
            if not all_divs.empty:
                all_divs.index = all_divs.index.tz_localize(None) if all_divs.index.tz is None else all_divs.index.tz_convert(None)
                upcoming = all_divs[all_divs.index >= today]
                if not upcoming.empty:
                    # Map the first upcoming
                    next_date_ts = upcoming.index[0]
                    return {
                        "trailing_sum": trailing_sum,
                        "next_date": next_date_ts.strftime('%Y-%m-%d'),
                        "next_amount": float(upcoming.iloc[0])
                    }

            # Fallback for next_date if not found in series but in info
            next_date = None
            if next_date_unf:
                try:
                    next_date = datetime.fromtimestamp(next_date_unf).strftime('%Y-%m-%d')
                except:
                    pass
            
            return {
                "trailing_sum": trailing_sum,
                "next_date": next_date,
                "next_amount": None # Amount is hard to guess from info.dividendRate (it's often annualized)
            }
        except Exception as e:
            logger.error(f"Error fetching dividend metrics for {isin}: {e}")
            return {"trailing_sum": 0.0, "next_date": None, "next_amount": None}

    @classmethod
    def _fetch_lookthrough(cls, isin: str):
        """
        Attempts to access premium Financial Data APIs (EODHD, FMP) for exact fund breakdowns.
        Returns: (sector_dict, country_dict) or ({}, {}) if unavailable/blocked by Free Tier.
        """
        fmp_key = os.getenv("FMP_API_KEY")
        eodhd_key = os.getenv("EODHD_API_KEY")

        # In a real deployed environment, if an active paid key exists, this will intercept
        # the simple string tagging and return perfect JSON distributions.
        if fmp_key and "your_fmp" not in fmp_key:
            try:
                # FMP ETF Sector Weightings API
                res = requests.get(f"https://financialmodelingprep.com/api/v4/etf-sector-weightings?symbol={isin}&apikey={fmp_key}", timeout=2)
                if res.status_code == 200 and isinstance(res.json(), list) and len(res.json()) > 0:
                    sectors = {item['sector']: float(item['weightPercentage'].strip('%'))/100 for item in res.json() if 'sector' in item}
                    return sectors, {}
            except Exception:
                pass
                
        if eodhd_key and "your_eodhd" not in eodhd_key:
            try:
                # EODHD Fundamental API (Perfect for LU ISIN Mutual Funds)
                res = requests.get(f"https://eodhd.com/api/fundamentals/{isin}.XFRA?api_token={eodhd_key}&fmt=json", timeout=2)
                if res.status_code == 200:
                    data = res.json()
                    if 'MutualFund_Data' in data and 'Sector_Weights' in data['MutualFund_Data']:
                        sectors = {k: float(v)/100 for k,v in data['MutualFund_Data']['Sector_Weights'].items()}
                        countries = {k: float(v)/100 for k,v in data['MutualFund_Data'].get('World_Regions', {}).items()}
                        return sectors, countries
            except Exception:
                pass
                
        # Try yfinance native funds_data (Might crash for mutual funds on older yf versions)
        try:
            ticker = yf.Ticker(isin)
            if hasattr(ticker, 'funds_data') and ticker.funds_data.sector_weightings:
                return ticker.funds_data.sector_weightings, {}
        except Exception:
            pass

        return {}, {}

    @classmethod
    def _fetch_premium_price(cls, isin: str):
        """
        Attempts to access premium Financial Data APIs (EODHD, FMP) for live/EOD quotes.
        Returns: (price: float, name: str) or (None, None) if completely unavailable.
        """
        fmp_key = os.getenv("FMP_API_KEY")
        eodhd_key = os.getenv("EODHD_API_KEY")
        
        # Priority 1: FMP (Extremely fast for standard ETFs/Stocks)
        if fmp_key and "your_fmp" not in fmp_key:
            try:
                res = requests.get(f"https://financialmodelingprep.com/api/v3/quote/{isin}?apikey={fmp_key}", timeout=2)
                if res.status_code == 200 and isinstance(res.json(), list) and len(res.json()) > 0:
                    data = res.json()[0]
                    return float(data.get('price', 0)), data.get('name')
            except Exception:
                pass
                
        # Priority 2: EODHD Real-Time Data (Excellent for LU Mutual Funds)
        if eodhd_key and "your_eodhd" not in eodhd_key:
            try:
                # EODHD returns {"close": 123.45} format
                res = requests.get(f"https://eodhd.com/api/real-time/{isin}?api_token={eodhd_key}&fmt=json", timeout=2)
                if res.status_code == 200:
                    data = res.json()
                    if 'close' in data and str(data['close']) != 'NA':
                        return float(data['close']), None # EODHD realtime doesn't return name usually
            except Exception:
                pass
        
        return None, None

    @classmethod
    def get_historical_price(cls, isin: str, date_str: str):
        """Fetch close price for a specific date. Fallback to latest available before date."""
        # 1. Provide exact match or fallback if it's today/yesterday
        d = datetime.strptime(date_str, "%Y-%m-%d")
        if d >= datetime.now() - timedelta(days=1):
            md = cls.get_market_data(isin)
            if md and md.get("price"):
                return md.get("price")
                
        ticker = yf.Ticker(cls._normalize_for_yahoo(isin))
        
        # 2. Look up to 5 days backwards to catch weekends/holidays
        start_date = (d - timedelta(days=5)).strftime("%Y-%m-%d")
        end_date = (d + timedelta(days=1)).strftime("%Y-%m-%d")
        hist = ticker.history(start=start_date, end=end_date)
        
        if not hist.empty:
            return hist['Close'].iloc[-1]
            
        # 3. Fallback: get all history, take the latest price before or at date_str
        import pandas as pd
        hist_all = ticker.history(period="max")
        if not hist_all.empty:
            try:
                # Need to match tz or make it naive
                hist_all.index = pd.to_datetime(hist_all.index).tz_localize(None)
                hist_before = hist_all[hist_all.index <= d]
                if not hist_before.empty:
                    return hist_before['Close'].iloc[-1]
            except Exception:
                pass
            return hist_all['Close'].iloc[0] # Return oldest if requested date is prior to IPO
        return 0.0

    @classmethod
    @functools.lru_cache(maxsize=128)
    def _get_stooq_ticker(cls, isin: str) -> str:
        """Map common ISINs or symbols to Stooq ticker format."""
        # Simple heuristic mappings
        if len(isin) == 3 or isin in ['VOO', 'QQQ', 'SPY', 'DIA', 'IWM']:
            return f"{isin}.US"
        if isin.endswith('.HK'):
            return isin.replace('.HK', '.HK') # Stooq usually uses xxxx.HK
        # If it looks like a US ticker but no suffix
        if isin.isalpha() and len(isin) <= 5:
            return f"{isin}.US"
        return isin

    @classmethod
    def get_proxy_ticker(cls, isin: str) -> str:
        """ Returns a high-history proxy ticker for an ISIN based on asset class. """
        upper_isin = isin.upper()

        # Step 1: Detect specific major markets/segments by ISIN pattern
        if upper_isin.endswith('.HK'):
            return "2800.HK" # HSI Proxy
        if upper_isin.endswith('.T'): 
            return "1306.T"   # TOPIX Proxy
        if upper_isin.endswith('.PA') or upper_isin.endswith('.DE'):
            return "VGK"      # Europe Equity Proxy

        # Step 2: Use metadata keyword matching (name lookup)
        # Note: calling internal instance methods from classmethod via global 'RealTime'
        try:
            from data_provider import RealTime
            meta = RealTime.get_market_data(isin)
            name = str(meta.get('name', '')).upper()
            
            # --- Bond/Fixed Income Detect ---
            if any(k in name for k in ['BOND', 'FI ', 'FIXED INCOME', 'TREASURY', 'GOVT', 'CORP', 'HIGH YIELD', 'CREDIT']):
                if 'HIGH YIELD' in name: return "HYG"
                if any(k in name for k in ['SHORT', 'ULTRA SHORT']): return "BIL"
                return "AGG" 

            # --- Tech/Growth Detect ---
            if any(k in name for k in ['TECH', 'NASDAQ', 'GROWTH', 'INNOVATION', 'CLOUD', 'AI ']):
                return "QQQ"

            # --- Dividend/Value Detect ---
            if any(k in name for k in ['DIVIDEND', 'VALUE', 'INCOME EQUITY']):
                return "VYM"

            # --- Real Estate ---
            if any(k in name for k in ['REIT', 'REAL ESTATE', 'PROPERTY', 'ESTATE']):
                return "VNQ"

            # --- Commodities/Gold ---
            if 'GOLD' in name: return "GLD"
            if any(k in name for k in [' COMM', 'NATURAL RESOURCE']): return "DBC"
            
        except Exception:
            pass

        # Step 3: Default country-based or global fallback
        return "SPY" # Ultimate Global Equity Fallback



    @classmethod
    def _fetch_stooq_historical(cls, isin: str) -> dict:
        """Fetch historical CSV from Stooq (No API Key required, very long history)."""
        ticker = cls._get_stooq_ticker(isin)
        url = f"https://stooq.com/q/d/l/?s={ticker}&i=d"
        results = {}
        try:
            res = requests.get(url, timeout=5)
            if res.status_code == 200 and len(res.text) > 100:
                import io
                df = pd.read_csv(io.StringIO(res.text))
                if not df.empty and 'Date' in df.columns and 'Close' in df.columns:
                    for _, row in df.iterrows():
                        results[str(row['Date'])] = float(row['Close'])
                    logger.info(f"Stooq: Successfully fetched {len(results)} days for {ticker}")
            return results
        except Exception as e:
            logger.error(f"Stooq Fetch Error for {ticker}: {e}")
            return {}

    @classmethod
    @functools.lru_cache(maxsize=128)
    def get_historical_series(cls, isin: str, days_back: int = 365) -> dict:
        """Fetch historical daily close prices for the past X days. 
           Returns a dictionary: {'YYYY-MM-DD': float_price}"""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days_back)
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")
        
        fmp_key = os.getenv("FMP_API_KEY")
        eodhd_key = os.getenv("EODHD_API_KEY")
        
        results = {}
        
        # Priority 1: EODHD (Extremely reliable for global ISINs)
        if eodhd_key and "your_eodhd" not in eodhd_key:
            try:
                res = requests.get(f"https://eodhd.com/api/eod/{isin}?api_token={eodhd_key}&fmt=json&from={start_str}&to={end_str}", timeout=4)
                if res.status_code == 200:
                    data = res.json()
                    # Check for FREE subscription warning (1-year limit)
                    has_warning = any('warning' in item for item in data[:5]) if isinstance(data, list) else False
                    
                    for item in data:
                        if 'date' in item and 'close' in item:
                            # Use 'close' (market price) instead of 'adjusted_close'
                            # to match consistent wealth reporting with cash/dividends.
                            results[item['date']] = float(item['close'])
                    
                    # FIX: Only return early if data is NOT truncated (approx 5 days a week)
                    # If we asked for 5 years but got 1 year, keep going to Stooq!
                    if results and not has_warning and len(results) > (days_back * 0.6): 
                        return results
            except Exception:
                pass
                
        # Priority 2: FMP
        if fmp_key and "your_fmp" not in fmp_key:
            try:
                res = requests.get(f"https://financialmodelingprep.com/api/v3/historical-price-full/{isin}?from={start_str}&to={end_str}&apikey={fmp_key}", timeout=4)
                if res.status_code == 200 and 'historical' in res.json():
                    fmp_data = res.json()['historical']
                    for item in fmp_data:
                        results[item['date']] = float(item['close'])
                    if len(results) > (days_back * 0.6):
                        return results
            except Exception:
                pass

        # Priority 3: Stooq (Ultimate Long-Term History Fallback)
        stooq_data = cls._fetch_stooq_historical(isin)
        if stooq_data:
            # Filter Stooq data for our requested range
            filtered_stooq = {k: v for k, v in stooq_data.items() if start_str <= k <= end_str}
            
            # Merge Strategy: Use Stooq to FILL gaps, but keep existing higher-priority data
            if filtered_stooq:
                # We want to keep anything FMP/EODHD gave us, and add what Stooq has that they didn't
                # However, for 2020-2024 gaps, Stooq is the master.
                merged = filtered_stooq.copy()
                merged.update(results) # Current results (if any) overwrite Stooq's overlapping points
                results = merged
                
                # If we now have enough records, we can return
                if len(results) > (days_back * 0.5):
                    return results



        # Fallback: yfinance (vanilla — v8+ requires curl_cffi, do NOT pass custom session)
        try:
            ticker = yf.Ticker(isin)
            # FORCE auto_adjust=False explicitly so Close represents raw market price, excluding dividends!
            # Otherwise, yfinance returns Total Return series and Monte Carlo would double-count dividends.
            hist = ticker.history(start=start_str, end=end_str, auto_adjust=False)
            
            if hist.empty:
                # If start/end fails, try period="max" and filter
                hist = ticker.history(period="max", auto_adjust=False)
                if not hist.empty:
                    hist.index = hist.index.tz_localize(None) if hist.index.tz is None else hist.index.tz_convert(None)
                    hist = hist[(hist.index >= start_str) & (hist.index <= end_str)]
            
            for date, row in hist.iterrows():
                d_str = date.strftime("%Y-%m-%d") if hasattr(date, 'strftime') else str(date)[:10]
                results[d_str] = float(row['Close'])
        except Exception as e:
            logger.error(f"YFinance Historical Error for {isin}: {e}")
            pass
            
        return results

    @classmethod
    @functools.lru_cache(maxsize=128)
    def get_dividend_history(cls, isin: str, start_date: str):
        """Fetch all dividends since start_date."""
        # --- AKShare Default Gateway for A-share / HK-share dividends ---
        if AKShareGateway.is_target_market(isin):
            ak_divs = AKShareGateway.get_dividend_history(isin)
            if not ak_divs.empty:
                # Filter by start_date
                return ak_divs[ak_divs.index >= pd.Timestamp(start_date)]
            # If empty (unsupported ETF or failed HK), gracefully fall back to yfinance or others below.
            
        eodhd_key = os.getenv("EODHD_API_KEY")
        
        # --- LONG TERM UPGRADE: EODHD Premium Route for EU Mutual Funds ---
        if isin.startswith('LU') or isin.startswith('IE') or isin.startswith('0P'):
            if eodhd_key and "your_" not in eodhd_key:
                try:
                    import requests
                    # EODHD dividend endpoint (requires premium fundamental API tier)
                    url = f"https://eodhd.com/api/div/{isin}.XFRA?api_token={eodhd_key}&from={start_date}&fmt=json"
                    res = requests.get(url, timeout=3)
                    if res.status_code == 200:
                        data = res.json()
                        if data:
                            series_dict = {item['date']: float(item['value']) for item in data if 'date' in item and 'value' in item}
                            ser = pd.Series(series_dict, dtype=float)
                            if not ser.empty:
                                ser.index = pd.to_datetime(ser.index)
                                return ser
                    elif res.status_code == 402:
                        logger.warning(f"EODHD Div API: Payment Required for {isin}. Please upgrade API key tier.")
                except Exception as e:
                    logger.error(f"EODHD Div Fetch Error for {isin}: {e}")
                    
            # Funds that fail EODHD or lack premium key return empty series
            # Avoid sending raw LU/IE ISINs to yfinance which results in 404 spam.
            return pd.Series(dtype=float)

        # --- Standard yfinance Route ---
        try:
            ticker = yf.Ticker(isin)
            divs = ticker.dividends
            if divs.empty:
                return pd.Series(dtype=float)
            # Normalize to timezone-naive
            divs.index = divs.index.tz_localize(None) if divs.index.tz is None else divs.index.tz_convert(None)
            return divs[divs.index >= pd.Timestamp(start_date)]
        except Exception:
            return pd.Series(dtype=float)


RealTime = RealTimeProvider()
