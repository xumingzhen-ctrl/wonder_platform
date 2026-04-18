# PortfolioHub 工程档案

> 生成时间：2026-04-11 | 版本：v1.0  
> 项目路径：`/Users/derek/Projects/Financial Information Publist`

---

## 一、项目定位

**PortfolioHub** 是一个本地运行的个人多资产投资组合管理系统，支持：
- 手动建仓/管理多个投资组合
- 券商账户实时同步（富途 Futu + Interactive Brokers IB）
- 全球多市场资产定价（美股、港股、欧股、ETF、共同基金）
- 股息追踪与再投资模拟（DRIP）
- 量化策略实验室（马科维茨优化 + 蒙特卡洛模拟）
- Word 格式分析报告导出

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                       macOS 本地环境                              │
│                                                                 │
│  PortfolioHub.command ──────────────────────────────────────┐   │
│  (一键启动脚本)                                               │   │
│       │ 启动                          │ 启动                  │   │
│       ▼                              ▼                       │   │
│  ┌─────────────┐              ┌────────────┐                 │   │
│  │  Backend    │              │  Frontend  │                 │   │
│  │  FastAPI    │◄─── REST ───►│  React+Vite│                 │   │
│  │  Port 8000  │              │  Port 5173 │                 │   │
│  └──────┬──────┘              └────────────┘                 │   │
│         │                                                    │   │
│    ┌────▼─────────────────────────────────────────────┐      │   │
│    │              SQLite  portfolio.db                 │      │   │
│    │  portfolios / transactions / price_cache          │      │   │
│    │  portfolio_history / portfolio_stats_cache        │      │   │
│    │  broker_trades / sync_metadata / assets           │      │   │
│    └──────────────────────────────────────────────────┘      │   │
│                                                               │   │
│    外部数据源优先链：                                           │   │
│    Futu OpenAPI → IB TWS → FMP API → EODHD → Stooq → yfinance│   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、目录结构

```
Financial Information Publist/
├── PortfolioHub.command        # 一键启动脚本（macOS .command）
├── portfolio.db                # 根目录 SQLite（冗余副本，已弃用）
├── test_*.py                   # 集成/单元测试脚本（散落根目录）
│
├── backend/
│   ├── api_server.py           # FastAPI 主服务（路由入口，760行）
│   ├── portfolio_engine.py     # 核心计算引擎（NAV/绩效/历史/再平衡）
│   ├── data_provider.py        # 行情数据层（多优先级价格链）
│   ├── strategy_lab.py         # 量化策略实验室（优化+蒙特卡洛）
│   ├── report_generator.py     # Word 报告生成器
│   ├── price_updater.py        # 定时任务（每日凌晨0:05更新价格）
│   ├── broker_file_parser.py   # 券商导入文件解析器（CSV/PDF/截图）
│   ├── broker_price_provider.py# 券商实时行情统一入口
│   ├── init_sqlite.py          # 数据库 Schema 初始化 & 在线迁移
│   ├── gateways/
│   │   ├── base.py             # 标准化数据类（BrokerPosition/Trade/Snapshot）
│   │   ├── futu_gateway.py     # 富途 OpenAPI 网关
│   │   └── ib_gateway.py       # IB TWS 网关（ib_insync）
│   ├── plugins/
│   │   ├── broker_sync.py      # 持仓快照同步插件
│   │   └── tx_sync.py          # 交易历史同步插件（WAC成本法）
│   ├── core/
│   │   └── __init__.py         # 核心模块占位（待填充）
│   ├── portfolio.db            # 主数据库（WAL 模式）
│   ├── .env                    # 环境变量（API Keys / Broker连接参数）
│   └── requirements.txt        # Python 依赖
│
└── frontend/
    ├── src/
    │   ├── App.jsx             # 主应用（单文件巨型组件，130KB！）
    │   ├── index.css           # 全局样式
    │   └── components/
    │       ├── BrokerImport.jsx # 券商文件导入组件
    │       └── BrokerSync.jsx  # 实时同步组件
    ├── package.json
    └── vite.config.js
```

---

## 四、核心模块职责

### 4.1 `api_server.py` — API 路由总线

