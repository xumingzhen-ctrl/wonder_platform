from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from models.company import User, UserCompanyAccess
from models.invoice import Client
from schemas import ClientCreate, ClientUpdate, ClientOut
from services.auth import get_current_user

router = APIRouter(prefix="/companies/{company_id}/clients", tags=["客戶管理"])


def _check_access(company_id: str, user: User, db: Session):
    access = db.query(UserCompanyAccess).filter(
        UserCompanyAccess.company_id == company_id,
        UserCompanyAccess.user_id == user.id,
    ).first()
    if not access:
        raise HTTPException(status_code=403, detail="無此公司訪問權限")


@router.get("/", response_model=List[ClientOut])
def list_clients(
    company_id: str,
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_access(company_id, current_user, db)
    q = db.query(Client).filter(Client.company_id == company_id, Client.is_active == True)
    if search:
        q = q.filter(
            Client.name_zh.ilike(f"%{search}%") |
            Client.name_en.ilike(f"%{search}%") |
            Client.contact_person.ilike(f"%{search}%")
        )
    return q.order_by(Client.name_zh).all()


@router.post("/", response_model=ClientOut, status_code=201)
def create_client(
    company_id: str,
    data: ClientCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_access(company_id, current_user, db)
    client = Client(company_id=company_id, **data.model_dump())
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@router.get("/{client_id}", response_model=ClientOut)
def get_client(
    company_id: str,
    client_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_access(company_id, current_user, db)
    client = db.query(Client).filter(Client.id == client_id, Client.company_id == company_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="客戶不存在")
    return client


@router.put("/{client_id}", response_model=ClientOut)
def update_client(
    company_id: str,
    client_id: str,
    data: ClientUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_access(company_id, current_user, db)
    client = db.query(Client).filter(Client.id == client_id, Client.company_id == company_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="客戶不存在")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(client, field, value)
    db.commit()
    db.refresh(client)
    return client


@router.delete("/{client_id}", status_code=204)
def delete_client(
    company_id: str,
    client_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_access(company_id, current_user, db)
    client = db.query(Client).filter(Client.id == client_id, Client.company_id == company_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="客戶不存在")
    client.is_active = False
    db.commit()
