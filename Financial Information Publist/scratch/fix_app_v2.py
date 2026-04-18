import sys, os
target_file = 'frontend/src/App.jsx'
with open(target_file, 'r') as f:
    text = f.read()

text = text.replace('tickFormatter={(val) => fmtAxis(Number(val), data.usd_to_base_fx || 1, data.base_currency || \'USD\')}', 
                    'tickFormatter={(val) => fmtAxis(Number(val), 1, data.base_currency || \'USD\')}')

text = text.replace('formatter={(value) => [fmtMoney(Number(value), data.usd_to_base_fx || 1, data.base_currency || \'USD\'), \'资产市值\']}', 
                    'formatter={(value) => [fmtMoney(Number(value), 1, data.base_currency || \'USD\'), \'资产市值\']}')

text = text.replace('title={fmtMoney(data.total_market_value || data.total_nav, data.usd_to_base_fx || 1, data.base_currency || \'USD\')}', 
                    'title={fmtMoney(data.total_market_value || data.total_nav, 1, data.base_currency || \'USD\')}')

text = text.replace('{fmtCompact(data.total_market_value || data.total_nav, data.usd_to_base_fx || 1, data.base_currency || \'USD\')}', 
                    '{fmtCompact(data.total_market_value || data.total_nav, 1, data.base_currency || \'USD\')}')

text = text.replace('title={fmtMoney(data.total_divs || 0, data.usd_to_base_fx || 1, data.base_currency || \'USD\')}', 
                    'title={fmtMoney(data.total_divs || 0, 1, data.base_currency || \'USD\')}')

text = text.replace('{fmtCompact(data.total_divs || 0, data.usd_to_base_fx || 1, data.base_currency || \'USD\')}', 
                    '{fmtCompact(data.total_divs || 0, 1, data.base_currency || \'USD\')}')

text = text.replace('{data.wallet_balance !== undefined && ` | Wallet: ${fmtMoney(data.wallet_balance, data.usd_to_base_fx || 1, data.base_currency || \'USD\')}`}', 
                    '{data.wallet_balance !== undefined && ` | Wallet: ${fmtMoney(data.wallet_balance, 1, data.base_currency || \'USD\')}`}')

with open(target_file, 'w') as f:
    f.write(text)
print('FRONTEND_FIX_DONE')
