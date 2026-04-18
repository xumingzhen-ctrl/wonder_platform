#!/usr/bin/env python3
"""
create_admin.py — 在 PortfolioHub 中创建第一个管理员账号
使用方法：python create_admin.py
"""
import sys
import os
import sqlite3

# 切换到 backend 目录，确保正确引用 DB 和 auth 模块
sys.path.insert(0, os.path.dirname(__file__))
from portfolio_engine import DB_PATH
from auth import hash_password

DEFAULT_EMAIL = "admin@wonderhub.hk"
DEFAULT_PASSWORD = "WonderHub2024!"
DEFAULT_NAME = "Derek (Admin)"

def create_admin():
    email = input(f"管理员邮箱 [{DEFAULT_EMAIL}]: ").strip() or DEFAULT_EMAIL
    password = input(f"管理员密码 [{DEFAULT_PASSWORD}]: ").strip() or DEFAULT_PASSWORD
    display_name = input(f"显示名称 [{DEFAULT_NAME}]: ").strip() or DEFAULT_NAME

    conn = sqlite3.connect(DB_PATH)
    try:
        existing = conn.execute("SELECT id FROM users WHERE email=?", (email.lower(),)).fetchone()
        if existing:
            # 已存在则升级为 admin
            conn.execute("UPDATE users SET role='admin', display_name=? WHERE email=?", (display_name, email.lower()))
            conn.commit()
            print(f"\n✅ 已将 {email} 升级为管理员角色")
        else:
            conn.execute(
                "INSERT INTO users (email, password_hash, display_name, role) VALUES (?,?,?,?)",
                (email.lower(), hash_password(password), display_name, "admin")
            )
            conn.commit()
            print(f"\n✅ 管理员账号创建成功！")
            print(f"   邮箱: {email}")
            print(f"   密码: {password}")
            print(f"   角色: admin")
    finally:
        conn.close()

if __name__ == "__main__":
    create_admin()
