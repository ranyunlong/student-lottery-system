#!/bin/sh
set -eu

BACKUP_DIR=${BACKUP_DIR:-./backups}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DB_BACKUP="$BACKUP_DIR/postgres-$STAMP.sql"
EMBLEM_BACKUP="$BACKUP_DIR/emblems-$STAMP.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "Backing up PostgreSQL to $DB_BACKUP"
docker compose exec -T db sh -ec \
  'pg_dump --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "$DB_BACKUP"

echo "Backing up emblem volume to $EMBLEM_BACKUP"
docker compose exec -T app sh -ec \
  'tar -C "$EMBLEM_DIR" -czf - .' \
  > "$EMBLEM_BACKUP"

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$DB_BACKUP" "$EMBLEM_BACKUP" > "$BACKUP_DIR/manifest-$STAMP.sha256"
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$DB_BACKUP" "$EMBLEM_BACKUP" > "$BACKUP_DIR/manifest-$STAMP.sha256"
fi

echo "Backup complete: $DB_BACKUP and $EMBLEM_BACKUP"
