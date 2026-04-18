import logging
import pandas as pd

logging.basicConfig(level=logging.INFO)

from data_provider import RealTime

print("\n--- Testing A-Share Price (600519.SS) ---")
price_data = RealTime.get_market_data("600519.SS")
print(price_data)

print("\n--- Testing ETF Price (510300.SS) ---")
price_data_etf = RealTime.get_market_data("510300.SS")
print(price_data_etf)

print("\n--- Testing A-Share Dividends (600519.SS) ---")
divs = RealTime.get_dividend_history("600519.SS", "2020-01-01")
print(divs.tail())

print("\n--- Testing EODHD/FMP Fund (Keep Default ETF weights unharmed) ---")
# If it fails, that's fine (might not have API KEY)
from data_provider import RealTime
from dotenv import load_dotenv
load_dotenv()
try:
    s, c = RealTime._fetch_lookthrough("SPY")
    print("Lookthrough SPY sectors:", s)
except Exception as e:
    print("Lookthrough untouched, err:", e)
