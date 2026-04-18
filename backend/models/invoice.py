import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey, Numeric, Text, Integer, Enum as SAEnum
from sqlalchemy.orm import relationship
from database import Base
import enum


class InvoiceStatus(str, enum.Enum):
    draft = "draft"
    sent = "sent"
    paid = "paid"
    partial = "partial"
    overdue = "overdue"
    void = "void"


class PaymentMethod(str, enum.Enum):
    fps = "fps"
    bank_transfer = "bank_transfer"
    cheque = "cheque"
    cash = "cash"
    other = "other"


class Client(Base):
    __tablename__ = "clients"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=False)
    name_zh = Column(String(200), nullable=False)
    name_en = Column(String(200), nullable=True)
    contact_person = Column(String(100), nullable=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    address = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    company = relationship("Company", back_populates="clients")
    invoices = relationship("Invoice", back_populates="client")


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=False)
    client_id = Column(String(36), ForeignKey("clients.id"), nullable=True)

    invoice_number = Column(String(50), nullable=False)     # e.g. INV-2024-001
    invoice_type = Column(String(20), default="invoice")    # invoice / quotation
    status = Column(SAEnum(InvoiceStatus), default=InvoiceStatus.draft)

    # 客户信息快照（防止客户改变后历史发票失真）
    client_name = Column(String(200), nullable=False)
    client_address = Column(String(500), nullable=True)
    client_email = Column(String(255), nullable=True)

    issue_date = Column(DateTime, nullable=False, default=datetime.utcnow)
    due_date = Column(DateTime, nullable=True)

    currency = Column(String(3), default="HKD")
    subtotal = Column(Numeric(15, 2), default=0)
    discount_amount = Column(Numeric(15, 2), default=0)
    tax_amount = Column(Numeric(15, 2), default=0)  # 香港无VAT，但可能有其他税
    total_amount = Column(Numeric(15, 2), default=0)
    paid_amount = Column(Numeric(15, 2), default=0)

    notes = Column(Text, nullable=True)                     # 备注
    terms = Column(Text, nullable=True)                     # 付款条款
    bank_info = Column(Text, nullable=True)                 # 收款银行信息

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company = relationship("Company", back_populates="invoices")
    client = relationship("Client", back_populates="invoices")
    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="invoice")

    @property
    def balance_due(self):
        return float(self.total_amount) - float(self.paid_amount)


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    invoice_id = Column(String(36), ForeignKey("invoices.id"), nullable=False)
    sort_order = Column(Integer, default=0)
    description = Column(Text, nullable=False)
    quantity = Column(Numeric(10, 2), default=1)
    unit_price = Column(Numeric(15, 2), default=0)
    amount = Column(Numeric(15, 2), default=0)

    invoice = relationship("Invoice", back_populates="items")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    invoice_id = Column(String(36), ForeignKey("invoices.id"), nullable=False)
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=False)

    payment_date = Column(DateTime, nullable=False, default=datetime.utcnow)
    amount = Column(Numeric(15, 2), nullable=False)
    method = Column(SAEnum(PaymentMethod), default=PaymentMethod.bank_transfer)
    reference = Column(String(200), nullable=True)  # 交易参考号
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    invoice = relationship("Invoice", back_populates="payments")
