# 学生抽奖系统部署与本地开发

## 本地安装与启动

安装 Node.js `>=24.15.0 <25`（24.x LTS；用版本管理器固定兼容补丁版），并确认 `node --version` 满足范围。以下示例用测试 Compose 文件启动只绑定回环地址的 PostgreSQL 测试库；本地应用仍在宿主机运行。

```sh
cp .env.example .env
```

在 `.env` 中为本地环境设置随机 `BETTER_AUTH_SECRET`，并将 `DATABASE_URL` 设为 `postgres://lottery_test:lottery_test_only@127.0.0.1:55432/lottery_test`。不要把真实密钥或 `.env` 提交到仓库。

```sh
docker compose -f compose.test.yml up -d postgres
npm ci
node --env-file=.env --run db:migrate
node --env-file=.env --run dev
```

Next.js 默认在 `http://localhost:3000` 提供本地应用。停止本地测试数据库：

```sh
docker compose -f compose.test.yml stop postgres
```

本地首次创建管理员（在项目根目录运行；邮箱可公开，密码不会回显或进入 shell 历史）：

```sh
read -r -p '管理员邮箱: ' ADMIN_EMAIL
read -r -s -p '管理员临时密码: ' ADMIN_PASSWORD
printf '\n'
export ADMIN_EMAIL ADMIN_PASSWORD
node --env-file=.env --run admin:create
unset ADMIN_EMAIL ADMIN_PASSWORD
```

Node 的 `--env-file` 会加载 `.env`，环境中已有的临时管理员凭据优先于文件值。此命令与 `npm run admin:create` 使用同一 `tsx scripts/create-admin.ts` 脚本。

## Docker 公网部署

生产环境需要安装 Docker Engine 和 Compose plugin 的 Linux 主机。将 `.env.example` 复制为部署 `.env`，替换 `DOMAIN`、`POSTGRES_PASSWORD`、`DATABASE_URL` 和 `BETTER_AUTH_SECRET`。`DATABASE_URL` 内的密码必须 URL 编码。不要提交生产 `.env` 或管理员凭据。

域名 A/AAAA 记录应指向服务器，防火墙允许入站 TCP 80/443。Caddy 为配置的域名自动申请/续期 HTTPS 证书，并把证书状态保存在 `caddy-data` 卷。

```sh
docker compose --env-file .env up -d --build
docker compose --env-file .env ps
curl -fsS https://lottery.example.com/api/health
```

将上例域名替换为 `.env` 中配置的实际域名。Compose 的 `.env` 用于变量插值，不会导出为宿主机 shell 变量。数据库不发布宿主机端口；只有 Caddy 发布 80/443。`app` 等 PostgreSQL healthy 后运行 `drizzle-kit migrate`，迁移完成才启动 Next standalone server；proxy 等 app 健康后才转发流量。

首次管理员创建时交互式输入凭据，避免把密码写进 shell 历史：

```sh
read -r -p '管理员邮箱: ' ADMIN_EMAIL
read -r -s -p '管理员临时密码: ' ADMIN_PASSWORD
printf '\n'
export ADMIN_EMAIL ADMIN_PASSWORD
docker compose --env-file .env run --rm --no-deps -T \
  -e ADMIN_EMAIL -e ADMIN_PASSWORD app npm run admin:create
unset ADMIN_EMAIL ADMIN_PASSWORD
```

手工重跑迁移：

```sh
docker compose --env-file .env run --rm --no-deps app npm run db:migrate:docker
```

## 健康检查与班徽清理

`GET /api/health` 执行 `SELECT 1`；数据库可用返回 `200 {"status":"ok"}`，不可用返回 `503 {"status":"unavailable"}`。本机容器内探针（无需宿主机导出变量）：

```sh
docker compose --env-file .env exec -T app node -e 'fetch("http://127.0.0.1:3000/api/health").then(async r => { console.log(r.status, await r.text()); process.exit(r.status === 200 ? 0 : 1); })'
```

`EMBLEM_DIR=/var/lib/student-lottery/emblems` 挂载到独立 `emblem-data` 卷。cleanup 服务每 `EMBLEM_CLEANUP_INTERVAL_SECONDS` 秒运行一次有界批处理，默认 `--limit 50`，CLI 限制为 1..100。失败队列保留 `attempts`/`lastError`；cleanup healthcheck 检查最近成功时间及失败是否晚于成功。建议监控日志、积压/错误数和卷容量：

