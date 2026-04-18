import pandas as pd
df = pd.read_excel('saving plan cash flow.xlsx', sheet_name='overview', header=None)
print("First 10 rows:")
print(df.head(10))
