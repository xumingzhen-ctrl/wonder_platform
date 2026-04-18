from sqlalchemy import Column, String, Integer, Float, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base

class Portfolio(Base):
    __tablename__ = "portfolios"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), unique=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    base_currency = Column(String(10), default='USD')
    dividend_strategy = Column(String(50), default='CASH')
    target_allocations = Column(Text, nullable=True)
    user_id = Column(String(36), ForeignKey('users.id'), nullable=True)
    is_public = Column(Integer, default=0)

class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    portfolio_id = Column(Integer, ForeignKey('portfolios.id'))
    date = Column(String(50))
    isin = Column(String(50))
    type = Column(String(50))
    shares = Column(Float)
    price = Column(Float)

class Price(Base):
    __tablename__ = "prices"
    id = Column(Integer, primary_key=True, autoincrement=True)
    isin = Column(String(50))
    date = Column(String(50))
    price = Column(Float)
    currency = Column(String(10))

class PriceCache(Base):
    __tablename__ = "price_cache"
    isin = Column(String(50), primary_key=True)
    date = Column(String(50), primary_key=True)
    price = Column(Float)
    name = Column(String(200))
    sector = Column(String(100))
    country = Column(String(100))

class DividendCache(Base):
    __tablename__ = "dividend_cache"
    isin = Column(String(50), primary_key=True)
    date = Column(String(50), primary_key=True)
    amount = Column(Float)

class ManualDividend(Base):
    __tablename__ = "manual_dividends"
    id = Column(Integer, primary_key=True, autoincrement=True)
    portfolio_id = Column(Integer, ForeignKey('portfolios.id'))
    isin = Column(String(50))
    date = Column(String(50))
    amount_per_share = Column(Float)
    currency = Column(String(10), default='USD')

class PortfolioHistory(Base):
    __tablename__ = "portfolio_history"
    id = Column(Integer, primary_key=True, autoincrement=True)
    portfolio_id = Column(Integer)
    date = Column(String(50))
    total_nav = Column(Float)
    wallet_balance = Column(Float)

class PortfolioStatsCache(Base):
    __tablename__ = "portfolio_stats_cache"
    portfolio_id = Column(Integer, primary_key=True)
    total_nav = Column(Float)
    wallet_balance = Column(Float)
    total_pnl = Column(Float)
    total_divs = Column(Float)
    cumulative_roi = Column(Float)
    annualized_return = Column(Float)
    details = Column(Text)
    dividend_history = Column(Text)
    last_updated = Column(String(50))

class Asset(Base):
    __tablename__ = "assets"
    isin = Column(String(50), primary_key=True)
    name = Column(String(200))
    ticker = Column(String(50))
    sector = Column(String(100))
    country = Column(String(100))
    updated_at = Column(DateTime, server_default=func.now())

class AdvisorClient(Base):
    __tablename__ = "advisor_clients"
    id = Column(Integer, primary_key=True, autoincrement=True)
    advisor_id = Column(String(36), ForeignKey('users.id'), nullable=False)
    client_id = Column(String(36), ForeignKey('users.id'), nullable=False)
    assigned_at = Column(DateTime, server_default=func.now())
    assigned_by = Column(String(36), ForeignKey('users.id'))
    is_active = Column(Integer, default=1)

class InsurancePlan(Base):
    __tablename__ = "insurance_plans"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    advisor_id = Column(String(36), ForeignKey('users.id'), nullable=False)
    client_id = Column(String(36), ForeignKey('users.id'))
    plan_data = Column(Text, nullable=False)
    excel_filename = Column(String(200))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime)
    is_template = Column(Integer, default=0)

class BrokerTrade(Base):
    __tablename__ = "broker_trades"
    id = Column(Integer, primary_key=True, autoincrement=True)
    portfolio_id = Column(Integer, ForeignKey('portfolios.id'))
    broker = Column(String(50))
    trade_date = Column(String(50))
    symbol = Column(String(50))
    side = Column(String(10))
    quantity = Column(Float)
    price = Column(Float)
    commission = Column(Float, default=0)
    currency = Column(String(10))
    order_id = Column(String(100))
    imported_at = Column(String(50))

class SyncMetadata(Base):
    __tablename__ = "sync_metadata"
    portfolio_id = Column(Integer, ForeignKey('portfolios.id'), primary_key=True)
    broker = Column(String(50))
    last_snapshot_at = Column(String(50))
    last_tx_sync_at = Column(String(50))
    nlv_usd = Column(Float, default=0)
    history_days = Column(Integer, default=90)
    history_warning = Column(Text)

class LabScenario(Base):
    __tablename__ = "lab_scenarios"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    assets_json = Column(Text, nullable=False)
    weights_json = Column(Text, nullable=False)
    settings_json = Column(Text, nullable=False)
    summary_json = Column(Text, nullable=False)
    chart_json = Column(Text, nullable=False)
