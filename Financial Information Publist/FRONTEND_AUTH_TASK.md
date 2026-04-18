# FIP 前端用户认证与权限系统 — Agent 任务书
> 优先级：P0 | 依赖后端：已完成（60个路由，含完整 RBAC API）
> 前置阅读：`MULTI_USER_RBAC_SPEC.md`（权限设计规格）
> 日志要求：每完成一个步骤后立即更新 `.antigravity_log.md`

---

## 背景

后端已实现完整的 RBAC 多用户系统，包括：
- `POST /auth/login` — 返回 JWT token + role + display_name
- `POST /auth/register` — 注册新用户（默认 free 角色）
- `GET /auth/me` — 获取当前用户信息
- `GET /admin/users` — 管理员获取所有用户（需 admin token）
- `PUT /admin/users/{id}/role` — 修改用户角色
- `PUT /admin/users/{id}/status` — 封禁/激活账号
- `POST /admin/advisor-clients` — 建立顾问-客户关系
- `GET /advisor/clients` — 顾问查看自己的客户列表

**测试账号（已存在数据库）**：
- 邮箱：`admin@wonderhub.hk`
- 密码：`WonderHub2024!`
- 角色：`admin`

---

## 任务列表（按顺序执行）

---

### 任务 1：全局认证状态管理

**目标**：创建 `src/utils/auth.js`，统一管理 Token 的存取与用户信息。

**文件路径**：`frontend/src/utils/auth.js`

**内容**：
```js
const TOKEN_KEY = 'ph_token';
const USER_KEY  = 'ph_user';

export const authStorage = {
  setToken: (token) => localStorage.setItem(TOKEN_KEY, token),
  getToken: () => localStorage.getItem(TOKEN_KEY),
  removeToken: () => localStorage.removeItem(TOKEN_KEY),
  setUser: (user) => localStorage.setItem(USER_KEY, JSON.stringify(user)),
  getUser: () => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
    catch { return null; }
  },
  removeUser: () => localStorage.removeItem(USER_KEY),
  clear: () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); },
};

// 给 fetch 用的 Authorization Header
export const authHeaders = () => {
  const token = authStorage.getToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

// 角色层级判断
const ROLE_RANK = { free: 0, premium: 1, advisor: 2, admin: 3 };
export const hasRole = (userRole, minRole) =>
  (ROLE_RANK[userRole] ?? -1) >= (ROLE_RANK[minRole] ?? 99);
```

---

### 任务 2：登录/注册 Modal 组件

**文件路径**：`frontend/src/components/AuthModal.jsx`

**功能要求**：
- 支持「登录」和「注册」两种模式，点击下方链接可切换
- 登录成功后：将 token 和 user 信息存入 localStorage，调用父组件的 `onSuccess(user)` 回调
- 注册成功后：同上，自动登录
- 表单校验：
  - 邮箱不能为空
  - 密码少于 6 位时提示
- 错误信息显示在表单下方（红色提示文字）
- 加载中时按钮显示 spinner 并禁用
- ESC 键或点击背景可关闭

**API 调用**：
```
POST http://localhost:8000/auth/login    body: { email, password }
POST http://localhost:8000/auth/register body: { email, password, display_name }
```

**UI 要求**：
- 深色玻璃态风格（与现有系统保持一致）
- 居中弹窗，宽度约 400px
- 标题：「欢迎登录 / 创建账号」
- 输入框：邮箱、密码（可显示/隐藏切换）
- 注册模式额外显示「显示名称」输入框

---

### 任务 3：在 App.jsx 顶部导航栏增加用户状态区域

**定位**：找到 `App.jsx` 中现有的顶部 Header/导航栏 JSX，在右侧加入用户状态控件。

**状态管理（在 App.jsx 中新增）**：
```jsx
const [currentUser, setCurrentUser] = useState(() => authStorage.getUser());
const [authModalOpen, setAuthModalOpen] = useState(false);

const handleAuthSuccess = (user) => {
  setCurrentUser(user);
  setAuthModalOpen(false);
};

const handleLogout = () => {
  authStorage.clear();
  setCurrentUser(null);
};
```

**导航栏右侧 JSX（已登录状态）**：
```jsx
{currentUser ? (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    {/* 角色徽章 */}
    <span style={{
      padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
      background: currentUser.role === 'admin' ? '#ef4444' :
                  currentUser.role === 'advisor' ? '#3b82f6' :
                  currentUser.role === 'premium' ? '#f59e0b' : '#6b7280',
      color: '#fff'
    }}>
      { { admin:'管理员', advisor:'财务顾问', premium:'付费会员', free:'普通用户' }[currentUser.role] }
    </span>
    {/* 用户名 */}
    <span style={{ color: '#e2e8f0', fontSize: 14 }}>{currentUser.display_name}</span>
    {/* 登出按钮 */}
    <button onClick={handleLogout} style={{
      padding: '4px 12px', borderRadius: 6, background: 'transparent',
      border: '1px solid #475569', color: '#94a3b8', cursor: 'pointer', fontSize: 12
    }}>登出</button>
  </div>
) : (
  <button onClick={() => setAuthModalOpen(true)} style={{
    padding: '6px 16px', borderRadius: 8, background: '#3b82f6',
    border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600
  }}>登录 / 注册</button>
)}

{/* Modal 挂载 */}
{authModalOpen && (
  <AuthModal
    onSuccess={handleAuthSuccess}
    onClose={() => setAuthModalOpen(false)}
  />
)}
```

