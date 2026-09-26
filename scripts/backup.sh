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
EVENT_WATCH_PID=''
EVENT_LOG=''
EVENT_ERROR_LOG=''

was_running() {
  printf '%s\n' "$RUNNING_SERVICES" | grep -Fxq "$1"
}

stop_event_watch() {
  if [ -n "$EVENT_WATCH_PID" ]; then
    kill "$EVENT_WATCH_PID" 2>/dev/null || true
    wait "$EVENT_WATCH_PID" 2>/dev/null || true
    EVENT_WATCH_PID=''
  fi
}

project_writer_containers() {
  containers=$(docker ps \
    --filter "label=com.docker.compose.project=$PROJECT_NAME" \
    --filter status=running \
    --format '{{.ID}}|{{.Label "com.docker.compose.service"}}|{{.Label "com.docker.compose.oneoff"}}')
  printf '%s\n' "$containers" | awk -F '|' '$2 == "app" || $2 == "cleanup"'
}

validate_initial_writers() {
  rows=$(project_writer_containers)
  while IFS='|' read -r container_id service oneoff; do
    [ -n "$container_id" ] || continue
    case "$oneoff" in
      true|True|TRUE)
        echo "refusing backup: running one-off $service container $container_id must be stopped and verified by the operator" >&2
        return 1
        ;;
      false|False|FALSE) ;;
      *)
        echo "refusing backup: cannot verify writer container type for $service container $container_id" >&2
        return 1
        ;;
    esac
    if ! was_running "$service"; then
      echo "refusing backup: unexpected running project $service container $container_id" >&2
      return 1
    fi
  done <<EOF
$rows
EOF
}

start_event_watch() {
  EVENT_LOG="$STAGE_DIR/writer-start-events.log"
  EVENT_ERROR_LOG="$STAGE_DIR/docker-events.err"
  docker events --since "$WATCH_SINCE" \
    --filter type=container \
    --filter "label=com.docker.compose.project=$PROJECT_NAME" \
    --filter event=start \
    --format '{{.Action}}|{{index .Actor.Attributes "com.docker.compose.service"}}' \
    > "$EVENT_LOG" 2> "$EVENT_ERROR_LOG" &
  EVENT_WATCH_PID=$!
}

assert_no_writer_starts() {
  if ! kill -0 "$EVENT_WATCH_PID" 2>/dev/null; then
    echo 'Docker writer-start event monitor stopped during the snapshot' >&2
    wait "$EVENT_WATCH_PID" 2>/dev/null || true
    EVENT_WATCH_PID=''
    if [ -s "$EVENT_ERROR_LOG" ]; then cat "$EVENT_ERROR_LOG" >&2; fi
    return 1
  fi

  stop_event_watch
  writer_starts=$(awk -F '|' '$2 == "app" || $2 == "cleanup" { print }' "$EVENT_LOG")
  if [ -n "$writer_starts" ]; then
    echo 'writer container started during snapshot; refusing to publish this backup' >&2
    printf '%s\n' "$writer_starts" >&2
    return 1
  fi
  if [ -s "$EVENT_ERROR_LOG" ]; then
    echo 'Docker writer-start event monitor reported an error; refusing to publish this backup' >&2
    cat "$EVENT_ERROR_LOG" >&2
    return 1
  fi
  rm -f -- "$EVENT_LOG" "$EVENT_ERROR_LOG"
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

  stop_event_watch

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

DB_CONTAINER=$(docker compose ps -q db)
if [ -z "$DB_CONTAINER" ]; then
  echo 'database container could not be identified for project-scoped writer checks' >&2
  exit 1
fi
PROJECT_NAME=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$DB_CONTAINER")
if [ -z "$PROJECT_NAME" ]; then
  echo 'database container has no Compose project label; refusing an unscoped backup' >&2
  exit 1
fi

WATCH_SINCE=$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)
validate_initial_writers
if was_running app; then RESTORE_APP=1; fi
if was_running cleanup; then RESTORE_CLEANUP=1; fi
if was_running proxy; then RESTORE_PROXY=1; fi

start_event_watch

if [ "$RESTORE_PROXY" -eq 1 ]; then
  docker compose stop --timeout "$STOP_TIMEOUT_SECONDS" proxy
fi
if [ "$RESTORE_APP" -eq 1 ]; then
  docker compose stop --timeout "$STOP_TIMEOUT_SECONDS" app
fi
if [ "$RESTORE_CLEANUP" -eq 1 ]; then
  docker compose stop --timeout "$STOP_TIMEOUT_SECONDS" cleanup
fi

WRITER_CONTAINERS=$(project_writer_containers)
if [ -n "$WRITER_CONTAINERS" ]; then
  echo 'app and cleanup writer containers must be fully stopped before snapshotting' >&2
  printf '%s\n' "$WRITER_CONTAINERS" >&2
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
assert_no_writer_starts

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
