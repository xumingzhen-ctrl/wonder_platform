# PortfolioHub (Financial Information Publist)

**PortfolioHub** is a high-performance, professional-grade portfolio management system and investment strategy laboratory. It combines modern fintech aesthetics (Glassmorphism, Dark Mode) with institutional-grade quantitative analysis (Modern Portfolio Theory, Monte Carlo Lifecycle Projections).

---

## 🏛 System Architecture & File Directory

### 1. Frontend: The Presentation Layer (`/frontend`)
The frontend is a single-page application (SPA) built with **React 18** and **Vite**, prioritizing performance and visual impact.

- **`src/App.jsx`**: **Main Orchestrator.**
  - **State Management**: Handles user authentication, live portfolio tracking, and Strategy Lab session state.
  - **Component Composition**: Integrates the side navigation, asset sandbox, portfolio stats, and the Recharts-based visualization engine.
  - **API Client**: Contains all `fetch` logic for communicating with the Python backend.
  - *Key Section*: `handleRunLabAnalysis` - triggers the complex quantitative analysis sequence.
- **`src/index.css`**: **Global Design System.**
  - Implements the "Premium Glass" aesthetic using advanced CSS filters (backdrop-blur), curated HSL color palettes, and responsive grid systems.
- **`src/main.jsx`**: React entry point initializing the Virtual DOM.

### 2. Backend: The Quantitative Core (`/backend`)
A high-throughput API service powered by **FastAPI** and **Uvicorn**, optimized for heavy mathematical computations using `NumPy`, `Pandas`, and `SciPy`.

#### API & Orchestration
- **`api_server.py`**: **The API Gateway.**
  - Defines the RESTful surface area (Endpoints for Portfolios, Analysis, and Data Sync).
  - Uses Pydantic models (`AnalyzeRequest`) for strict request validation, ensuring the frontend sends correctly typed simulation parameters (Contribution Years, Withdrawal Start, etc.).

#### Quantitative Engines
- **`strategy_lab.py`**: **The Mathematical Engine.**
  - **Portfolio Optimizer**: Implements Modern Portfolio Theory (MPT) to calculate the "Efficient Frontier", Max Sharpe Ratio, and Minimum Volatility portfolios.
  - **Monte Carlo Simulator**: Runs 10,000 parallel paths using Geometric Brownian Motion (GBM). It incorporates a custom "Life Cycle" loop that injects/withdraws capital at specific time-steps `t`.
  - **Stress Testing**: Dynamically reconstructs the covariance matrix by spiking asset correlations to simulate systemic "Liquidity Crises".
- **`portfolio_engine.py`**: **The Ledger Engine.**
  - Manages the "Single Source of Truth" for portfolios using double-entry ledger logic.
  - Calculates complex metrics like Time-Weighted Return (TWR), Money-Weighted Return (MWR), Net Asset Value (NAV), and Dividend Yield on Cost (YOC).

#### Data & Connectivity
- **`data_provider.py`**: **Market Data Layer.**
  - Integrates with Yahoo Finance (yfinance) to fetch real-time and historical adjust OHLC data.
  - Handles caching and asset symbol normalization (e.g., converting tickers to 12-digit ISINs if necessary).
- **`broker_file_parser.py`**: **Automated Data Entry.**
  - Uses **Gemini Vision API** for AI-driven OCR to parse screenshots of brokerage statements.
  - Uses `pdfplumber` for high-fidelity data extraction from official PDF bank statements.

#### Persistence (SQLite)
- **`portfolio.db`**: Primary relational database for user strategies, transactions, and holdings.
- **`financial.db`**: High-performance cache for historical price time-series and dividend schedules.

---

## 🚀 Key Features Deep Dive

### 🔬 Strategy Lab: Lifecycle Planning
Unlike basic CAGR calculators, the Strategy Lab simulates the complex reality of long-term investing:
1.  **Fixed-Horizon Contributions**: Define an "Annual Add" that stops after `X` years.
2.  **Delayed Withdrawals**: Plan for retirement by setting a "Withdrawal Start Year" (e.g., Year 20).
3.  **Capital Preservation**: The simulation enforces a floor at zero (bankruptcy protection), preventing unrealistic negative balance accumulation.
4.  **Success Probability Badge**: Located overlaying the MC chart, it counts the percentage of paths reaching your "Target Goal" and displays a high-impact color-coded badge (🟢 High Success / 🔴 High Risk).

### 📤 Smart Portfolio Sync
Integrates manual entries with automated broker imports.
- **Screenshot Recognition**: Simply upload a JPEG/PNG of your broker's holding page, and the system uses LLM-powered vision to extract ticker symbols, quantities, and costs.

---

## 🛠 Developer Onboarding (Where to Modify?)

| Goal | Target File(s) |
| :--- | :--- |
| **Change the mathematical model** for risk/return | `backend/strategy_lab.py` |
| **Fix a calculation error** (NAV, ROI, Performance) | `backend/portfolio_engine.py` |
| **Update the Dashboard UI** layout or colors | `frontend/src/App.jsx` + `index.css` |
| **Add a new Broker** statement format | `backend/broker_file_parser.py` |
| **Change Dividend logic** or Tax assumptions | `backend/portfolio_engine.py` |
| **Add new Portfolio data endpoints** | `backend/api_server.py` |

---

## 🚦 Getting Started (Local Setup)

1.  **Clone & Backend Setup**:
    ```bash
    cd backend
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    # Start the engine
    PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python uvicorn api_server:app --reload
    ```
2.  **Frontend Setup**:
    ```bash
    cd frontend
    npm install
    npm run dev
    ```
3.  **Environment Configuration**: Create a `.env` in the root or `/backend` to add your optional `GEMINI_API_KEY` for receipt/screenshot parsing.
