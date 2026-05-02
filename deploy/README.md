# Wonder Platform — 生产运维手册

> 阿里云香港轻量应用服务器 · 裸机 PM2 部署

---

## 📌 基本信息

| 项目 | 值 |
|------|-----|
| 服务器 | 阿里云香港 轻量应用服务器 |
| 系统 | Ubuntu 22.04 LTS |
| 项目目录 | `/www/wonder_platform` |
| 公网 IP | 47.239.63.70 |
| 域名 | wonderwisdom.online |

## 🌐 访问地址

| 服务 | 域名访问（推荐）| IP 直连（过渡期）|
|------|------|-----------|
| Wonder Hub (C端主入口) | `http://wonderwisdom.online` | `http://47.239.63.70/` |
| Company Admin (B端 SaaS) | `http://company.wonderwisdom.online` | `http://47.239.63.70:5174/` |
| FIS Hub (金融沙盘) | `http://fis.wonderwisdom.online` | `http://47.239.63.70:5175/` |
| 后端健康检查 | `http://wonderwisdom.online/api/health` | `http://47.239.63.70/api/health` |

## 🔥 轻量服务器防火墙端口（必须在控制台手动开放）

| 端口 | 协议 | 用途 |
|------|------|------|
| 22 | TCP | SSH 登录 |
| 80 | TCP | Nginx 主入口（所有域名） |
| 443 | TCP | HTTPS（申请证书后需要） |
| 5174 | TCP | Company Admin B端（IP 直连过渡期） |
| 5175 | TCP | FIS Hub 金融沙盘（IP 直连过渡期） |

> 在阿里云控制台 → 轻量应用服务器 → 防火墙 → 添加规则

## 🌏 DNS 配置步骤（域名生效前必读）

**第一步：在域名注册商修改 Nameserver**

登录购买 `wonderwisdom.online` 的注册商，将 DNS 服务器改为：
```
ns1.alidns.com
ns2.alidns.com
```

**第二步：在阿里云云解析控制台添加记录**

| 主机记录 | 记录类型 | 记录值 |
|---------|---------|-------|
| `@` | A | 47.239.63.70 |
| `www` | A | 47.239.63.70 |
| `company` | A | 47.239.63.70 |
| `fis` | A | 47.239.63.70 |

> DNS 传播需要 10分钟 ~ 24小时，可用 `nslookup wonderwisdom.online` 验证是否生效

## 🔐 HTTPS 证书申请（DNS 生效后执行）

```bash
# SSH 登录服务器后执行
certbot --nginx \
  -d wonderwisdom.online -d www.wonderwisdom.online \
  -d company.wonderwisdom.online \
  -d fis.wonderwisdom.online

# certbot 会自动修改 nginx.conf 并填入证书路径，完成后重载：
nginx -t && systemctl reload nginx
```

---

## 🚀 首次部署流程（全新服务器）

```bash
# 1. SSH 登录服务器
ssh root@47.239.63.70

# 2. 克隆代码
mkdir -p /www/wonder_platform
cd /www/wonder_platform
git clone https://github.com/xumingzhen-ctrl/wonder_platform.git .

# 3. 运行初始化脚本（仅首次）
chmod +x deploy/setup_server.sh
sudo ./deploy/setup_server.sh

# 4. 配置生产环境变量
cp deploy/.env.production backend/.env
# ⚠️ 编辑文件，将 YOUR_SERVER_IP 替换为真实公网 IP
# 生产 API 地址和 CORS 跨域域名列表（逗号分隔）
CORS_ORIGINS=http://[IP_ADDRESS],http://[IP_ADDRESS],http://[IP_ADDRESS],http://[IP_ADDRESS]
nano backend/.env

# 5. 安装 Python 依赖   
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate
cd ..

# 6. 安装前端依赖并构建
pnpm install
NODE_OPTIONS="--max-old-space-size=1024" pnpm build

# 7. 启动所有服务
chmod +x deploy/deploy.sh
pm2 start deploy/ecosystem.config.js
pm2 save   # 保存进程列表，确保开机自启
pm2 status # 确认 4 个进程全部 online
```

