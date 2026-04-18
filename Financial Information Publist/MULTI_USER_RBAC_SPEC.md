# PortfolioHub 多用户权限系统设计规格
> 附属于：WONDER_HUB_INTEGRATION_BRIEF.md
> 日期：2026-04-17
> 优先级：P0（先于任务A/B执行，是整个多用户架构的基础）

---

## 一、四种用户角色定义

```
管理员（Admin）
├── 最高权限，系统级管理
├── 可管理所有用户账户和角色
└── 可查看全部数据和组合

财务顾问（Advisor）
├── 全功能使用权（蒙特卡洛、报告、展示模式）
├── 管理自己的客户列表
├── 为指定付费客户上传保险方案
└── 可查看自己名下客户的组合数据

付费用户（Premium）
├── 全功能使用权（蒙特卡洛、报告、全组合追踪）
├── 可查看/运行顾问为其上传的保险方案
├── 不能自行上传保险方案（必须由顾问操作）
└── 拥有一位指定顾问（可查看顾问名片）

普通用户（Free）
├── 仅限：创建和追踪投资组合（最多1个）
├── 可查看 Wonder Portfolio 公开示例
└── 锁定：蒙特卡洛、报告、保险功能
```

---

## 二、权限矩阵（完整版）

| 功能模块 | 管理员 | 财务顾问 | 付费用户 | 普通用户 |
|---------|:-----:|:-------:|:-------:|:-------:|
| **组合管理** |
| 创建投资组合 | ✅ 无限 | ✅ 无限 | ✅ 无限 | ✅ 最多1个 |
| 查看/追踪组合 | ✅ 全部 | ✅ 自己+客户 | ✅ 仅自己 | ✅ 仅自己 |
| 删除/修改组合 | ✅ 全部 | ✅ 自己+客户 | ✅ 仅自己 | ✅ 仅自己 |
| 查看 Wonder Portfolio | ✅ | ✅ | ✅ | ✅ |
| **策略分析** |
| 蒙特卡洛模拟 | ✅ | ✅ | ✅ | ❌ 锁定 |
| 有效前沿优化 | ✅ | ✅ | ✅ | ❌ 锁定 |
| 压力测试/回撤分析 | ✅ | ✅ | ✅ | ❌ 锁定 |
| 客户演示模式（Showcase）| ✅ | ✅ | ❌ | ❌ |
| **保险方案** |
| 上传/编辑保险方案 | ✅ | ✅（为客户） | ❌ | ❌ |
| 查看保险方案 | ✅ 全部 | ✅ 自己客户的 | ✅ 顾问为我上传的 | ❌ |
| 运行保险叠加分析 | ✅ | ✅ | ✅（基于顾问方案）| ❌ |
| **报告导出** |
| 财富规划 PDF 报告 | ✅ | ✅ | ✅ | ❌ 锁定 |
| Word 报告 | ✅ | ✅ | ✅ | ❌ 锁定 |
| **用户管理** |
| 查看所有用户 | ✅ | ❌ | ❌ | ❌ |
| 修改用户角色 | ✅ | ❌ | ❌ | ❌ |
| 指定顾问-客户关系 | ✅ | ✅（仅自己） | ❌ | ❌ |
| 注销/封禁用户 | ✅ | ❌ | ❌ | ❌ |
| **系统设置** |
| 查看系统日志 | ✅ | ❌ | ❌ | ❌ |
| 修改 Wonder Portfolio | ✅ | ✅ | ❌ | ❌ |
| 系统配置 | ✅ | ❌ | ❌ | ❌ |

---

## 三、数据库 Schema 设计

### 3.1 users 表（修订版）

```sql
CREATE TABLE users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    display_name    TEXT,
    avatar_initial  TEXT,           -- 自动从姓名取首字
    role            TEXT NOT NULL DEFAULT 'free',
                    -- 枚举：'admin' | 'advisor' | 'premium' | 'free'
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at   TIMESTAMP,
    notes           TEXT            -- 管理员备注（仅Admin可见）
);
```

### 3.2 advisor_clients 表（顾问-客户关系）

