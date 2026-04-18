import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal
from models.company import User
from services.auth import hash_password

db = SessionLocal()

email = "admin@wonderhub.hk"
password = "WonderHub2024!"

user = db.query(User).filter(User.email == email).first()
if user:
    print(f"User {email} already exists. Updating password and role...")
    user.password_hash = hash_password(password)
    user.role = "admin"
    user.is_active = True
else:
    print(f"Creating new admin user {email}...")
    user = User(
        email=email,
        name="Administrator",
        password_hash=hash_password(password),
        role="admin",
        is_active=True
    )
    db.add(user)

db.commit()
print("Done!")
db.close()
