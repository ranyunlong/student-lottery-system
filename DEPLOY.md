# 学生抽奖系统 — 部署文档

## 环境要求

| 依赖 | 版本要求 |
|------|----------|
| Docker | ≥ 24.0（需支持 BuildKit / `docker buildx`） |
| Docker Compose | ≥ 2.0 |
| 操作系统 | Linux（amd64） |
| Node.js | ≥ 24.15（仅本地开发/构建需要） |

> **注意**：镜像目标平台为 `linux/amd64`，请确保部署服务器同为 amd64 架构，或在 ARM 服务器上使用 `--platform linux/amd64` 运行。

---

## 1. 项目架构概览

```
                    ┌─────────────┐
      80/443 ──────▶│   Caddy     │ (自动 HTTPS)
                    │   proxy     │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            ▼            │
     ┌────────┴────────┐          ┌─────┴─────┐
     │      app        │          │  cleanup  │
     │  (Next.js 16)   │          │ (emblem   │
     │  :3000          │          │  orphan)  │
     └────────┬────────┘          └─────┬─────┘
              │                         │
              └──────────┬──────────────┘
                         │
              ┌──────────▼──────────┐
              │   PostgreSQL 17    │
              │   db :5432         │
              └────────────────────┘
```

- **app**：Next.js 16 应用服务（standalone 模式）
- **cleanup**：定时清理未被引用的班徽文件
- **db**：PostgreSQL 17 数据库
- **proxy**：Caddy 反向代理，自动通过 Let's Encrypt 签发 SSL 证书

所有内部服务通过 `private` 网络通信（`internal: true`），仅 Caddy 暴露公网端口。

---

## 2. 镜像构建与推送

### 2.1 构建镜像

```bash
# 在项目根目录执行（macOS / Windows 需指定 amd64 平台）
docker buildx build --platform linux/amd64 --load -t student-lottery-system-app:latest .
```

构建产物：
- 镜像名：`student-lottery-system-app:latest`
- 平台：`linux/amd64`
- 基础镜像：`node:24-alpine`

### 2.2 推送到阿里云容器镜像服务

```bash
# 登录阿里云 Docker Registry
docker login --username=<你的阿里云账号> registry.cn-hangzhou.aliyuncs.com

# 打标签
docker tag student-lottery-system-app:latest registry.cn-hangzhou.aliyuncs.com/geckoai/student-lottery-system-app:v1.0.1

# 推送
docker push registry.cn-hangzhou.aliyuncs.com/geckoai/student-lottery-system-app:v1.0.1
```

---

## 3. 部署步骤

### 3.1 准备部署目录

在目标服务器上：

```bash
mkdir -p /opt/student-lottery && cd /opt/student-lottery
```

### 3.2 上传部署文件

将以下文件上传到 `/opt/student-lottery/`：

| 文件 | 说明 |
|------|------|
| `compose.yml` | 主 Compose 配置 |
| `compose.registry.yml` | 镜像覆盖配置（使用远端镜像而非本地构建） |
| `Caddyfile` | Caddy 反向代理规则 |
| `.env` | 环境变量（见下方说明） |

> **安全提醒**：`.env` 包含敏感信息（数据库密码、Auth Secret、Admin 凭据），请通过 `scp` 或内网工具传输，切勿提交到公开仓库。

### 3.3 配置环境变量

编辑 `.env` 文件，确认以下变量正确：

```bash
# .env
COMPOSE_PROJECT_NAME=student-lottery-system
DOMAIN=luck.geckoai.cn                                    # 你的域名

# 数据库配置（修改默认密码！）
POSTGRES_DB=lottery
POSTGRES_USER=lottery
POSTGRES_PASSWORD=<生成一个强密码>                          # 生产环境务必修改
DATABASE_URL=postgres://lottery:<密码>@db:5432/lottery     # 与上面对应

# Auth 密钥（生成一个强随机字符串）
BETTER_AUTH_SECRET=<生成一个强密钥>

# 班徽清理配置
EMBLEM_CLEANUP_BATCH_SIZE=50
EMBLEM_CLEANUP_INTERVAL_SECONDS=900                        # 15 分钟

# 首次部署创建管理员（只用一次）
ADMIN_EMAIL=<管理员邮箱>
ADMIN_PASSWORD=<管理员密码的 SHA256 哈希值>
```

> 生成强密钥：`openssl rand -hex 32`
> 生成密码哈希：`echo -n "你的密码" | sha256sum`

### 3.4 启动服务

```bash
# 使用 registry 镜像（推荐：从阿里云拉取预构建镜像）
docker compose -f compose.yml -f compose.registry.yml up -d

# 如果需要从本地构建（开发/测试环境）：
docker compose up -d
```

