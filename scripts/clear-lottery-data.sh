#!/bin/sh
set -eu

COMPOSE_FILE_PATH=${COMPOSE_FILE_PATH:-compose.deploy.yml}
BACKUP_DIR=${BACKUP_DIR:-./backups}

compose() {
  docker compose -f "$COMPOSE_FILE_PATH" "$@"
}

if [ ! -f "$COMPOSE_FILE_PATH" ]; then
  echo "compose file not found: $COMPOSE_FILE_PATH" >&2
  echo "run this script from the deployment directory, or set COMPOSE_FILE_PATH" >&2
  exit 1
fi

printf '%s\n' 'This permanently deletes all lottery sessions, rounds, winning records,'
printf '%s\n' 'redemption audit records, and lottery stock events.'
printf '%s\n' 'Prize stock is restored from the lottery stock ledger.'
printf '%s\n' 'Type YES to continue:'
read -r CONFIRM
[ "$CONFIRM" = "YES" ] || { echo 'cancelled'; exit 1; }

mkdir -p "$BACKUP_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_FILE="$BACKUP_DIR/student-lottery-db-before-full-clear-$STAMP.sql"

echo 'stopping app and cleanup services...'
compose stop app cleanup

echo "creating database backup: $BACKUP_FILE"
if ! compose exec -T db sh -ec \
  'pg_dump --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "$BACKUP_FILE"; then
  rm -f "$BACKUP_FILE"
  echo 'database backup failed; app remains stopped' >&2
  exit 1
fi
if [ ! -s "$BACKUP_FILE" ]; then
  rm -f "$BACKUP_FILE"
  echo 'database backup is empty; app remains stopped' >&2
  exit 1
fi

echo 'clearing lottery data and restoring prize stock...'
compose exec -T db sh -ec \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' <<'SQL'
BEGIN;

CREATE TEMP TABLE lottery_stock_events ON COMMIT DROP AS
SELECT id, class_id, prize_id, delta
FROM stock_events
WHERE winning_record_id IS NOT NULL
   OR reason LIKE '抽奖库存预留（场次 %'
   OR reason LIKE '抽奖未用库存退回（场次 %';

WITH stock_delta AS (
  SELECT class_id, prize_id, SUM(delta)::bigint AS delta
  FROM lottery_stock_events
  GROUP BY class_id, prize_id
)
UPDATE prizes AS p
SET stock = p.stock - stock_delta.delta::integer
FROM stock_delta
WHERE p.class_id = stock_delta.class_id
  AND p.id = stock_delta.prize_id;

DELETE FROM stock_events AS se
USING lottery_stock_events AS lse
WHERE se.id = lse.id;

DELETE FROM redemption_audit;

ALTER TABLE winning_records DISABLE TRIGGER protect_winning_record_trigger;
DELETE FROM winning_records;
ALTER TABLE winning_records ENABLE TRIGGER protect_winning_record_trigger;

DELETE FROM lottery_rounds;
DELETE FROM session_prizes;
DELETE FROM session_students;
DELETE FROM lottery_sessions;

COMMIT;

SELECT 'winning_records' AS table_name, count(*)::int AS rows_left
FROM winning_records
UNION ALL
SELECT 'redemption_audit', count(*)::int FROM redemption_audit
UNION ALL
SELECT 'lottery_rounds', count(*)::int FROM lottery_rounds
UNION ALL
SELECT 'session_prizes', count(*)::int FROM session_prizes
UNION ALL
SELECT 'session_students', count(*)::int FROM session_students
UNION ALL
SELECT 'lottery_sessions', count(*)::int FROM lottery_sessions
UNION ALL
SELECT 'lottery_stock_events', count(*)::int
FROM stock_events
WHERE winning_record_id IS NOT NULL
   OR reason LIKE '抽奖库存预留（场次 %'
   OR reason LIKE '抽奖未用库存退回（场次 %';

SELECT tgname,
       CASE tgenabled WHEN 'O' THEN 'enabled' ELSE 'disabled' END AS trigger_state
FROM pg_trigger
WHERE tgrelid = 'winning_records'::regclass
  AND tgname = 'protect_winning_record_trigger';
SQL

echo 'restarting app and cleanup services...'
compose up -d --wait app cleanup
compose ps
echo "cleanup complete; backup: $BACKUP_FILE"
