from database import SessionLocal
from models.company import User, Company, UserCompanyAccess, UserRole
from models.invoice import Client, Invoice, InvoiceItem, InvoiceStatus, PaymentMethod, Payment
from models.expense import ExpenseCategory
from services.auth import hash_password
from datetime import datetime, timedelta

def seed_data():
    db = SessionLocal()
    
    if db.query(User).filter(User.email == "admin@hk.com").first():
        print("User already exists. Skipping user creation, proceeding to seed categories...")
    else:
        print("Seeding initial data...")

    # 1. Create User
    admin = db.query(User).filter(User.email == "admin@hk.com").first()
    if not admin:
        admin = User(
            email="admin@hk.com",
            name="Admin User",
            password_hash=hash_password("password123")
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

    # 2. Create Company
    company = db.query(Company).filter(Company.name_zh == "香港智匯科技有限公司").first()
    if not company:
        company = Company(
            name_zh="香港智匯科技有限公司",
            name_en="HK Tech Solutions Ltd.",
            cr_number="2839912",
            br_number="58291038",
            base_currency="HKD",
            address="Unit 1, 15/F, Startup Tower, Kwun Tong, Kowloon, Hong Kong",
            email="billing@hktechsolutions.com"
        )
        db.add(company)
        db.commit()
        db.refresh(company)

    # 3. UserCompanyAccess
    access = db.query(UserCompanyAccess).filter(UserCompanyAccess.user_id == admin.id, UserCompanyAccess.company_id == company.id).first()
    if not access:
        access = UserCompanyAccess(
            user_id=admin.id,
            company_id=company.id,
            role=UserRole.admin
        )
        db.add(access)

    # 4. Clients
    client1 = db.query(Client).filter(Client.name_en == "GBA Logistics Ltd").first()
    if not client1:
        client1 = Client(
            company_id=company.id,
            name_zh="大灣區物流有限公司",
            name_en="GBA Logistics Ltd",
            contact_person="陳先生",
            email="accounts@gbalogistics.com",
            phone="+852 9876 5432",
            address="12/F, Industrial Bldg, Kwai Chung, NT"
        )
        db.add(client1)
    
    client2 = db.query(Client).filter(Client.name_en == "Starlight Ventures").first()
    if not client2:
        client2 = Client(
            company_id=company.id,
            name_zh="星辰創投",
            name_en="Starlight Ventures",
            contact_person="李小姐",
            email="finance@starlight.vc",
            phone="+852 6543 2109",
            address="Central, Hong Kong"
        )
        db.add(client2)
    db.commit()

    # 4.5 预置保险展业核心 ExpenseCategories
    expense_categories = [
        {"name_zh": "市场推广餐饮应酬", "code": "MKT_ENTERTAINMENT", "hk_tax_deductible": "yes", "hk_tax_note": "文件第3节第1条（需记录客户名+目的）"},
        {"name_zh": "客户礼品", "code": "MKT_GIFT", "hk_tax_deductible": "partial", "hk_tax_note": "文件第3节第1条（数额须合理）"},
        {"name_zh": "办公室租金", "code": "OFFICE_RENT", "hk_tax_deductible": "yes", "hk_tax_note": "办公室租金（含共享空间）"},
        {"name_zh": "印花税", "code": "STAMP_DUTY", "hk_tax_deductible": "yes", "hk_tax_note": "租约印花税"},
        {"name_zh": "物业管理费", "code": "MGMT_FEE", "hk_tax_deductible": "yes", "hk_tax_note": "属业务开支"},
        {"name_zh": "专业及法律费用", "code": "PROFESSIONAL", "hk_tax_deductible": "yes", "hk_tax_note": "律师/会计师等报酬"},
        {"name_zh": "家庭办公室分摊开支", "code": "OFFICE_HOME_PARTIAL", "hk_tax_deductible": "partial", "hk_tax_note": "部分扣除（以实际业务比例）"},
        {"name_zh": "雇员薪酬", "code": "STAFF_SALARY", "hk_tax_deductible": "yes", "hk_tax_note": "助理/秘书等（须真实雇佣+MPF供款）"},
        {"name_zh": "分代理人佣金", "code": "SUBAGENT_COMMISSION", "hk_tax_deductible": "yes", "hk_tax_note": "须IR56M申报"},
        {"name_zh": "介绍费", "code": "REFERRAL_FEE", "hk_tax_deductible": "yes", "hk_tax_note": "文件第3节第3条"},
        {"name_zh": "电脑/手机设备", "code": "EQUIPMENT", "hk_tax_deductible": "depreciation", "hk_tax_note": "资本额折旧摊销"},
        {"name_zh": "持续进修课程(CPD)", "code": "TRAINING_CPD", "hk_tax_deductible": "yes", "hk_tax_note": "文件第3节第4条"},
        {"name_zh": "强积金自雇供款", "code": "MPF_SELF", "hk_tax_deductible": "yes", "hk_tax_note": "自雇人士强积金供款上限扣减"},
        {"name_zh": "私人家庭开支", "code": "PRIVATE_EXPENSE", "hk_tax_deductible": "no", "hk_tax_note": "红线严禁税务扣除项"},
        {"name_zh": "东主或配偶薪酬", "code": "OWNER_SALARY", "hk_tax_deductible": "no", "hk_tax_note": "红线严禁税务扣除项"},
        {"name_zh": "资本性支出", "code": "CAPITAL_EXPENSE", "hk_tax_deductible": "no", "hk_tax_note": "未摊销部分不可抵扣"}
    ]
    for cat_data in expense_categories:
        cat = db.query(ExpenseCategory).filter(ExpenseCategory.code == cat_data["code"]).first()
        if not cat:
            db.add(ExpenseCategory(
                name_zh=cat_data["name_zh"],
                code=cat_data["code"],
                hk_tax_deductible=cat_data["hk_tax_deductible"],
                hk_tax_note=cat_data["hk_tax_note"]
            ))
    db.commit()

    # 5. Invoices
    today = datetime.utcnow()
    
    # Invoice 1: Draft
    if not db.query(Invoice).filter(Invoice.invoice_number == "INV-2026-001").first():
        inv1 = Invoice(
            company_id=company.id,
            client_id=client1.id,
            invoice_number="INV-2026-001",
            status=InvoiceStatus.draft,
            client_name=client1.name_zh,
            client_address=client1.address,
            client_email=client1.email,
            issue_date=today,
            due_date=today + timedelta(days=14),
            total_amount=15000,
            subtotal=15000,
            bank_info="FPS: 1234567"
        )
        db.add(inv1)
        db.commit()
        db.refresh(inv1)
        
        item1 = InvoiceItem(
            invoice_id=inv1.id,
            description="IT 基礎架構設置服務",
            quantity=1,
            unit_price=15000,
            amount=15000
        )
        db.add(item1)

    # Invoice 2: Sent
    if not db.query(Invoice).filter(Invoice.invoice_number == "INV-2026-002").first():
        inv2 = Invoice(
            company_id=company.id,
            client_id=client2.id,
            invoice_number="INV-2026-002",
            status=InvoiceStatus.sent,
            client_name=client2.name_zh,
            client_address=client2.address,
            client_email=client2.email,
            issue_date=today - timedelta(days=5),
            due_date=today + timedelta(days=9),
            total_amount=8000,
            subtotal=8000,
            bank_info="FPS: 1234567"
        )
        db.add(inv2)
        db.commit()
        db.refresh(inv2)
        
        item2 = InvoiceItem(
            invoice_id=inv2.id,
            description="季度網站維護",
            quantity=2,
            unit_price=4000,
            amount=8000
        )
        db.add(item2)

    # Invoice 3: Paid
    if not db.query(Invoice).filter(Invoice.invoice_number == "INV-2026-003").first():
        inv3 = Invoice(
            company_id=company.id,
            client_id=client1.id,
            invoice_number="INV-2026-003",
            status=InvoiceStatus.paid,
            client_name=client1.name_zh,
            client_address=client1.address,
            client_email=client1.email,
            issue_date=today - timedelta(days=30),
            due_date=today - timedelta(days=16),
            total_amount=12000,
            subtotal=12000,
            paid_amount=12000,
            bank_info="FPS: 1234567"
        )
        db.add(inv3)
        db.commit()
        db.refresh(inv3)
        
        item3 = InvoiceItem(
            invoice_id=inv3.id,
            description="伺服器遷移",
            quantity=1,
            unit_price=12000,
            amount=12000
        )
        db.add(item3)
        
        pay1 = Payment(
            invoice_id=inv3.id,
            company_id=company.id,
            payment_date=today - timedelta(days=20),
            amount=12000,
            method=PaymentMethod.fps,
            reference="FPS-992323"
        )
        db.add(pay1)

    # Invoice 4: Overdue
    if not db.query(Invoice).filter(Invoice.invoice_number == "INV-2026-004").first():
        inv4 = Invoice(
            company_id=company.id,
            client_id=client2.id,
            invoice_number="INV-2026-004",
            status=InvoiceStatus.overdue,
            client_name=client2.name_zh,
            client_address=client2.address,
            client_email=client2.email,
            issue_date=today - timedelta(days=45),
            due_date=today - timedelta(days=15),
            total_amount=25000,
            subtotal=25000,
            bank_info="FPS: 1234567"
        )
        db.add(inv4)
        db.commit()
        db.refresh(inv4)
        
        item4 = InvoiceItem(
            invoice_id=inv4.id,
            description="定制化軟件開發第一階段",
            quantity=1,
            unit_price=25000,
            amount=25000
        )
        db.add(item4)

    # Invoice 5: Partial
    if not db.query(Invoice).filter(Invoice.invoice_number == "INV-2026-005").first():
        inv5 = Invoice(
            company_id=company.id,
            client_id=client1.id,
            invoice_number="INV-2026-005",
            status=InvoiceStatus.partial,
            client_name=client1.name_zh,
            client_address=client1.address,
            client_email=client1.email,
            issue_date=today - timedelta(days=10),
            due_date=today + timedelta(days=20),
            total_amount=50000,
            subtotal=50000,
            paid_amount=25000,
            bank_info="FPS: 1234567"
        )
        db.add(inv5)
        db.commit()
        db.refresh(inv5)
        
        item5 = InvoiceItem(
            invoice_id=inv5.id,
            description="定制化軟件开发",
            quantity=1,
            unit_price=50000,
            amount=50000
        )
        db.add(item5)

        pay2 = Payment(
            invoice_id=inv5.id,
            company_id=company.id,
            payment_date=today - timedelta(days=2),
            amount=25000,
            method=PaymentMethod.bank_transfer,
            reference="Tx39201"
        )
        db.add(pay2)

    db.commit()
    print("Seed data completed successfully!")

if __name__ == "__main__":
    seed_data()
