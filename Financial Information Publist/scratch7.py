import sys
sys.path.append('backend')
from insurance_parser import _KEYWORD_MAP, _match_column
texts = ["已缴保费总额", "退保发还总额", "期末总现金价值"]
for t in texts:
    print(f"{t}: {_match_column(t)}")