| 路由分组 | 端点 | 说明 |
|---------|------|------|
| 投资组合管理 | `GET/POST/PUT/DELETE /portfolios` | CRUD |
| 交易记录 | `GET/PUT/POST/DELETE /portfolios/transactions/{id}` | 交易台账 |
| 报告 | `GET /report/{id}`, `GET /report/history/{id}` | NAV + 历史图表 |
| 心跳 | `GET /heartbeat/{id}` | 超快 NAV 轮询（读缓存，无外部调用）|
| 股息 | `GET/POST /portfolios/dividends/*` | 股息查询/手动录入 |
| 再平衡 | `GET/POST /portfolios/rebalance/*` | 预览 + 执行 |
| 同步(快照) | `POST /sync/ib`, `POST /sync/futu` | 持仓快照同步 |
| 同步(历史) | `POST /sync/ib/transactions`, `POST /sync/futu/transactions` | 交易历史同步+WAC重建 |
| 文件导入 | `POST /import/broker-file`, `POST /import/broker-file/confirm` | 两步导入流程 |
| 策略实验室 | `POST /lab/analyze`, `POST /lab/generate-report` | 组合优化+Word报告 |
| 管理 | `POST /admin/trigger_update` | 手动触发价格更新 |

**定时任务**：APScheduler 每日 `00:05` 触发 `update_daily_prices()`

### 4.2 `data_provider.py` — 多级价格链

```
价格查询优先级（RealTimeProvider.get_market_data）：
 1. SQLite price_cache（当日有效，元数据永久有效）
 2. Futu OpenAPI（港股批量拉取，毫秒级）
 3. FMP / EODHD Premium API（若API Key存在）
 4. yfinance fast_info（快速路径）
 5. yfinance history（慢速回退）
 6. get_historical_series 最近收盘价（最终兜底）

历史价格优先级（get_historical_series）：
 1. EODHD → 2. FMP → 3. Stooq CSV → 4. yfinance
```

**FX 汇率链**：`price_cache(1h TTL)` → `Broker` → `yfinance`

**代理回填（Proxy Backfill）**：上市不足2个月的资产，用同类基准（如QQQ/VNQ/AGG）作历史拼接延展。

### 4.3 `portfolio_engine.py` — 计算核心

| 方法 | 功能 |
|------|------|
| `get_current_portfolio()` | 重放所有交易得到当前持仓（WAC成本法） |
| `calculate_nav()` | 并发拉价格，计算总 NAV + 各仓绩效 |
| `calculate_performance()` | CAGR / 累计ROI |
| `get_dividend_details()` | 合并手动/自动股息，按持仓时间分配 |
| `get_dividend_projections()` | 12个月股息预测（含DRIP模拟） |
| `get_historical_chart_data()` | 月末 NAV 历史重建（并发拉历史价格） |
| `get_rebalance_preview()` | 再平衡差异计算 |
| `rebalance()` | 执行再平衡并写入台账 |

**关键设计**：持仓快照通过交易日志重放计算，不存储快照状态。

### 4.4 `strategy_lab.py` — 量化引擎

- **马科维茨优化**：最大夏普 / 最小波动 / 风险平价（3种结果同时输出）
- **历史回测**：Buy & Hold / 季度/月/年再平衡对比
- **蒙特卡洛 GBM**：10,000路径，支持定期注入/提取、通货膨胀、压力测试（相关系数矩阵恶化至0.8）
- **代理回填**：新资产用行业基准延展历史数据
- **数据质量卫兵**：
  - 最少252交易日硬性门槛
  - 建议504交易日软性警告
  - 瓶颈资产识别
  - 协方差矩阵正半定检查

### 4.5 Broker 网关层

```
BrokerPriceProvider（统一入口）
  ├── FutuGateway（港股/A股批量报价，持仓快照，90天历史）
  └── IBGateway（全球，ib_insync，今日成交记录）

Plugins:
  ├── broker_sync.py（持仓快照 → 重置式同步到transactions）
  └── tx_sync.py（交易历史 → WAC重建 → 增量写入）
```

---

## 五、数据库 Schema 概览

| 表名 | 用途 | 特殊字段 |
|------|------|---------|
| `portfolios` | 组合元数据 | `target_allocations` (JSON), `dividend_strategy` |
| `transactions` | 全量交易台账（核心） | type: BUY/SELL/CASH_IN/CASH_OUT/DIV_CASH |
| `price_cache` | 实时+元数据缓存 | `name/sector/country`，sector可存JSON(fund lookthrough) |
| `prices` | 每日价格快照 | 由定时任务写入 |
| `portfolio_history` | 每日NAV历史 | 支持历史图表 |
| `portfolio_stats_cache` | 最新完整报告缓存 | `details`(JSON)，心跳端点读此表 |
| `manual_dividends` | 手动录入股息 | 不覆盖自动股息 |
| `broker_trades` | 券商原始成交记录 | 不可变账本 |
| `sync_metadata` | 同步状态+限制信息 | `history_days`, `history_warning` |
| `assets` | 资产元数据 | 备用，可被price_cache覆盖 |

