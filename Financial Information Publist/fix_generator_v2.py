import re

file_path = "/Users/derek/Projects/Financial Information Publist/backend/report_generator.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update build_data_summary: set expected_return_pct to IRR p50
# Find where expected_return_pct is defined in the return dict
content = content.replace(
    '        "expected_return_pct": round(portfolio.get("expected_return", 0) * 100, 2),',
    '        "expected_return_pct": round(mc.get("irr", {}).get("p50", 0) * 100, 2),'
)

# 2. Update withdrawal_schedule to include insurance withdrawals
old_schedule_loop = r'''    withdrawal_schedule = \[\]
    for yr in range\(withdrawal_start, display_end \+ 1\):
        idx = yr - withdrawal_start
        amt = withdrawal_base \* \(\(1 \+ inflation_rate\) \*\* idx\)
        withdrawal_schedule\.append\(\{"year": yr, "amount": round\(amt\)\}\)'''

new_schedule_loop = '''    withdrawal_schedule = []
    for yr in range(withdrawal_start, display_end + 1):
        idx = yr - withdrawal_start
        # 1. 投资组合提取 (Nominal)
        pure_amt = withdrawal_base * ((1 + inflation_rate) ** idx)
        
        # 2. 保险组合提取 (Nominal)
        pt = chart_map.get(yr, {})
        ins_amt = pt.get("ins_withdrawal", 0)
        
        withdrawal_schedule.append({
            "year": yr, 
            "pure_amount": round(pure_amt),
            "ins_amount": round(ins_amt),
            "total_amount": round(pure_amt + ins_amt),
            "amount": round(pure_amt)  # Keep for backward compatibility if needed
        })'''

content = re.sub(old_schedule_loop, new_schedule_loop, content)

# 3. Update build_docx: Cover table label
content = content.replace('["预期年化收益", f"{s[\'expected_return_pct\']}%"]', '["规划内部收益率 IRR", f"{s[\'expected_return_pct\']}%"]')

# 4. Update build_docx: Withdrawal table headers and rows
old_w_table = r'''        w_headers = \["年份", "当年提取金额", "备注"\]
        w_rows = \[\]
        for i, w in enumerate\(s\["withdrawal_schedule"\]\):
            note = "基准年" if i == 0 else f"基准 × \(1\+\{s\['inflation_pct'\]\}%\)\^\{i\}，通胀调整后"
            w_rows\.append\(\[f"第\{w\['year'\]\}年", _fmt_dollar\(w\['amount'\]\), note\]\)
        _add_data_table\(doc, w_headers, w_rows, col_widths=\[0\.9, 1\.5, 4\.2\]\)'''

new_w_table = '''        # 判断是否有保险提取
        has_ins_w = any(w.get("ins_amount", 0) > 0 for w in s["withdrawal_schedule"])
        
        if has_ins_w:
            w_headers = ["年份", "持仓组合提取", "保险组合提取", "合计提款", "备注"]
            w_rows = []
            for i, w in enumerate(s["withdrawal_schedule"]):
                note = "基准年" if i == 0 else "通胀调整后"
                w_rows.append([
                    f"第{w['year']}年", 
                    _fmt_dollar(w['pure_amount']), 
                    _fmt_dollar(w['ins_amount']),
                    _fmt_dollar(w['total_amount']),
                    note
                ])
            _add_data_table(doc, w_headers, w_rows, col_widths=[0.8, 1.4, 1.4, 1.4, 1.6])
        else:
            w_headers = ["年份", "当年提取金额", "备注"]
            w_rows = []
            for i, w in enumerate(s["withdrawal_schedule"]):
                note = "基准年" if i == 0 else f"基准 × (1+{s['inflation_pct']}%)^{i}，通胀调整后"
                w_rows.append([f"第{w['year']}年", _fmt_dollar(w['pure_amount']), note])
            _add_data_table(doc, w_headers, w_rows, col_widths=[0.9, 1.5, 4.2])'''

content = re.sub(old_w_table, new_w_table, content)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated report_generator.py with IRR and Withdrawal columns")
