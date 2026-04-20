import sys
import os
sys.path.append(os.getcwd())
from database import engine, Base
from models.company import User, UserToken
from sqlalchemy import text

def migrate():
    # 1. 创建新表
    Base.metadata.create_all(bind=engine)
    print("Tables created (if they didn't exist).")

    # 2. 检查并添加 is_verified 列 (SQLite 不支持 IF NOT EXISTS 在 ADD COLUMN 中，所以需要 try-except)
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT 0"))
            conn.commit()
            print("Added is_verified column to users table.")
        except Exception as e:
            if "duplicate column name" in str(e).lower():
                print("Column is_verified already exists.")
            else:
                print(f"Error adding column: {e}")

if __name__ == "__main__":
    migrate()
