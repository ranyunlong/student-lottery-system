# 学生抽奖系统部署与运维

## Docker 公网部署

生产环境需要一台安装 Docker Engine 和 Compose plugin 的 Linux 主机。将 `.env.example` 复制为部署环境的 `.env`，替换 `DOMAIN`、`POSTGRES_PASSWORD`、`DATABASE_URL` 和 `BETTER_AUTH_SECRET`；`DATABASE_URL` 中的密码必须进行 URL 编码。不要把生产 `.env` 或管理员密码提交到仓库。

域名的 A/AAAA 记录必须指向服务器，并允许入站 TCP 80/443。Caddy 会为 `DOMAIN` 自动申请和续期 HTTPS 证书，证书状态保存在 `caddy-data` 卷。

```sh
docker compose --env-file .env up -d --build
docker compose ps
curl -fsS https://$DOMAIN/api/health
```

`app` 先等待 PostgreSQL 健康，再执行 `npm run db:migrate:docker`；迁移成功后才启动 `server.js`。`proxy` 只依赖 app 健康后接收流量。数据库没有 `ports` 映射，公网仅暴露 Caddy 的 80/443。

首次管理员创建使用部署环境变量，不写入镜像或仓库：

```sh
docker compose --env-file .env run --rm --no-deps \
  -e ADMIN_EMAIL='admin@example.com' \
  -e ADMIN_PASSWORD='临时强密码' \
  app npm run admin:create
```

手工执行迁移或检查迁移状态时，使用同一个内部数据库 URL：

```sh
docker compose --env-file .env run --rm --no-deps app npm run db:migrate:docker
```

## 健康检查和构建路径

`GET /api/health` 每次执行 `SELECT 1`。数据库可用时返回 `200 {"status":"ok"}`，连接失败时返回 `503 {"status":"unavailable"}`。Compose app healthcheck 使用该接口，proxy 只在 app 健康后启动流量转发。

Dockerfile 使用 Node 24 Alpine 多阶段构建和 Next standalone 输出。Linux/容器默认执行 `npm run build`，即当前 Next 生产构建路径；Windows 本地如遇 Turbopack 环境差异，可使用已知替代 `npm run build:webpack`，这不是生产容器路径。

## 班徽持久化和清理

`EMBLEM_DIR=/var/lib/student-lottery/emblems` 挂载到独立的 `emblem-data` 卷。班徽替换产生的旧文件进入数据库清理队列；`cleanup` 服务每 `EMBLEM_CLEANUP_INTERVAL_SECONDS` 秒运行一次 `npm run emblem:cleanup -- --limit "$EMBLEM_CLEANUP_BATCH_SIZE"`，批量大小限制在 CLI 内为 1 到 100。单次只处理有界数量，不会因大积压阻塞上传。

清理服务失败时保留队列记录并增加 attempts/lastError，容器日志和 cleanup healthcheck 可观察最近成功执行。建议至少监控：

```sh
docker compose logs --since=1h cleanup
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "select count(*) as pending, max(attempts) as max_attempts, count(*) filter (where last_error is not null) as with_errors from emblem_cleanup;"
docker compose exec app df -h "$EMBLEM_DIR"
```

当 `pending`、`with_errors` 或卷使用率持续上升时，应先保留日志和数据库记录，再人工处理故障；不要直接删除班徽卷。也可在维护窗口手工运行一次 bounded cleanup：

```sh
docker compose run --rm --no-deps cleanup npm run emblem:cleanup -- --limit 50
```

## 备份

备份脚本要求 app、db 已启动，并在主机上执行。它在同一时间窗口内导出 PostgreSQL 和班徽卷，输出 SQL、tar.gz 和可选 SHA-256 manifest：

```sh
BACKUP_DIR=/srv/student-lottery/backups sh scripts/backup.sh
```

脚本通过 db 容器内的 `pg_dump` 导出数据库，通过 app 容器读取 `EMBLEM_DIR` 打包班徽卷。为获得一致的业务快照，建议在低流量维护窗口执行；SQL 和文件卷不是跨系统事务，必须成套保留同一时间戳的两个文件。备份目录应再复制到独立主机或对象存储，并定期验证可读性。

## 隔离恢复演练

恢复演练必须使用不同 Compose project name，不能覆盖生产卷。以下示例使用与生产备份对应的临时 `.env.restore`，其中数据库凭据可使用专门的演练值：

```sh
docker compose -p lottery-restore --env-file .env.restore up -d db app
docker compose -p lottery-restore --env-file .env.restore exec -T db \
  sh -ec 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < backups/postgres-<stamp>.sql
docker compose -p lottery-restore --env-file .env.restore exec -T app \
  sh -ec 'tar -C "$EMBLEM_DIR" -xzf -' < backups/emblems-<stamp>.tar.gz
docker compose -p lottery-restore --env-file .env.restore exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'select count(*) from classes;'
docker compose -p lottery-restore --env-file .env.restore exec app \
  sh -ec 'df -h "$EMBLEM_DIR"'
docker compose -p lottery-restore --env-file .env.restore down -v
```

演练验收至少包括：健康接口返回 200、抽样班级记录存在、抽样班徽文件可读、迁移版本完整、恢复后的卷容量合理。若恢复失败，保留临时 project 的日志和卷状态供排查，确认无误后再执行 `down -v`。
