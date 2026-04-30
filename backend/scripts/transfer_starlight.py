import sys
import os
from pathlib import Path

# 将父目录加入路径以引用 models 和 database
sys.path.append(str(Path(__file__).parent.parent))

from database import SessionLocal
from models.company import User, Company, UserCompanyAccess

def transfer_permission():
    db = SessionLocal()
    try:
        # 1. 查找目标用户
        target_email = "27050016@qq.com"
        target_user = db.query(User).filter(User.email == target_email).first()
        if not target_user:
            print(f"错误：目标用户 {target_email} 不存在，请先确保该用户已在云端注册。")
            return

        # 2. 查找公司（支持模糊匹配）
        company_name_part = "星海國際"
        company = db.query(Company).filter(Company.name_zh.like(f"%{company_name_part}%")).first()
        if not company:
            print(f"错误：在数据库中找不到包含 '{company_name_part}' 的公司名称。")
            return

        # 3. 查找现有的管理员关联（从 admin@hk.com 转移）
        admin_email = "admin@hk.com"
        admin_user = db.query(User).filter(User.email == admin_email).first()
        
        # 4. 执行更新或创建
        # 检查 target_user 是否已经有了权限
        existing_access = db.query(UserCompanyAccess).filter(
            UserCompanyAccess.company_id == company.id,
            UserCompanyAccess.user_id == target_user.id
        ).first()

        if existing_access:
            print(f"提示：用户 {target_email} 已经拥有公司 '{company.name_zh}' 的权限。")
        else:
            # 查找 admin@hk.com 的旧权限并修改
            admin_access = None
            if admin_user:
                admin_access = db.query(UserCompanyAccess).filter(
                    UserCompanyAccess.company_id == company.id,
                    UserCompanyAccess.user_id == admin_user.id
                ).first()

            if admin_access:
                admin_access.user_id = target_user.id
                print(f"正在将公司 '{company.name_zh}' 的权限从 {admin_email} 转移至 {target_email}...")
            else:
                # 如果 admin 没有关联，则新建一个
                new_access = UserCompanyAccess(
                    user_id=target_user.id,
                    company_id=company.id,
                    role="admin"
                )
                db.add(new_access)
                print(f"正在为 {target_email} 新建公司 '{company.name_zh}' 的管理员权限...")

            db.commit()
            print("成功：权限转移操作已完成！")

    except Exception as e:
        db.rollback()
        print(f"操作失败：出现异常 {type(e).__name__}: {str(e)}")
    finally:
        db.close()

if __name__ == "__main__":
    transfer_permission()
