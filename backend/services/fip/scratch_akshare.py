import akshare as ak
import json
import logging
logger = logging.getLogger(__name__)

try:
    print("Testing A-share dividend (600519)")
    df = ak.stock_history_dividend_detail(symbol="600519")
    print(df.head(2).to_json(orient="records"))
except Exception as e:
    print("A-share div error:", e)

try:
    print("Testing HK-share dividend (00700)")
    df = ak.stock_hk_history_dividend_detail(symbol="00700")
    print(df.head(2).to_json(orient="records"))
except Exception as e:
    print("HK div err:", e)

try:
    print("Testing A-share/HK-share price (00700, 600519)")
    df1 = ak.stock_zh_a_spot_em()
    print("A-share spot length:", len(df1))
    df2 = ak.stock_hk_spot_em()
    print("HK-share spot length:", len(df2))
except Exception as e:
    print("Spot err:", e)

try:
    print("Testing ETF spot (510300)")
    df = ak.fund_etf_spot_em()
    print("ETF spot length:", len(df))
except Exception as e:
    print("ETF spot err:", e)

try:
    print("Testing ETF historical (510300)")
    df = ak.fund_etf_hist_em(symbol="510300", period="daily", start_date="20230101", end_date="20240101", adjust="qfq")
    print("ETF hist length:", len(df))
except Exception as e:
    print("ETF hist err:", e)

try:
    print("Testing 2800.HK ETF")
    # HK ETFs are often mixed with HK stocks in spot/hist
    df = ak.stock_hk_hist(symbol="02800", period="daily", start_date="20230101", end_date="20240101", adjust="qfq")
    print("2800 hist len:", len(df))
except Exception as e:
    print("2800.HK err:", e)