首次启动会自动执行：
1. PostgreSQL 初始化 → 就绪检查
2. `npm run db:migrate:docker` — 运行数据库迁移
3. `node server.js` — 启动 Next.js 应用

### 3.5 创建管理员账号

```bash
# 进入 app 容器执行
docker compose exec app npx tsx scripts/create-admin.ts
```

或者如果未设置 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 环境变量，直接执行时会交互式输入：

```bash
docker compose exec app npm run admin:create
```

### 3.6 检查服务状态

```bash
# 查看所有容器运行状态
docker compose ps

# 查看 app 日志
docker compose logs -f app

# 健康检查
curl -f https://luck.geckoai.cn/api/health
```

---

## 4. 数据与备份

### 4.1 数据卷

| 卷名 | 挂载点 | 内容 |
|------|--------|------|
| `postgres-data` | `/var/lib/postgresql/data` | 数据库数据 |
| `emblem-data` | `/var/lib/student-lottery/emblems` | 班徽图片文件 |
| `caddy-data` | `/data` | Caddy 证书与持久化数据 |
| `caddy-config` | `/config` | Caddy 运行时配置 |

### 4.2 备份数据库

```bash
# 导出 SQL 转储
docker compose exec db pg_dump -U lottery lottery > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 4.3 备份班徽文件

```bash
# 使用 maintenance profile 导出
docker compose --profile maintenance run --rm emblem-backup > emblems_$(date +%Y%m%d_%H%M%S).tar.gz
```

### 4.4 恢复班徽文件

```bash
docker compose --profile maintenance run --rm -T emblem-restore < emblems_20260101_000000.tar.gz
```

---

## 5. 版本升级

### 5.1 更新镜像

```bash
# 拉取新版本镜像
docker compose -f compose.yml -f compose.registry.yml pull app cleanup

# 滚动重启（先启动新容器再停旧容器）
docker compose -f compose.yml -f compose.registry.yml up -d --no-deps app cleanup

# 确认新版本运行正常
docker compose logs -f app
```

> 数据库迁移在 app 容器启动时自动执行（`npm run db:migrate:docker`），无需手动干预。

### 5.2 回滚

```bash
# 修改 compose.registry.yml 中的镜像标签为上一版本
# 然后重新部署
docker compose -f compose.yml -f compose.registry.yml up -d --no-deps app cleanup
```

---

## 6. 常用运维命令

```bash
# 查看所有容器状态
docker compose ps

# 重启某个服务
docker compose restart app

# 查看实时日志
docker compose logs -f --tail=100 app

# 停止所有服务
docker compose down

# 停止并删除数据卷（危险！）
docker compose down -v

# 进入 app 容器调试
docker compose exec app sh

# 进入数据库
docker compose exec db psql -U lottery

# 手动运行班徽孤儿清理
docker compose exec cleanup npm run emblem:cleanup
```

---

## 7. 服务端口

| 服务 | 内部端口 | 公网暴露 |
|------|----------|----------|
| Caddy (HTTPS) | — | 443/tcp |
| Caddy (HTTP → HTTPS 重定向) | — | 80/tcp |
| App | 3000/tcp | 否（仅内网） |
| PostgreSQL | 5432/tcp | 否（仅内网） |

---

## 8. 健康检查

| 服务 | 检查方式 | 间隔 |
|------|----------|------|
| db | `pg_isready` | 5s |
| app | `GET /api/health` | 10s |
| proxy | `caddy validate` | 30s |
| cleanup | 最近成功时间戳 vs 当前时间 | 30s |

---

## 9. 镜像信息

| 项目 | 值 |
|------|-----|
| 镜像仓库 | `registry.cn-hangzhou.aliyuncs.com/geckoai/student-lottery-system-app` |
| 当前版本 | `v1.0.0` |
| 平台 | `linux/amd64` |
| 基础镜像 | `node:24-alpine` |
| 构建命令 | `docker buildx build --platform linux/amd64 --load -t student-lottery-system-app:latest .` |
| 登录命令 | `docker login registry.cn-hangzhou.aliyuncs.com` |

---

## 10. 故障排查

### 数据库连接失败

```bash
# 确认 db 容器健康
docker compose ps db
# 手动测试连接
docker compose exec app sh -c "node -e \"const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query('SELECT 1').then(()=>{console.log('OK');process.exit(0)}).catch(e=>{console.error(e);process.exit(1)})\""
```

### HTTPS 证书问题

Caddy 自动通过 Let's Encrypt 签发证书，确保：
- DNS 已正确指向服务器 IP
- 端口 80 / 443 已开放且可公网访问
- 域名未被防火墙屏蔽

### 镜像拉取失败

```bash
# 重新登录阿里云 registry
docker login registry.cn-hangzhou.aliyuncs.com
# 手动拉取
docker pull registry.cn-hangzhou.aliyuncs.com/geckoai/student-lottery-system-app:v1.0.0
```