```sql
CREATE TABLE advisor_clients (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    advisor_id      INTEGER NOT NULL REFERENCES users(id),
    client_id       INTEGER NOT NULL REFERENCES users(id),
    assigned_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by     INTEGER REFERENCES users(id),   -- 谁建立的关系
    is_active       BOOLEAN DEFAULT TRUE,
    UNIQUE(advisor_id, client_id)
);
```

> 规则：一个客户只能有一位主顾问。一位顾问可以有多名客户。

### 3.3 insurance_plans 表（修订版，新增归属字段）

```sql
CREATE TABLE insurance_plans (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,              -- 方案名称（顾问命名）
    advisor_id      INTEGER NOT NULL REFERENCES users(id),  -- 上传顾问
    client_id       INTEGER REFERENCES users(id),           -- 归属客户（NULL=顾问自用）
    plan_data       TEXT NOT NULL,              -- JSON，储蓄险参数
    excel_filename  TEXT,                       -- 原始上传文件名
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP,
    is_template     BOOLEAN DEFAULT FALSE       -- TRUE = 顾问模板，可复用
);
```

### 3.4 portfolios 表（新增 user_id 字段）

```sql
-- 在现有 portfolios 表中 ALTER TABLE 添加：
ALTER TABLE portfolios ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE portfolios ADD COLUMN is_public BOOLEAN DEFAULT FALSE;
-- is_public = TRUE 用于 Wonder Portfolio 公开展示
```

---

## 四、API 端点设计

### 4.1 认证端点

```
POST   /auth/register           # 新用户注册（默认 role=free）
POST   /auth/login              # 登录，返回 JWT token
POST   /auth/logout             # 登出（客户端删除 token 即可）
GET    /auth/me                 # 获取当前用户信息
PUT    /auth/me/profile         # 更新个人信息（姓名等）
POST   /auth/me/change-password # 修改密码
```

### 4.2 管理员端点（需要 role=admin）

```
GET    /admin/users             # 获取所有用户列表（支持分页、角色过滤）
GET    /admin/users/{id}        # 获取指定用户详情
PUT    /admin/users/{id}/role   # 修改用户角色 { "role": "premium" }
PUT    /admin/users/{id}/status # 激活/封禁用户 { "is_active": false }
DELETE /admin/users/{id}        # 删除用户

GET    /admin/advisor-clients           # 获取所有顾问-客户关系
POST   /admin/advisor-clients           # 建立顾问-客户关系
DELETE /admin/advisor-clients/{id}      # 解除关系

GET    /admin/stats             # 系统统计（用户数、组合数等）
```

### 4.3 顾问端点（需要 role=advisor 或 admin）

```
GET    /advisor/clients         # 获取我的客户列表
GET    /advisor/clients/{id}/portfolios     # 获取某客户的组合
GET    /advisor/clients/{id}/insurance      # 获取某客户的保险方案

POST   /advisor/insurance                   # 为客户上传保险方案
       Body: { client_id, name, excel_file / plan_data }
PUT    /advisor/insurance/{id}              # 修改保险方案
DELETE /advisor/insurance/{id}             # 删除保险方案

GET    /advisor/insurance/templates         # 获取我的保险方案模板
POST   /advisor/insurance/{id}/assign       # 将模板指定给某客户
```

### 4.4 用户端点（所有已登录用户）

```
# 组合管理（已有端点，加上 user_id 过滤）
GET    /portfolios              # 获取我的组合（+ 顾问可见客户组合）
POST   /portfolios              # 创建组合（free用户检查上限）
...

# 保险方案（付费用户查看顾问上传的方案）
GET    /my/insurance-plans      # 获取为我上传的保险方案
GET    /my/advisor              # 获取我的顾问信息

# 公开数据（无需登录）
GET    /public/portfolios       # 获取公开组合（Wonder Portfolio）
```

---

## 五、JWT Token 设计

Token Payload 包含：

```json
{
  "sub": "user_id",
  "email": "derek@example.com",
  "role": "advisor",
  "display_name": "Derek",
  "exp": 1234567890
}
```