**数据库文件**：`backend/portfolio.db`（WAL模式，含 .shm/.wal）

---

## 六、启动流程

```
用户双击 PortfolioHub.command
  │
  ├─ 清理 8000/5173 端口残留进程
  ├─ 激活 backend/venv
  ├─ 启动 uvicorn api_server:app (port 8000) → 后台进程
  │    └─ API启动时：配置BrokerPriceProvider（读.env）
  │                  启动APScheduler（cron 00:05）
  ├─ 启动 npm run dev (port 5173) → 后台进程
  ├─ sleep 3s
  ├─ open http://localhost:5173
  └─ wait（Ctrl+C / 关闭窗口 → cleanup()）
```

---

## 七、当前已知问题 & 风险点

| 编号 | 风险点 | 严重程度 | 说明 |
|------|--------|---------|------|
| R-01 | `App.jsx` 单文件 130KB | 🔴 高 | 维护性极差，任何功能改动都在一个巨型文件中操作 |
| R-02 | SQLite WAL 文件未关闭 | 🔴 高 | `.wal` 文件达 2.9MB，`PortfolioEngine` 在 `__init__` 打开连接但无 `__del__`/`close()` 保证 |
| R-03 | `lru_cache` + 实例方法 | 🟠 中 | `get_market_data` 是实例方法但用 `@functools.lru_cache`，缓存不跟随实例生命周期，存在内存泄漏风险 |
| R-04 | 定时任务使用相对路径 | 🟠 中 | `price_updater.py` 中 `DB_PATH = "portfolio.db"` 是相对路径，与 `portfolio_engine.py` 的 `__file__` 绝对路径不一致 |
| R-05 | `allow_origins=["*"]` | 🟠 中 | CORS 全开，不适合任何非完全受信内网环境 |
| R-06 | 无请求认证 | 🟠 中 | API 完全无鉴权，局域网内任何设备均可访问 |
| R-07 | 测试文件散落根目录 | 🟡 低 | `test_*.py` 散落在项目根，不在 `backend/tests/` 中，CI/CD 无法统一运行 |
| R-08 | `requirements.txt` 无版本锁 | 🟡 低 | 所有依赖无版本号，`pip install` 可能引入破坏性更新 |
| R-09 | 两处数据库副本 | 🟡 低 | 根目录的 `portfolio.db` 与 `backend/portfolio.db` 可能引起混淆 |
| R-10 | `frontend/` 调试文件残留 | 🟡 低 | `debug_react.mjs`, `dom.js`, `screenshot.js` 等调试文件未清理 |
| R-11 | puppeteer 在生产依赖中 | 🟡 低 | `package.json` 的 `dependencies` 含 `puppeteer`（重度包），应移至 `devDependencies` |

---

## 八、改进建议（按优先级排序）

### 🔴 P0 — 立即修复（影响稳定性）

**[改进-01] 修复 `PortfolioEngine` 数据库连接泄漏**

```python
# 当前：在 __init__ 打开连接，无保证关闭
class PortfolioEngine:
    def __init__(self, portfolio_id: int):
        self.conn = sqlite3.connect(DB_PATH)  # ⚠️ 无处关闭

# 建议：改用上下文管理器或确保所有调用路径手动关闭
# 方案A：让 create_report() 传入已打开的 conn
# 方案B：用 contextlib.closing + with 语句
```

**[改进-02] 统一 `DB_PATH` 到单一路径常量**

```python
# price_updater.py 第10行
DB_PATH = "portfolio.db"   # ❌ 相对路径，取决于CWD

# 应改为
DB_PATH = os.path.join(os.path.dirname(__file__), "portfolio.db")
```

**[改进-03] `lru_cache` 改为模块级单例或 `@classmethod` + 类级缓存**

```python
# 当前：实例方法 + lru_cache，缓存绑定到实例而非类，每次实例化都是新缓存
@functools.lru_cache(maxsize=128)
def get_market_data(self, isin: str):  # ❌

# 建议：改为类级缓存字典（已有 RealTime = RealTimeProvider() 单例，本质正确，但 lru_cache 不感知 self）
# 最简修复：让 get_market_data 成为 @staticmethod 或完整抽离到模块级函数
```

