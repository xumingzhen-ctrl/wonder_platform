from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from models.company import User
from config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")


from fastapi import Depends, HTTPException, status, Query

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
    token_query: Optional[str] = Query(None, alias="token"),
    db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="無效的認證憑證",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    token = token_query
    if not token and credentials:
        token = credentials.credentials
        
    if not token:
        raise credentials_exception

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if user is None:
        raise credentials_exception
    return user


def require_role(min_role: str):
    """
    Check if the current user has the required system role.
    Role rank: admin > premium > free
    """
    ROLE_RANK = {"free": 0, "premium": 1, "admin": 2}
    
    def checker(current_user: User = Depends(get_current_user)):
        if ROLE_RANK.get(current_user.role, -1) < ROLE_RANK.get(min_role, 99):
            raise HTTPException(
                status_code=403,
                detail=f"此功能需要 {min_role} 或更高權限"
            )
        return current_user
    return checker


def get_optional_user(request) -> Optional[User]:
    """
    从请求中尝试解析用户身份，无 Token 或 Token 无效时返回 None（不抛异常）。
    用于需要"可选鉴权"的端点（如 /portfolios 根据角色过滤）。
    """
    from config import settings
    from database import SessionLocal

    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    # Also support ?token= query param
    if not token:
        token = request.query_params.get("token")
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        user_id: str = payload.get("sub")
        if not user_id:
            return None
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
            return user
        finally:
            db.close()
    except JWTError:
        return None