**import 要求**（在 App.jsx 顶部添加）：
```js
import { authStorage, authHeaders } from './utils/auth';
import AuthModal from './components/AuthModal';
```

---

### 任务 4：管理员用户管理页面

**触发条件**：仅当 `currentUser.role === 'admin'` 时，在侧边栏显示「👥 用户管理」入口。

**文件路径**：`frontend/src/components/AdminPanel.jsx`

**功能要求**：
1. 加载时调用 `GET /admin/users`（带 Authorization Header）
2. 在表格中展示所有用户：
   - 列：ID | 显示名称 | 邮箱 | 角色（带颜色徽章）| 顾问（若有）| 状态 | 操作
3. 操作列支持：
   - **改变角色**：下拉选择 `admin / advisor / premium / free` → 调用 `PUT /admin/users/{id}/role`
   - **封禁/激活**：切换开关 → 调用 `PUT /admin/users/{id}/status`
4. 页面顶部显示系统统计（调用 `GET /admin/stats`）：
   - 卡片展示：总用户数、各角色人数、组合总数

**API 调用格式**（所有管理员接口都需带 token）：
```js
const res = await fetch('/admin/users', {
  headers: { ...authHeaders(), 'Content-Type': 'application/json' }
});
```

---

### 任务 5：顾问「我的客户」面板

**触发条件**：仅当 `currentUser.role === 'advisor' || currentUser.role === 'admin'` 时显示。

**文件路径**：`frontend/src/components/AdvisorClientsPanel.jsx`

**功能要求**（简化版，本期只做只读展示）：
1. 调用 `GET /advisor/clients` → 展示客户卡片列表
2. 每张卡片显示：
   - 客户姓名 + 邮箱
   - 组合数量 + 保险方案数量
   - 最后活跃时间
3. 点击卡片可调用 `GET /advisor/clients/{id}/portfolios` 查看该客户的组合列表（在同一面板内展开）

---

### 任务 6：普通用户功能锁定组件

**文件路径**：`frontend/src/components/FeatureLock.jsx`

**用途**：包裹任何「高级功能」区域，非付费用户看到遮罩层而非真实内容。

**Props**：
```
minRole: 'premium' | 'advisor' | 'admin'  // 最低角色要求
currentUser: object | null
children: ReactNode                        // 真实内容
featureName: string                        // 展示给用户的功能名称
```

**逻辑**：
```jsx
import { hasRole } from '../utils/auth';

export default function FeatureLock({ minRole = 'premium', currentUser, children, featureName = '此功能' }) {
  if (currentUser && hasRole(currentUser.role, minRole)) {
    return children;  // 有权限，正常显示
  }
  return (
    <div style={{ /* 遮罩卡片样式 */ }}>
      <div>🔒 {featureName} 需要{/* ... */}权限</div>
      {!currentUser && (
        <p>请先<button onClick={...}>登录</button>后查看</p>
      )}
      {currentUser?.role === 'free' && (
        <p>普通账号无法使用此功能，请联系顾问升级</p>
      )}
    </div>
  );
}
```

**使用示例**（在 App.jsx 中包裹策略实验室）：
```jsx
<FeatureLock minRole="premium" currentUser={currentUser} featureName="策略实验室">
  <StrategyLabView ... />
</FeatureLock>
```

---

## 执行顺序

```
1 → 创建 utils/auth.js
2 → 创建 components/AuthModal.jsx
3 → 修改 App.jsx（导入 + state + 导航栏）
4 → 创建 components/AdminPanel.jsx（管理员才能访问）
5 → 创建 components/AdvisorClientsPanel.jsx
6 → 创建 components/FeatureLock.jsx
7 → 在 App.jsx 中用 FeatureLock 包裹策略实验室入口
```

---

## 验收标准

- [ ] 点击「登录」弹出 Modal，输入 `admin@wonderhub.hk / WonderHub2024!` 登录成功
- [ ] 导航栏右侧出现「🔴 管理员 | Derek (Admin) | 登出」
- [ ] 刷新页面后仍然保持登录状态（localStorage 持久化）
- [ ] 点击「登出」后状态清除，导航栏恢复「登录/注册」按钮
- [ ] admin 角色可在侧边栏看到「👥 用户管理」入口，进入后展示用户列表
- [ ] free 角色访问策略实验室时看到锁定遮罩，不显示真实内容
- [ ] `npm run build` 零报错

---

## 完成后更新日志

```markdown
### [日期]: 前端认证与权限系统
[Status]: 已完成 ✅
[Change Log]: 修改了哪些文件（utils/auth.js, AuthModal.jsx, App.jsx, AdminPanel.jsx, AdvisorClientsPanel.jsx, FeatureLock.jsx）
[Logic Reason]: 为什么这样实现
[Pending/TODO]: 还需要做什么
```
