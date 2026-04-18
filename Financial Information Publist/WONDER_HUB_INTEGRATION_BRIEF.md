# PortfolioHub × Wonder Hub 整合工作指引
> 发出方：Wonder Hub 项目策略对话（Conversation ID: 338c8dcd-57f0-47a2-ac16-4c00592ef512）
> 收件方：Financial Information Publist 项目 Agent
> 日期：2026-04-17
> 优先级：P1

---

## 背景与目标

Derek 正在建设 **Wonder Hub**（面向香港新港人的财务知识平台），希望将
PortfolioHub 的核心能力整合进去，作为 Wonder Hub 投资理念专栏的核心功能模块。

整合目标是实现两个使用模式：

---

## 任务 A：展示模式（Showcase Mode）

### 用途
Derek 在与客户视频通话或面谈时，直接打开浏览器展示，演示不同资产配置
方案+储蓄分红险搭配的未来财富增长效果。

### 现有能力盘点
PortfolioHub 已具备：
- ✅ 蒙特卡洛模拟（P10/P50/P90）
- ✅ 保险现金价值叠加（insurance overlay）
- ✅ 财富报告 WealthReport.jsx（9章叙事式PDF报告）
- ✅ 三种情景可视化（Stacked Area Chart）

### 需要新增/修改的内容

#### A1. 新增"快速演示模式"入口
在 Strategy Lab 页面顶部（或侧边栏）新增一个醒目的 **「🎯 客户演示模式」** 按钮。

点击后进入简化界面，只保留以下核心参数：
```
月投金额（或年度投入）          ← 滑动条，HKD，范围：2,000 - 50,000/月
规划年期                      ← 下拉：10 / 15 / 20 / 25 / 30 年
储蓄险比例                    ← 滑动条，0% - 60%（其余为投资组合）
投资风格                      ← 三个按钮：保守（5%）/ 平衡（7%）/ 进取（9%）
```

隐藏/简化（不显示）以下参数：
- 具体资产 ISIN 输入框
- 技术参数（Simulation Paths、Withdrawal Start Year 等）
- Efficient Frontier 图表

#### A2. 预设三套示例组合（代替 ISIN 手动输入）

以下预设在后端 `strategy_lab.py` 或前端 hardcode 均可：

| 组合名称 | 资产构成（简化） | 预设年化回报 |
|---------|--------------|------------|
| 🛡️ 稳健守护型 | 债券ETF 50% + 全球ETF 30% + 现金 20% | 保守：~5% |
| ⚖️ 平衡成长型 | 全球ETF 40% + 港股高息 30% + 债券 20% + REITs 10% | 平衡：~7% |
| 🚀 进取增长型 | 美股ETF 50% + 科技ETF 30% + 新兴市场 20% | 进取：~9% |

实际使用时用「投资风格」按钮自动切换预设，不需要用户手动输入 ISIN。

#### A3. 输出结果简化展示

演示模式的结果页只展示：
1. **综合财富增长曲线**（保险底座 + 投资波段 Stacked Area，P10/P50/P90）
2. **关键里程碑卡片**（第10年、第20年、规划终点的P50预期值）
3. **保险杠杆效果摘要**（总供款 → 终值贡献的倍数）
4. 一个大的 CTA 按钮：**「生成完整财富规划报告」**（触发现有 WealthReport.jsx 流程）

演示模式下隐藏：
- Efficient Frontier 图
- Dividend Lifecycle 图
- 进攻极/防守极技术分析卡片

#### A4. 合规免责声明横幅

在演示模式页面顶部加入不可消除的横幅：

```
⚠️ 以下内容仅为财务规划概念演示，所有数字均为假设性计算，
不构成任何投资建议或保险产品推介。储蓄险相关数字为通用模型，
非任何特定产品的官方数据。过往表现不代表未来回报。
```

中文字体，灰色背景，小号字体（不干扰主视觉即可）。

---

## 任务 B：自助追踪模式（Self-service Mode）

### 用途
Wonder Hub 网站用户（新港人）注册账号后，在网站内使用基础的投资组合追踪功能，
对比 Derek 的 Wonder Portfolio 示例组合表现。

### 现有能力盘点
PortfolioHub 已具备：
- ✅ 多组合管理（portfolio.db，多用户 SQLite）
- ✅ 实时持仓追踪
- ✅ 历史 NAV 图表

### 当前问题
PortfolioHub 目前是**无鉴权的本地单用户系统**。
需要增加用户注册/登录以支持多用户使用。

### 需要新增的内容

#### B1. 用户认证系统

在 `backend/api_server.py` 中新增以下端点：

```python
POST /auth/register    # 邮件 + 密码注册
POST /auth/login       # 登录，返回 JWT token
GET  /auth/me          # 获取当前用户信息
```

