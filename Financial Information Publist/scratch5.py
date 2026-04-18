import sys
sys.path.append('backend')
from insurance_parser import _read_headers
import openpyxl
wb = openpyxl.load_workbook('saving plan cash flow.xlsx', data_only=True)
print(_read_headers(wb.active))
