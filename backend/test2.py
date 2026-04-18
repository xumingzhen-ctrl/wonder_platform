from database import SessionLocal
from services.financial_report import build_pnl
from models.company import Company
import json

db = SessionLocal()
companies = db.query(Company).all()
for c in companies:
    print(f"\n--- Company: {c.name_zh} ---")
    pnl = build_pnl(db, c.id, "2024-25")
    print(json.dumps(pnl, ensure_ascii=False, indent=2))