---

### 🟠 P1 — 近期改进（架构健壮性）

**[改进-04] 拆分 `App.jsx` 为多个功能模块**

```
src/
├── pages/
│   ├── DashboardPage.jsx
│   ├── StrategyLabPage.jsx
│   ├── DividendHubPage.jsx
│   └── TransactionsPage.jsx
├── components/
│   ├── PortfolioCard.jsx
│   ├── NavChart.jsx
│   ├── AllocationPie.jsx
│   └── ...
└── hooks/
    ├── usePortfolio.js
    └── usePricePolling.js
```

**[改进-05] 添加 API 鉴权（本地简单密钥）**

```python
# api_server.py 添加 API Key 中间件
API_KEY = os.getenv("API_KEY", "")

@app.middleware("http")
async def verify_api_key(request: Request, call_next):
    if API_KEY and request.headers.get("X-API-Key") != API_KEY:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)
```

**[改进-06] 锁定依赖版本（`pip freeze` 生成 `requirements.lock`）**

```bash
pip freeze > requirements.lock
# 开发时用 requirements.txt（宽松），部署用 requirements.lock（精确）
```

**[改进-07] 增加 React Query / SWR 状态管理**

当前前端用手写 `useEffect + useState` 管理数据获取，建议引入 `@tanstack/react-query`：
- 自动缓存/失效
- 后台重新获取
- 错误重试
- 减少 30%+ 状态管理代码

---

### 🟡 P2 — 中期优化（工程质量）

**[改进-08] 将测试统一整合到 `backend/tests/`**

```bash
# 当前：test_wac.py, test_prices.py, test_eod.py 散落根目录
# 目标结构：
backend/tests/
├── test_wac.py
├── test_prices.py
├── test_historical.py
└── test_integration.py
```

**[改进-09] 添加 `.env.example` 模板文件**

```ini
# .env.example（不含真实密钥，供新环境快速配置）
FMP_API_KEY=your_fmp_key_here
EODHD_API_KEY=your_eodhd_key_here
FUTU_HOST=127.0.0.1
FUTU_PORT=11111
IB_HOST=127.0.0.1
IB_PORT=7497
IB_CLIENT_ID=101
API_KEY=your_local_api_key
```

**[改进-10] 引入数据验证层（Pydantic v2 model validators）**

当前 `broker_file_parser.py` 解析结果直接传入 SQL INSERT，建议：
```python
class ParsedPosition(BaseModel):
    symbol: str
    shares: float = Field(gt=0)
    avg_cost: float = Field(ge=0)
    currency: str = "USD"
    
    @validator('symbol')
    def symbol_not_empty(cls, v):
        assert v.strip(), "Symbol cannot be empty"
        return v.upper()
```

---

## 九、架构演进建议（长期）

| 阶段 | 建议 | 收益 |
|------|------|------|
| 当前 | SQLite + 本地运行 | ✅ 适合单用户私有部署 |
| 阶段2 | 抽取价格数据层为独立 Cache Service（Redis TTL） | 解决 lru_cache 问题，支持多进程 |
| 阶段3 | 将历史 NAV 计算迁移到 `portfolio_history` 表 | 避免每次打开历史图都重新拉API |
| 阶段4 | 前端引入路由（React Router）+ 懒加载 | 首屏加载提速，支持更多功能页 |

---

## 十、数据流全景图

```
用户操作（浏览器）
    │
    ▼
React Frontend（Vite Dev Server :5173）
    │ HTTP/REST
    ▼
FastAPI Backend（Uvicorn :8000）
    │
    ├──→ PortfolioEngine → SQLite transactions → 重放持仓 → 计算NAV
    │
    ├──→ DataProvider.get_market_data()
    │        ├── price_cache (SQLite, 今日有效)
    │        ├── BrokerPriceProvider (Futu批量HK / IB)
    │        ├── FMP API (若Key存在)
    │        ├── EODHD API (若Key存在)
    │        └── yfinance (免费回退)
    │
    ├──→ StrategyLab → 并发拉历史 → 马科维茨优化 → 蒙特卡洛GBM
    │
    └──→ APScheduler (00:05)
             └── price_updater → 更新prices表 → 更新portfolio_history
```

---

*档案由 Antigravity 自动生成，基于完整代码扫描。如有歧义以实际代码为准。*
