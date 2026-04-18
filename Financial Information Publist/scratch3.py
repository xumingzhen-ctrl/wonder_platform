import sys
sys.path.append('backend')
from insurance_parser import parse_insurance_plan
with open('withdraw plan.xlsx', 'rb') as f:
    res = parse_insurance_plan(f.read(), 'withdraw plan.xlsx')
try:
    with open('saving plan cash flow.xlsx', 'rb') as f:
        res2 = parse_insurance_plan(f.read(), 'saving plan cash flow.xlsx')
except Exception as e:
    res2 = str(e)
print("withdraw plan:")
for y in res.get('years', [])[:10]:
    print(f"Year {y['year']}: premium={y.get('premium')}")
print("saving plan:")
if isinstance(res2, dict) and 'years' in res2:
    for y in res2.get('years', [])[:10]:
        print(f"Year {y['year']}: premium={y.get('premium')}")
