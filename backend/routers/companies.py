from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models.company import User, Company, UserCompanyAccess, UserRole, CompanyTaxProfile
from schemas import CompanyCreate, CompanyUpdate, CompanyOut, CompanyTaxProfileOut, CompanyTaxProfileUpdate
from services.auth import get_current_user

router = APIRouter(prefix="/companies", tags=["公司管理"])


def _get_company_or_403(company_id: str, user: User, db: Session) -> Company:
    access = db.query(UserCompanyAccess).filter(
        UserCompanyAccess.company_id == company_id,
        UserCompanyAccess.user_id == user.id,
    ).first()
    if not access:
        raise HTTPException(status_code=403, detail="無此公司訪問權限")
    company = db.query(Company).filter(Company.id == company_id, Company.is_active == True).first()
    if not company:
        raise HTTPException(status_code=404, detail="公司不存在")
    return company


@router.get("/", response_model=List[CompanyOut])
def list_companies(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """取得當前用戶可存取的所有公司"""
    accesses = db.query(UserCompanyAccess).filter(UserCompanyAccess.user_id == current_user.id).all()
    company_ids = [a.company_id for a in accesses]
    return db.query(Company).filter(Company.id.in_(company_ids), Company.is_active == True).all()


@router.post("/", response_model=CompanyOut, status_code=201)
def create_company(
    data: CompanyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in ["admin", "premium"]:
        count = db.query(UserCompanyAccess).filter(UserCompanyAccess.user_id == current_user.id).count()
        if count >= 1:
            raise HTTPException(status_code=403, detail="免費版帳戶只能建立一間公司。如需建立更多，請升級帳戶。")

    company = Company(**data.model_dump())
    db.add(company)
    db.flush()

    # 自动赋予创建者 admin 权限
    access = UserCompanyAccess(
        user_id=current_user.id,
        company_id=company.id,
        role=UserRole.admin,
    )
    db.add(access)
    db.commit()
    db.refresh(company)
    return company


@router.get("/{company_id}", response_model=CompanyOut)
def get_company(
    company_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _get_company_or_403(company_id, current_user, db)


@router.put("/{company_id}", response_model=CompanyOut)
def update_company(
    company_id: str,
    data: CompanyUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company = _get_company_or_403(company_id, current_user, db)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(company, field, value)
    db.commit()
    db.refresh(company)
    return company

@router.get("/{company_id}/tax-profile", response_model=CompanyTaxProfileOut)
def get_tax_profile(
    company_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company = _get_company_or_403(company_id, current_user, db)
    profile = db.query(CompanyTaxProfile).filter(CompanyTaxProfile.company_id == company_id).first()
    if not profile:
        profile = CompanyTaxProfile(company_id=company_id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile

@router.put("/{company_id}/tax-profile", response_model=CompanyTaxProfileOut)
def update_tax_profile(
    company_id: str,
    data: CompanyTaxProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company = _get_company_or_403(company_id, current_user, db)
    profile = db.query(CompanyTaxProfile).filter(CompanyTaxProfile.company_id == company_id).first()
    if not profile:
        profile = CompanyTaxProfile(company_id=company_id)
        db.add(profile)
        db.flush()
        
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
        
    db.commit()
    db.refresh(profile)
    return profile
