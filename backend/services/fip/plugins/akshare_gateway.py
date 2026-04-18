import logging
import pandas as pd
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# Optional import to prevent crashing if akshare failed to install
try:
    import akshare as ak
    _AKSHARE_AVAILABLE = True
except ImportError:
    _AKSHARE_AVAILABLE = False
    logger.warning("AKShare is not installed. Gateway will return empty defaults.")

class AKShareGateway:
    """
    Dedicated Gateway for fetching Data for Greater China assets via AKShare.
    This prevents `yfinance` from poisoning A-share and ETF records,
    while leaving FMP/EODHD untouched for global ETFs.
    """

    _COMMON_NAME_MAP = {
        "600519": "贵州茅台",
        "300059": "东方财富",
        "000001": "平安银行",
        "00700": "腾讯控股",
        "09988": "阿里巴巴-SW",
        "03690": "美团-W",
        "02269": "药明生物",
        "09866": "蔚来-SW",
        "02382": "舜宇光学科技",
        "510300": "沪深300ETF",
        "159915": "创业板ETF",
        "513050": "中概互联网ETF"
    }

    @classmethod
    def get_name(cls, isin: str) -> str:
        """Returns Chinese name if known, else empty string"""
        symbol = cls._strip_suffix(isin)
        return cls._COMMON_NAME_MAP.get(symbol, "")

    @classmethod
    def is_target_market(cls, isin: str) -> bool:
        """Returns True if the asset is an A-share or HK-share/ETF"""
        isin = isin.upper()
        return isin.endswith('.SS') or isin.endswith('.SZ') or isin.endswith('.HK')

    @classmethod
    def _strip_suffix(cls, isin: str) -> str:
        """ 600519.SS -> 600519, 0700.HK -> 00700 """
        upper = isin.upper()
        if upper.endswith('.HK'):
            # akshare requires 5-digit for many HK interfaces, but some take 00700
            num = upper.replace(".HK", "").lstrip("0") or "0"
            return num.zfill(5)
        else:
            return upper.replace('.SS', '').replace('.SZ', '')

    @classmethod
    def get_price(cls, isin: str) -> float:
        """
        Attempts to get the latest close price for A-shares, HK-shares or domestic ETFs.
        """
        if not _AKSHARE_AVAILABLE or not cls.is_target_market(isin):
            return 0.0

        symbol = cls._strip_suffix(isin)
        
        try:
            if isin.endswith('.HK'):
                # Try HK stock history for today
                df_hk = ak.stock_hk_hist(symbol=symbol, period="daily", adjust="qfq")
                if not df_hk.empty:
                    return float(df_hk['收盘'].iloc[-1])
            else:
                # Try A-share individual stock first
                try:
                    df_a = ak.stock_zh_a_hist(symbol=symbol, period="daily", adjust="qfq")
                    if not df_a.empty:
                        return float(df_a['收盘'].iloc[-1])
                except Exception:
                    pass
                
                # If failed, try ETF logic
                try:
                    # Fund history EM is usually meta-rich
                    df_etf = ak.fund_etf_hist_em(symbol=symbol, period="daily", adjust="qfq")
                    if not df_etf.empty:
                        return float(df_etf['收盘'].iloc[-1])
                except Exception:
                    pass
                    
        except Exception as e:
            logger.debug(f"[AKShare] get_price failed for {isin}: {e}")
            
        return 0.0

    @classmethod
    def get_dividend_history(cls, isin: str) -> pd.Series:
        """
        Fetches dividend history for A-shares (specifically handling clean absolute prices).
        Returns a Pandas Series with index=Datetime, value=dividend_amount_per_share
        Returns empty Series if unsupported or fails.
        """
        if not _AKSHARE_AVAILABLE or not cls.is_target_market(isin):
            return pd.Series(dtype=float)

        symbol = cls._strip_suffix(isin)
        series_dict = {}

        try:
            if isin.endswith('.HK'):
                # akshare may not have a reliable hk dividend fast spot, leaving to yfinance fallback
                # but we will try if it ever gets added. Currently, fallback to empty is safer.
                pass
            else:
                # A-share specific dividend details
                df_div = ak.stock_history_dividend_detail(symbol=symbol)
                if not df_div.empty and '派息' in df_div.columns and '除权除息日' in df_div.columns:
                    for _, row in df_div.iterrows():
                        ex_date = row['除权除息日']
                        # Some ex_dates are NaT or None if not yet executed but announced
                        if pd.isna(ex_date) or row['进度'] != '实施':
                            continue
                            
                        # akshare's 派息 is generally "per 10 shares" (每10股派息) for A-shares.
                        # We must divide by 10 to match standard "per share" logic of Live Portfolio.
                        try:
                            amount_per_10 = float(row['派息'])
                            if amount_per_10 > 0:
                                parsed_date = pd.to_datetime(ex_date)
                                series_dict[parsed_date] = amount_per_10 / 10.0
                        except Exception:
                            pass
                            
        except Exception as e:
            logger.debug(f"[AKShare] get_dividend_history failed for {isin}: {e}")

        if series_dict:
            ser = pd.Series(series_dict, dtype=float)
            ser.index = pd.to_datetime(ser.index)
            # Sort chronologically to be safe
            return ser.sort_index()

        return pd.Series(dtype=float)

