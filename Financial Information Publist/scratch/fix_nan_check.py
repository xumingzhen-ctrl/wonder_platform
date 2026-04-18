import sys, os

target_file = 'backend/portfolio_engine.py'
with open(target_file, 'r') as f:
    text = f.read()

# Replace both occurrences
text = text.replace('if not price or price <= 0:', 'if price is None or pd.isna(price) or price <= 0:')

with open(target_file, 'w') as f:
    f.write(text)
print('REPLACED_NAN_CHECK')