有效期：7天（前端自动在过期前刷新）

---

## 六、前端 UI 设计

### 6.1 顶部导航栏（角色感知）

```
[Logo] [导航菜单...]              [角色Badge] [用户名▼]
                                 ┌─────────────────────┐
                                 │ 👤 Derek Wong       │
                                 │ 🏷️ 财务顾问          │
                                 │ ─────────────────── │
                                 │ 📋 我的客户          │
                                 │ ⚙️ 个人设置          │
                                 │ 🚪 登出              │
                                 └─────────────────────┘
```

角色 Badge 颜色：
- Admin：🔴 红色
- Advisor：🔵 蓝色
- Premium：🟡 金色
- Free：⚫ 灰色

### 6.2 侧边栏导航（按角色动态显示）

```
管理员视图:                 顾问视图:                付费用户视图:         普通用户视图:
─────────────              ─────────────            ─────────────         ─────────────
📊 Dashboard               📊 Dashboard             📊 Dashboard          📊 Dashboard
📁 我的组合                 📁 我的组合               📁 我的组合            📁 我的组合
🌟 Wonder Portfolio        🌟 Wonder Portfolio       🌟 Wonder Portfolio    🌟 Wonder Portfolio
🔬 策略实验室               🔬 策略实验室             🔬 策略实验室           🔒 策略实验室
📋 保险方案                 📋 保险方案               📋 我的保险方案         ─────────────
🎯 演示模式                 🎯 演示模式               ─────────────         （以下为 Upgrade CTA）
👥 客户管理                 👥 我的客户               ─────────────
⚙️ 用户管理(Admin)          ─────────────
```

### 6.3 管理员 - 用户管理界面

```
┌─────────────────────────────────────────────────────────────┐
│ 用户管理                             [+ 手动新增用户]         │
│                                                             │
│ 筛选：[全部 ▼] [角色 ▼] [状态 ▼]        搜索：[________]    │
│                                                             │
│ ┌────┬──────────────┬────────┬────────┬──────┬──────────┐  │
│ │ ID │ 姓名/邮件     │ 角色   │ 顾问   │ 状态 │ 操作     │  │
│ ├────┼──────────────┼────────┼────────┼──────┼──────────┤  │
│ │ 1  │ Derek Wong   │ 🔴Admin│  -     │ ✅   │ [编辑]   │  │
│ │ 2  │ 张三（顾问）  │ 🔵顾问 │  -     │ ✅   │ [编辑]   │  │
│ │ 3  │ 李四（付费）  │ 🟡付费 │ 张三   │ ✅   │ [编辑]   │  │
│ │ 4  │ 王五（免费）  │ ⚫免费 │  -     │ ✅   │ [编辑]   │  │
│ └────┴──────────────┴────────┴────────┴──────┴──────────┘  │
└─────────────────────────────────────────────────────────────┘
```

编辑弹窗字段：
- 角色选择（下拉）
- 关联顾问（若角色为 Premium，显示顾问选择器）
- 账户状态开关
- 备注栏

### 6.4 顾问 - 客户管理界面

