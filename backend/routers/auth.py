from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import secrets
from datetime import datetime, timedelta
from database import get_db
from models.company import User, UserToken
from schemas import (
    LoginRequest, TokenResponse, UserCreate, UserOut, 
    ForgotPasswordRequest, ResetPasswordRequest, MessageResponse
)
from services.auth import verify_password, hash_password, create_access_token, get_current_user
from services.email import send_verification_email, send_reset_password_email

router = APIRouter(prefix="/auth", tags=["認證"])


@router.post("/register", response_model=UserOut, status_code=201)
def register(data: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="此電郵已被註冊")
    
    user = User(
        email=data.email,
        name=data.name,
        password_hash=hash_password(data.password),
        is_verified=False
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # 生成驗證 Token
    token_str = secrets.token_urlsafe(32)
    db_token = UserToken(
        user_id=user.id,
        token=token_str,
        type="verification",
        expires_at=datetime.utcnow() + timedelta(hours=24)
    )
    db.add(db_token)
    db.commit()

    # 發送驗證郵件
    send_verification_email(user.email, token_str, frontend_url=data.redirect_url or "http://localhost:5174")

    return user


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email, User.is_active == True).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="電郵或密碼錯誤")

    token = create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "name": user.name,
        "role": user.role
    })
    return TokenResponse(
        access_token=token,
        user_id=str(user.id),
        name=user.name,
        role=user.role
    )


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email, User.is_active == True).first()
    if user:
        # 生成重置 Token
        token_str = secrets.token_urlsafe(32)
        db_token = UserToken(
            user_id=user.id,
            token=token_str,
            type="reset",
            expires_at=datetime.utcnow() + timedelta(hours=1)
        )
        db.add(db_token)
        db.commit()
        
        # 發送郵件
        send_reset_password_email(user.email, token_str, frontend_url=data.redirect_url or "http://localhost:5174")
        
    # 始終返回成功，防止郵箱探測
    return {"message": "如果該電郵已註冊，您將很快收到密碼重設郵件。"}


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    db_token = db.query(UserToken).filter(
        UserToken.token == data.token,
        UserToken.type == "reset",
        UserToken.expires_at > datetime.utcnow()
    ).first()
    
    if not db_token:
        raise HTTPException(status_code=400, detail="無效或已過期的 Token")
        
    user = db.query(User).filter(User.id == db_token.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用戶不存在")
        
    user.password_hash = hash_password(data.new_password)
    db.delete(db_token) # Token 一次性使用
    db.commit()
    
    return {"message": "密碼已成功重設，請使用新密碼登錄。"}


@router.get("/verify-email", response_model=MessageResponse)
def verify_email(token: str, db: Session = Depends(get_db)):
    db_token = db.query(UserToken).filter(
        UserToken.token == token,
        UserToken.type == "verification",
        UserToken.expires_at > datetime.utcnow()
    ).first()
    
    if not db_token:
        raise HTTPException(status_code=400, detail="無效或已過期的驗證連結")
        
    user = db.query(User).filter(User.id == db_token.user_id).first()
    if user:
        user.is_verified = True
        db.delete(db_token)
        db.commit()
        return {"message": "電郵驗證成功！您的帳戶已激活。"}
    
    raise HTTPException(status_code=404, detail="用戶不存在")


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user
