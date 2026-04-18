# Wonder Platform 群晖 DS925+ 部署实施计划

针对您的 Synology DS925+ (性能非常强劲，支持最新的 DSM 7.2 和 Container Manager)，我们采用 **Docker Compose 生产化容器部署** 是最稳妥、最标准的方式。

当前代码库（Monorepo）中的 `docker-compose.yml` 是用于本地**开发环境**的（挂载本地文件夹热更新）。为了在群晖上稳定运行，我们需要对其进行“**生产环境改造 (Production Ready)**”。

## User Review Required

> [!IMPORTANT]
> 这是在您确认“整个项目合并成功后”进行的实施操作规划。在执行此计划前，请确认代码本地测试均已无误。

## 安全与密钥保护协议 (Secret Management)

> [!CAUTION]
> 绝对不能将 API Key、数据库密码、JWT Secret 等敏感信息硬编码（Hardcode）写死在代码文件或 `docker-compose.yml` 中。

针对您的密钥保护需求，我们将采用业界标准的 **`.env` 环境变量挂载** 方案：

1. **代码层面改造**：
   - 将前后端代码中写死的敏感密钥提取出来，改为读取环境变量（Python 读取 `os.environ.get("API_KEY")`，前端 Vite 读取 `import.meta.env.VITE_API_KEY`）。
2. **Git 隔离**：
   - 确保根目录的 `.gitignore` 文件中包含 `.env`，这样您的真实密钥绝对不会被提交到云端仓库，避免泄露风险。
3. **群晖部署投递**：
   - 当部署到 DS925+ 时，您只需在群晖 NAS 的项目文件夹（例如 `docker/wonder_platform/`）手动创建一个真实的 `.env` 文件。
   - 我们的 `docker-compose.prod.yml` 会被配置为自动去读取这个 `.env` 文件，将加密数据以极其安全的形式“无痕注入”到运行的容器内存中。

---

## 阶段一：代码库生产化改造 (我将为您代劳的操作)

当您完成最后的“合并功能”后，我将介入执行以下容器化操作：

### 1. 编写前端生产环境 Dockerfile
前端应用 (`apps/company-admin` 和 `apps/wonder-hub`) 目前缺少 Dockerfile。
- 我们将使用 **Multi-stage Build (多阶段构建)**：第一阶段使用 Node 编译打包 React/Vite 项目，第二阶段使用极简的 Nginx 服务器托管静态文件。
- 这样可以极大地降低前端镜像体积（从 1GB+ 降至 20MB 左右），并大幅提升群晖的访问速度。

### 2. 优化后端 Dockerfile
- 检查 `backend/Dockerfile`，确保 Gunicorn/Uvicorn 参数适合生产环境的多并发，并验证其是否正确接管了 `.env` 文件传递过来的环境变量。

### 3. 创建 `docker-compose.prod.yml`
新建一个专供群晖使用的组合配置，其核心改动包括：
- **安全注入**：配置 `env_file: .env` 使得容器安全读取群晖上的密钥。
- **移除代码挂载**：不再将本地文件夹挂载进容器，而是直接运行打包好的镜像代码。
- **数据持久化 (Volume)**：将 SQLite 数据库文件 (`hk_admin.db`) 和上传的文件挂载出群晖的本地硬盘。**如果不做这一步，群晖重启容器会导致您的所有数据清空！**
- **内网端口设定**：统一暴露出干净的端口供群晖反向代理使用。

---

## 阶段二：群晖端操作指南 (需要您在 NAS 上操作)

当上述代码就绪后，您只需要按照以下步骤在您的 DS925+ 上操作：

### 1. 拷贝文件到群晖
1. 打开群晖的 **File Station**。
2. 在 `docker` 共享文件夹下，新建一个目录，例如 `wonder_platform`。
3. 将我们整理好的代码文件夹拷贝进去。
4. **最关键一步**：在 `wonder_platform` 文件夹下，手动新建一个文本文档重命名为 `.env`，填入您的高级 API Keys。

### 2. 一键启动项目
1. 打开群晖套件中心，确保已安装 **Container Manager** (旧称 Docker)。
2. 打开 Container Manager，在左侧选择 **项目 (Project)**，点击 **新增**。
3. **路径**：选择刚才的 `docker/wonder_platform` 文件夹。
4. **来源**：选择 `docker-compose.prod.yml`。
5. 点击下一步，群晖会自动拉取所有环境，安全注入您的密钥，并构建拉起我们的前后端。

### 3. 配置外网/域名访问 (反向代理)
为了让外部人员或员工能够优雅地通过域名访问：
1. 进入群晖 **控制面板** -> **登录门户** -> **高级** -> **反向代理服务器**。
2. 新增一条规则：
   - 来源端口：HTTPS / 443 / 您的域名
   - 目的地：HTTP / localhost / 3000 (映射到我们 Docker 里的前端端口)

---

## Open Questions

在正式开始实施**“阶段一”**之前，您可以继续安心完成您手头的代码合并工作。
针对接下来的步骤，我依然需要向您确认一个小细节：

> [!NOTE]
> 1. SQLite 数据库位置：目前后端的 `hk_admin.db` 是存放在 `backend` 根目录下吗？确认后，我才能准确写死群晖的挂载路径，确保数据绝对安全。