```
┌─────────────────────────────────────────────────────────────┐
│ 我的客户（共 N 人）                                           │
│                                                             │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ 👤 李四                           最后活跃：3天前     │   │
│ │ 📧 lisi@example.com               📁 2个组合         │   │
│ │                                                      │   │
│ │ 保险方案：                                            │   │
│ │ • AIA 20年储蓄计划（已上传 2026-04-01）               │   │
│ │ [➕ 上传新方案]  [👁️ 查看组合]  [📊 运行分析]         │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ 👤 王六（无保险方案）                                   │   │
│ │ [➕ 上传保险方案]  [👁️ 查看组合]                       │   │
│ └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 6.5 付费用户 - 「我的顾问」卡片

在用户 Dashboard 顶部显示顾问信息卡（如已绑定顾问）：

```
┌──────────────────────────────────────────┐
│ 👤 我的专属顾问                           │
│ ─────────────────────────────────────── │
│ [头像] 张三顾问                           │
│        持牌保险中介人 · 强积金顾问        │
│                                          │
│ 📋 已为您准备 1 份保险规划方案           │
│                                          │
│ [💬 联系顾问]  [📋 查看我的方案]         │
└──────────────────────────────────────────┘
```

### 6.6 功能锁定 UI（普通用户）

遇到锁定功能时，在功能入口处显示：

```
┌─────────────────────────────────────────┐
│           🔒 此功能需要升级              │
│                                         │
│  策略实验室（蒙特卡洛模拟）仅对          │
│  付费会员开放                           │
│                                         │
│  升级后可使用：                          │
│  ✅ 蒙特卡洛终值模拟                    │
│  ✅ 保险底座叠加分析                    │
│  ✅ 财富规划PDF报告                     │
│  ✅ 无限组合创建                        │
│                                         │
│  [💬 联系顾问了解更多]                  │
└─────────────────────────────────────────┘
```

---

## 七、业务逻辑规则

### 7.1 顾问上传保险方案的流程

```
顾问 → 进入「我的客户」→ 选择客户 → 点击「上传保险方案」
    → 上传 Excel 文件（复用现有 insurance_parser.py）
    → 输入方案名称（如："AIA 20年储蓄计划 - 5万年供"）
    → 保存 → 客户账号内自动出现该方案
```

付费用户看到方案后，可以：
- 查看方案基本信息（年供、年期、预期回报）
- 将方案导入策略实验室的保险叠加模块运行分析
- 生成含保险方案的财富报告

**付费用户不能**：编辑或上传保险方案（只读）

### 7.2 Wonder Portfolio 的维护

- 由 Admin 或 Advisor 身份在后台创建一个 `is_public=TRUE` 的特殊组合
- Derek 每月更新持仓时，直接在系统内操作该组合
- 所有用户（包括未登录访客）可查看但不能修改

### 7.3 免费用户组合上限检查

```python
# 在 POST /portfolios 端点中
if current_user.role == 'free':
    user_portfolio_count = db.count_portfolios_by_user(current_user.id)
    if user_portfolio_count >= 1:
        raise HTTPException(403, "免费用户最多创建1个组合，升级后可无限创建")
```

---

## 八、实施顺序

```
Step 1: 数据库 Schema 建立
├── users 表（含role字段）
├── advisor_clients 表
├── insurance_plans 表（含顾问/客户归属）
└── portfolios 表（新增user_id, is_public）

Step 2: 认证系统（API）
├── /auth/* 端点
├── JWT 生成与验证 middleware
└── 角色权限 decorator（用于保护端点）

Step 3: 管理员 API + UI
├── /admin/* 端点
└── 用户管理界面

Step 4: 顾问 API + UI
├── /advisor/* 端点
└── 客户管理界面 + 保险方案上传

Step 5: 现有端点的用户隔离改造
├── portfolios 全部加上 user_id 过滤
└── 保险方案的权限检查

Step 6: 前端登录/注册 Modal
Step 7: 侧边栏/导航角色感知
Step 8: 功能锁定 UI（普通用户）
Step 9: 付费用户「我的顾问」面板
Step 10: 测试全链路（四种角色各自验证）
```

---

## 九、安全注意事项

1. **密码存储**：使用 `passlib[bcrypt]`，绝不明文存储
2. **角色提权保护**：只有 Admin 能修改 role 字段，API 层强制验证
3. **跨用户数据隔离**：所有数据库查询必须带 `user_id` 过滤，防止越权访问
4. **顾问只能看自己的客户**：advisor 查询客户组合时，先验证 advisor_clients 关系
5. **Token 过期**：JWT 7天有效期，敏感操作（修改角色）需重新验证密码

---

## 十、完成后更新 .antigravity_log.md

格式：
```markdown
### [日期]: 多用户权限系统 - [完成的具体步骤]
[Status]: 已完成 ✅ / 进行中 🔄
[Change Log]: 修改了哪些文件、具体变化
[Logic Reason]: 为什么这样设计
[Pending/TODO]: 还需做什么
```
