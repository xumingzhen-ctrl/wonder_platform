import sys
sys.path.append('backend')
from insurance_parser import parse_insurance_plan
with open('withdraw plan.xlsx', 'rb') as f:
    res = parse_insurance_plan(f.read(), 'withdraw plan.xlsx')
print(res)
