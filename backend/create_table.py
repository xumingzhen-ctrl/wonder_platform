from database import engine, Base
from models.company import CompanyTaxProfile
CompanyTaxProfile.__table__.create(bind=engine, checkfirst=True)
print("CompanyTaxProfile table created successfully.")
