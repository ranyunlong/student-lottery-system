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

## E2E 浏览器测试

首次配置专用 PostgreSQL 17 E2E 服务时，由数据库管理员创建 `lottery_e2e` 数据库、应用迁移，并设置数据库 comment：

```sql
COMMENT ON DATABASE lottery_e2e IS 'student-lottery-e2e:v1';
```

在当前 shell 或本机密钥管理器中设置 `E2E_DATABASE_ADMIN_URL`，仅指向专用服务中的 `127.0.0.1:55433/lottery_e2e`。该 provisioning 角色需能创建数据库/角色并终止其临时数据库中的连接（专用本地测试容器可使用管理员角色）；不要将 URL、密码写入仓库、日志或报告。入口会验证 loopback 目标、数据库 comment 和 provisioning 权限。不要将该变量指向集成测试库、开发库或生产库。

每次 `npm run test:e2e` 都会生成 UUID 命名的隔离数据库和非特权应用角色，在该数据库执行现有 Drizzle migrations，再验证 owner、DML grants 和中奖记录保护 trigger。Next 与 Playwright 子进程只收到必要的系统变量和本次生成的受限角色 URL；provisioning URL 不会传给子进程。运行期间 runner 在专用基础库持有本次 run 的 advisory lease。正常成功、测试失败及 SIGINT/SIGTERM 都会有界停止 Playwright 和 Next，再按数据库/角色 marker 回收该 run；数据库连接终止会等待并重试，最多五次。基础 `lottery_e2e` 数据库、已有中奖结果和其他 run 不会被清理或覆盖。

runner 会在创建隔离数据库后打印不含凭据的 run ID。若有界清理失败，输出该 run 的回收命令；在确认对应测试进程已停止后，使用同一个 `E2E_DATABASE_ADMIN_URL` 执行：

```sh
node tests/e2e/run.mjs --recover=<run-id>
```

恢复入口只接受完整 run ID，重新验证专用基础库身份、数据库和角色 comment marker、活动连接，并取得该 run 的 advisory lease；活动中的 run 会被拒绝。SIGKILL、系统崩溃或断电会跳过 finally，可能留下隔离数据库和角色，不能保证自动清理。若没有保留 runner 输出中的 ID，只在专用 `lottery_e2e` 上只读列出 `lottery_e2e_run_*` 数据库 comment 与 `lottery_e2e_app_*` 角色 comment，按相同 UUID 后缀和完整 `student-lottery-e2e-run:v1:<id>` / `student-lottery-e2e-role:v1:<id>` marker 配对；确认没有相关 runner/Next/Playwright 进程后，再对该单一 ID 使用上述恢复命令。不要对名称前缀执行批量 DROP，也不要删除任何卷。

安装依赖并安装 Playwright Chromium 浏览器二进制：

```sh
npm ci
npx playwright install chromium
npm run test:e2e
```

脚本会自行启动 Next.js 和 Chromium 测试。应用 secret、临时数据库角色密码、管理员/老师 fixture 密码均在本次运行中随机生成，不需要写入 `.env` 或文档。缺少 `E2E_DATABASE_ADMIN_URL`、数据库身份不匹配或未安装 Chromium 时，会在启动应用服务器前给出明确错误；缺浏览器时提示执行 `npx playwright install chromium`。

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

在部署目录执行 `scripts/backup.sh`。Docker Compose 必须能访问目标 project 且 db 正在运行。脚本为备份目录加互斥锁；记录 app/cleanup/proxy 原运行状态，并按 Docker Compose project/service labels 检查正在运行的 writer 容器（包括 `compose run` 创建的 one-off）。发现 one-off 或无法归类的 app/cleanup 容器时会拒绝备份，不会停止或删除未知容器。通过检查后先停 proxy 阻断新请求，再有界优雅停止 app 和 cleanup，并确认 project 内没有残留 writer 容器。快照期间脚本监听该 project 的 app/cleanup Docker `start` 事件；检测到启动、事件监视器退出或报告错误时，本次 staging 会被丢弃。

备份锁只串行化 `backup.sh`，不能锁住 Docker Compose 生命周期操作。操作员必须在整个备份窗口独占维护该 project：从脚本开始到完成，不要在其他终端、自动化任务或面板中对 app/cleanup 执行 `up`、`start` 或 `run`。事件监视用于发现意外启动并使备份失败，不能替代该维护约定。班徽由 maintenance profile 下的 `emblem-backup` helper 读取；它使用 PostgreSQL 17 Alpine 镜像且只读挂载 `emblem-data`，不会启动 app。

数据库导出、班徽 tar 校验、writer 事件检查及 SHA-256 manifest 全部成功后，脚本将同一暂存目录原子改名为完整备份目录。任一步失败会删除暂存目录，不发布半套备份；退出 trap 按原状态和顺序恢复 app、cleanup、proxy。停止等待默认 60 秒，单项备份默认限时 1800 秒，服务恢复默认等待 120 秒，可用 `STOP_TIMEOUT_SECONDS`（1..300）、`BACKUP_TIMEOUT_SECONDS`（1..86400）、`RESTORE_WAIT_SECONDS`（1..3600）调整。

```sh
BACKUP_DIR=/srv/student-lottery/backups sh scripts/backup.sh
```

成功输出目录内有 `postgres.sql`、`emblems.tar.gz`、`manifest.sha256`。将完整目录复制到独立主机或对象存储，并定期核验哈希和执行恢复演练。不要在维护备份期间手工启动 app 或 cleanup。

若主机断电或脚本被强制终止，可能留下 `.student-lottery-backup.lock` 和 `.partial.*` 暂存目录。恢复前先检查正在使用的全部 shell/自动化执行环境和目标 project，确认没有任何 `backup.sh` 进程存活，例如：

```sh
ps -eo pid=,args= | grep '[s]cripts/backup.sh' || true
```

只有确认进程不存在后，才可对实际备份目录移除空锁目录；`rmdir` 会拒绝删除非空目录：

```sh
BACKUP_DIR=/srv/student-lottery/backups
rmdir "$BACKUP_DIR/.student-lottery-backup.lock"
```

先检查遗留 `.partial.*` 内容和容器状态，不要将 partial 目录当成完整备份，也不要在进程仍运行时移除锁或暂存文件。确认目标 project 的 app/cleanup 状态后，再单独决定是否恢复服务。

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
