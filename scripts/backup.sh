#!/bin/sh
set -eu

BACKUP_DIR=${BACKUP_DIR:-./backups}
STOP_TIMEOUT_SECONDS=${STOP_TIMEOUT_SECONDS:-60}
BACKUP_TIMEOUT_SECONDS=${BACKUP_TIMEOUT_SECONDS:-1800}
RESTORE_WAIT_SECONDS=${RESTORE_WAIT_SECONDS:-120}

validate_range() {
  name=$1
  value=$2
  minimum=$3
  maximum=$4
  case "$value" in
    ''|*[!0-9]*) echo "$name must be an integer between $minimum and $maximum" >&2; exit 2 ;;
  esac
  if [ "$value" -lt "$minimum" ] || [ "$value" -gt "$maximum" ]; then
    echo "$name must be an integer between $minimum and $maximum" >&2
    exit 2
  fi
}

validate_range STOP_TIMEOUT_SECONDS "$STOP_TIMEOUT_SECONDS" 1 300
validate_range BACKUP_TIMEOUT_SECONDS "$BACKUP_TIMEOUT_SECONDS" 1 86400
validate_range RESTORE_WAIT_SECONDS "$RESTORE_WAIT_SECONDS" 1 3600

mkdir -p "$BACKUP_DIR"
BACKUP_DIR=$(cd "$BACKUP_DIR" && pwd -P)
LOCK_DIR="$BACKUP_DIR/.student-lottery-backup.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "another backup may be running; lock exists: $LOCK_DIR" >&2
  exit 1
fi

STAGE_DIR=''
FINAL_DIR=''
RESTORE_APP=0
RESTORE_CLEANUP=0
RESTORE_PROXY=0
BACKUP_EXIT_STATUS=0

was_running() {
  printf '%s\n' "$RUNNING_SERVICES" | grep -Fxq "$1"
}

restore_service() {
  service=$1
  should_restore=$2
  if [ "$should_restore" -eq 1 ]; then
    if ! docker compose up -d --no-deps --wait --wait-timeout "$RESTORE_WAIT_SECONDS" "$service"; then
      echo "failed to restore original $service service state" >&2
      BACKUP_EXIT_STATUS=1
    fi
  fi
}

finish_backup() {
  BACKUP_EXIT_STATUS=$?
  trap - EXIT INT TERM
  set +e

  if [ -n "$STAGE_DIR" ] && [ -d "$STAGE_DIR" ]; then
    case "$STAGE_DIR" in
      "$BACKUP_DIR"/.student-lottery-backup-*.partial.*) rm -rf -- "$STAGE_DIR" ;;
      *) echo "refusing to remove unexpected staging path: $STAGE_DIR" >&2; BACKUP_EXIT_STATUS=1 ;;
    esac
  fi

  restore_service app "$RESTORE_APP"
  restore_service cleanup "$RESTORE_CLEANUP"
  restore_service proxy "$RESTORE_PROXY"

  rmdir "$LOCK_DIR" 2>/dev/null || BACKUP_EXIT_STATUS=1
  exit "$BACKUP_EXIT_STATUS"
}

trap finish_backup EXIT
trap 'exit 130' INT TERM

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FINAL_DIR="$BACKUP_DIR/student-lottery-backup-$STAMP-$$"
STAGE_DIR=$(mktemp -d "$BACKUP_DIR/.student-lottery-backup-$STAMP-$$.partial.XXXXXX")

RUNNING_SERVICES=$(docker compose ps --status running --services)
if ! was_running db; then
  echo 'database service must be running before backup' >&2
  exit 1
fi
if was_running app; then RESTORE_APP=1; fi
if was_running cleanup; then RESTORE_CLEANUP=1; fi
if was_running proxy; then RESTORE_PROXY=1; fi

if [ "$RESTORE_PROXY" -eq 1 ]; then
  docker compose stop --timeout "$STOP_TIMEOUT_SECONDS" proxy
fi
if [ "$RESTORE_APP" -eq 1 ]; then
  docker compose stop --timeout "$STOP_TIMEOUT_SECONDS" app
fi
if [ "$RESTORE_CLEANUP" -eq 1 ]; then
  docker compose stop --timeout "$STOP_TIMEOUT_SECONDS" cleanup
fi

RUNNING_SERVICES=$(docker compose ps --status running --services)
if was_running app || was_running cleanup; then
  echo 'app and cleanup must be fully stopped before snapshotting' >&2
  exit 1
fi

echo "Creating consistent maintenance backup in $FINAL_DIR"
timeout --foreground --kill-after=5s "${BACKUP_TIMEOUT_SECONDS}s" \
  docker compose exec -T db sh -ec \
  'pg_dump --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "$STAGE_DIR/postgres.sql"

timeout --foreground --kill-after=5s "${BACKUP_TIMEOUT_SECONDS}s" \
  docker compose --profile maintenance run --rm --no-deps -T emblem-backup \
  > "$STAGE_DIR/emblems.tar.gz"

test -s "$STAGE_DIR/postgres.sql"
test -s "$STAGE_DIR/emblems.tar.gz"
tar -tzf "$STAGE_DIR/emblems.tar.gz" > /dev/null

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$STAGE_DIR" && sha256sum postgres.sql emblems.tar.gz > manifest.sha256)
elif command -v shasum >/dev/null 2>&1; then
  (cd "$STAGE_DIR" && shasum -a 256 postgres.sql emblems.tar.gz > manifest.sha256)
else
  echo 'sha256sum or shasum is required to publish a backup' >&2
  exit 1
fi

mv "$STAGE_DIR" "$FINAL_DIR"
STAGE_DIR=''
echo "Backup complete: $FINAL_DIR"
