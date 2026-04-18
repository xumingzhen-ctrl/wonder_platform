import sys
sys.path.append('backend')
from insurance_parser import parse_insurance_plan
with open('saving plan cash flow.xlsx', 'rb') as f:
    res = parse_insurance_plan(f.read(), 'saving plan cash flow.xlsx')

print(res['years'][0:5])
