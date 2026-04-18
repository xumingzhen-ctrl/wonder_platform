from routers.auth import router as auth_router
from routers.companies import router as companies_router
from routers.clients import router as clients_router
from routers.invoices import router as invoices_router

__all__ = ["auth_router", "companies_router", "clients_router", "invoices_router"]
