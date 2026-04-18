import sys
from pathlib import Path

# 确保可以在 backend/ 目录直接运行
sys.path.insert(0, str(Path(__file__).parent))

from database import SessionLocal
from models.expense import Expense
from services.receipt_scanner import convert_to_hkd

def fix_all_expenses():
    db = SessionLocal()
    try:
        # 查找所有 HKD 金额为空的记录
        expenses = db.query(Expense).filter(Expense.amount_hkd == None).all()
        if not expenses:
            print("没有发现需要修复的记录。")
            return

        print(f"发现 {len(expenses)} 条记录缺失 HKD 金额，开始修复...")
        
        updated_count = 0
        for exp in expenses:
            if exp.total_amount is not None:
                exp.amount_hkd = convert_to_hkd(float(exp.total_amount), exp.currency or "HKD")
                updated_count += 1
                print(f"  [{exp.voucher_number}] {exp.currency} {exp.total_amount} -> HKD {exp.amount_hkd}")
        
        db.commit()
        print(f"修复完成：成功更新 {updated_count} 条记录。")
    except Exception as e:
        db.rollback()
        print(f"修复过程中发生错误: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    fix_all_expenses()
