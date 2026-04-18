import sqlite3
import pandas as pd
data = {'shares': 1, 'market_value': 8116}
isin = 'CASH_CNY'
shares = int(data['shares']) if not isin.startswith('CASH_') else round(data['market_value'], 2)
print("computed:", shares)
