from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models.company import User
from schemas import UserOut
from services.auth import get_current_user
from pydantic import BaseModel

router = APIRouter(prefix="/admin", tags=["系統管理"])

class UserPremiumToggle(BaseModel):
    is_premium: bool

@router.get("/users", response_model=List[UserOut])
def list_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """取得系統所有用戶 (僅限 Admin)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="權限不足，僅限系統管理員訪問")
    
    return db.query(User).order_by(User.created_at.desc()).all()

@router.post("/users/{user_id}/toggle-premium", response_model=UserOut)
def toggle_user_premium(
    user_id: str,
    data: UserPremiumToggle,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """設置用戶為 Premium 或 Free (僅限 Admin)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="權限不足，僅限系統管理員訪問")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用戶不存在")
    
    # 如果目标是 admin，禁止修改（或根据需求调整）
    if user.role == "admin":
        raise HTTPException(status_code=400, detail="不能修改管理員角色")
        
    user.role = "premium" if data.is_premium else "free"
    db.commit()
    db.refresh(user)
    return user