```sh
docker compose --env-file .env logs --since=1h cleanup
docker compose --env-file .env exec -T db sh -ec 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select count(*) as pending, max(attempts) as max_attempts, count(*) filter (where last_error is not null) as with_errors from emblem_cleanup;"'
docker compose --env-file .env exec -T app sh -ec 'df -h "$EMBLEM_DIR"'
```

这里的数据库和班徽变量在容器内展开，不依赖宿主机导出 `.env`。积压、错误或卷使用率持续上升时先保留日志和队列记录，不要直接删除卷。

## 一致性备份

在部署目录执行 `scripts/backup.sh`。Docker Compose 必须能访问目标 project 且 db 正在运行。脚本为备份目录加互斥锁；记录 app/cleanup/proxy 原运行状态，先停 proxy 阻断新请求，再用有界优雅停止排空并停止 app 和 cleanup。只有确认两个写入服务均已停止后才开始 `pg_dump`。整个数据库与班徽快照期间 writer 保持停止；班徽由 maintenance profile 下的 `emblem-backup` helper 读取，它使用 PostgreSQL 17 Alpine 镜像且只读挂载 `emblem-data`，不会启动 app。

数据库导出、班徽 tar 校验及 SHA-256 manifest 全部成功后，脚本将同一暂存目录原子改名为完整备份目录。任一步失败会删除暂存目录，不发布半套备份；退出 trap 按原状态和顺序恢复 app、cleanup、proxy。停止等待默认 60 秒，单项备份默认限时 1800 秒，服务恢复默认等待 120 秒，可用 `STOP_TIMEOUT_SECONDS`（1..300）、`BACKUP_TIMEOUT_SECONDS`（1..86400）、`RESTORE_WAIT_SECONDS`（1..3600）调整。

```sh
BACKUP_DIR=/srv/student-lottery/backups sh scripts/backup.sh
```

成功输出目录内有 `postgres.sql`、`emblems.tar.gz`、`manifest.sha256`。将完整目录复制到独立主机或对象存储，并定期核验哈希和执行恢复演练。不要在维护备份期间手工启动 app 或 cleanup。

## 隔离恢复演练

恢复使用全新 Compose project、独立命名卷和独立数据库凭据。先从 `.env.example` 制作 `.env.restore`，填写新 project 的数据库密码、与之匹配的 `DATABASE_URL`、随机 auth secret 和 restore 域名占位值。恢复期间只启动 db；不启动 app、cleanup 或 proxy，避免迁移或应用写入干扰导入。新 project 的 app/cleanup 镜像必须在该 project 下显式 build，避免引用不存在的 project-prefixed image tag。

```sh
RESTORE_PROJECT=lottery-restore
BACKUP_DIR=/srv/student-lottery/backups/student-lottery-backup-<stamp>-<pid>
docker compose -p "$RESTORE_PROJECT" --env-file .env.restore build app cleanup
docker compose -p "$RESTORE_PROJECT" --env-file .env.restore up -d --wait db
docker compose -p "$RESTORE_PROJECT" --env-file .env.restore exec -T db \
  sh -ec 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < "$BACKUP_DIR/postgres.sql"
docker compose -p "$RESTORE_PROJECT" --profile maintenance --env-file .env.restore \
  run --rm --no-deps -T emblem-restore < "$BACKUP_DIR/emblems.tar.gz"
docker compose -p "$RESTORE_PROJECT" --env-file .env.restore up -d --no-deps --wait app
docker compose -p "$RESTORE_PROJECT" --env-file .env.restore exec -T app \
  node -e 'fetch("http://127.0.0.1:3000/api/health").then(async r => { console.log(r.status, await r.text()); process.exit(r.status === 200 ? 0 : 1); })'
docker compose -p "$RESTORE_PROJECT" --env-file .env.restore exec -T app \
  sh -ec 'df -h "$EMBLEM_DIR"'
```

再核对抽样数据库记录、migration 表及班徽文件。确认演练通过后，单独审阅并按项目名清理演练环境；生产 Compose project 和卷不应出现在恢复命令中。

## 构建路径

Dockerfile 使用 Node 24 Alpine 多阶段构建和 Next standalone 输出。Linux 容器默认执行 `npm run build`（Next 默认 Turbopack）；Windows 本地若遇 Turbopack 派生进程权限问题，可用 `npm run build:webpack` 作为已知替代，不代表生产容器构建路径。