数据库层：
- 在 `portfolio.db` 中新增 `users` 表
  ```sql
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tier TEXT DEFAULT 'free'  -- 'free' | 'premium'
  );
  ```
- 为 `portfolios` 表新增 `user_id` 外键关联

推荐使用 `python-jose` 生成 JWT，`passlib[bcrypt]` 做密码哈希。

#### B2. 用户隔离

所有已有的组合相关 API 端点增加 `user_id` 过滤：
- `GET /portfolios` → 只返回当前登录用户的组合
- `POST /portfolios` → 创建时写入 `user_id`
- 其他持仓/调仓端点同理

#### B3. Wonder Portfolio 预置公开组合

Derek 的示例组合（Wonder Portfolio）应作为**公开组合**存在，所有用户都能看到：
- 在 `portfolios` 表中增加 `is_public BOOLEAN DEFAULT FALSE` 字段
- `GET /portfolios/public` 端点返回所有公开组合（无需登录）
- Wonder Portfolio 由 Derek 手动维护（每月更新）

#### B4. 免费用户功能限制

| 功能 | 免费用户 | 进阶用户（加入私域后解锁）|
|-----|---------|------------------------|
| 创建自己的组合 | ✅ 最多 1 个 | ✅ 无限 |
| 查看 Wonder Portfolio | ✅ | ✅ |
| 历史 NAV 图表 | ✅ 只看最近6个月 | ✅ 全部历史 |
| 蒙特卡洛演示 | ❌ | ✅ |
| 财富报告 PDF | ❌ | ✅ |
| 保险叠加分析 | ❌ | ✅ |

免费用户看到锁定功能时，显示：
```
🔒 此功能需要加入 Wonder Hub 顾问圈解锁
[联系顾问解锁] ← 按钮，链接到 WhatsApp 或预约表单
```

#### B5. 前端登录/注册 Modal

在 `frontend/src/App.jsx` 中新增：
- 右上角用户状态按钮（未登录："登录 / 注册"；已登录：显示用户名 + 头像首字母）
- 登录/注册 Modal（邮件 + 密码，支持切换）
- 登录后本地存储 JWT token，所有 API 请求 Header 带上 `Authorization: Bearer {token}`

---

## 技术注意事项

### 现有架构不要破坏
- `strategy_lab.py` 的蒙特卡洛引擎、保险叠加逻辑：**不要修改任何计算逻辑**
- `WealthReport.jsx` 的报告模板：**不要修改报告内容和格式**
- 现有的本地单用户调试功能保持可用（可用 `?dev=true` 参数绕过登录）

### 新港人 UX 优化
- 所有新增 UI 文本默认使用**简体中文**
- 货币显示默认 HKD（港币）
- 时间轴/年份以「第N年」表示，而非公历年份

### 合规标准
- 演示模式中任何地方**不得出现 AIA、友邦保险、任何保险公司名称**
- 储蓄险相关演示数字旁必须有「仅供参考，非产品保证」标注
- 财富报告第九章的合规声明保持现有措辞，不要删减

---

## 验收标准

### 任务 A 完成标准
- [ ] Strategy Lab 页面有「客户演示模式」入口
- [ ] 演示模式仅展示：月投金额、年期、险占比、风格三选一
- [ ] 三套预设组合自动切换，无需手动输入 ISIN
- [ ] 结果展示：综合增长曲线 + 里程碑卡片 + 生成报告按钮
- [ ] 免责声明横幅在演示模式全程可见
- [ ] 现有 Strategy Lab 完整功能不受影响

### 任务 B 完成标准
- [ ] 用户可以通过邮件/密码注册和登录
- [ ] 登录后只能看到自己的组合（+ 公开的 Wonder Portfolio）
- [ ] 免费用户创建组合最多1个
- [ ] 进阶功能显示锁定状态和解锁 CTA
- [ ] Wonder Portfolio 公开可见，无需登录

---

## 开发优先级

**先做 A（展示模式），再做 B（自助模式）。**

原因：A 是 Derek 面谈时的即时需求，B 需要更多基础设施（用户系统）。

A 中优先级：A1 → A3 → A4 → A2（预设组合可以先用简化数字 hardcode）

---

## 完成后请更新 `.antigravity_log.md`

格式：
```
### [日期]: Wonder Hub 整合 - [具体完成的子任务]
[Status]: 已完成 ✅ / 进行中 🔄
[Change Log]: 修改了哪些文件、行号、具体变化
[Logic Reason]: 为什么这样改
[Pending/TODO]: 还剩什么
```

---
*本文件由 Wonder Hub 策略对话自动生成，如有疑问请参考 Conversation ID: 338c8dcd-57f0-47a2-ac16-4c00592ef512*