---

## 🔄 日常代码更新

```bash
# 在服务器上执行（推送新代码后）
cd /www/wonder_platform
./deploy/deploy.sh
```

---

## 🛠️ 常用运维命令

```bash
# 查看所有进程状态
pm2 status

# 查看实时日志（所有服务）
pm2 logs

# 查看单个服务日志
pm2 logs wonder-backend
pm2 logs wonder-hub
pm2 logs company-admin
pm2 logs fis-hub

# 重启单个服务（不停机）
pm2 reload wonder-backend
pm2 reload wonder-hub

# 停止 / 启动 所有服务
pm2 stop all
pm2 start all

# 查看进程详情（内存/CPU 使用）
pm2 monit
```

---

## 💾 数据库备份

SQLite 数据库文件位于：`/www/wonder_platform/backend/hk_admin.db`

为了保证数据安全，建议设置**自动本地备份**。备份脚本会自动使用 `sqlite3` 安全热备并压缩为 `.gz` 文件，保留最近 30 天的记录。

```bash
# 1. 赋予执行权限
chmod +x /www/wonder_platform/deploy/backup.sh

# 2. 手动执行测试
/www/wonder_platform/deploy/backup.sh

# 3. 设置 crontab 每天凌晨 3 点自动备份
crontab -e
# 在文件末尾添加以下一行：
# 0 3 * * * /www/wonder_platform/deploy/backup.sh >> /www/wonder_platform/logs/backup.log 2>&1
```

---

## ☁️ 云端同步与数据迁移 (Cloud Sync)

如果您需要将备份的数据库同步到云端（如阿里云 OSS、Google Drive 等），建议使用以下工具：

### 方案 A：使用阿里云 OSS (推荐)
适用于阿里云内网环境，速度快且流量费用低。

1. **下载并配置 ossutil**:
   ```bash
   wget https://gosspublic.alicdn.com/ossutil/install.sh && sudo bash install.sh
   ossutil config # 输入 AccessKey, Endpoint (oss-cn-hongkong.aliyuncs.com)
   ```
2. **手动同步备份文件夹**:
   ```bash
   # 将本地备份目录同步到 OSS Bucket
   ossutil cp -r /www/wonder_platform/data/backups oss://your-bucket-name/backups/
   ```

### 方案 B：使用 Rclone (通用型)
支持 Google Drive, OneDrive, S3, Dropbox 等。

1. **安装 rclone**: `sudo apt install rclone`
2. **配置远程端**: `rclone config` (按照提示添加一个名为 `remote` 的配置)
3. **手动同步**:
   ```bash
   # 同步本地备份到远程云盘
   rclone sync /www/wonder_platform/data/backups remote:wonder_platform_backups
   ```


## 🔑 安全提醒

- `backend/.env` 已在 `.gitignore` 中，**切勿提交到 GitHub**
- 当前 SECRET_KEY 是生产强密钥，如需更换需同时让所有用户重新登录
- 定期检查 `pm2 logs` 中是否有异常错误
- 建议每月通过阿里云控制台创建一次快照备份

---

## 📂 目录结构

```
/www/wonder_platform/
├── backend/           # Python FastAPI 后端
│   ├── venv/          # Python 虚拟环境
│   ├── hk_admin.db    # SQLite 主数据库 ⭐
│   └── .env           # 生产环境变量（勿提交）
├── apps/
│   ├── wonder-hub/    # Next.js C端（.next/ 构建产物）
│   ├── company-admin/ # Vite B端（dist/ 构建产物）
│   └── fis-hub/       # Vite 金融沙盘（dist/ 构建产物）
├── deploy/            # 部署文件夹
│   ├── README.md      # 本手册
│   ├── setup_server.sh
│   ├── ecosystem.config.js
│   ├── nginx.conf
│   ├── deploy.sh
│   └── .env.production
└── logs/              # PM2 日志目录（自动生成）
```
