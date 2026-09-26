import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

const isWindows = process.platform === 'win32';
const shell = isWindows ? process.env.TASK14_GIT_BASH ?? 'C:\\Program Files\\Git\\bin\\bash.exe' : '/bin/sh';
const temporaryDirectories: string[] = [];

function shellPath(value: string): string {
  if (!isWindows) return value;
  return execFileSync(shell, ['-c', 'cygpath -u "$1"', 'sh', value], { encoding: 'utf8' }).trim();
}

function runShell(args: string[], env?: NodeJS.ProcessEnv) {
  return spawnSync(shell, args, { encoding: 'utf8', env });
}

function makeHarness(runningServices = 'db app cleanup proxy', extraContainers = '') {
  const root = mkdtempSync(path.join(os.tmpdir(), 'task14-backup-test-'));
  temporaryDirectories.push(root);
  const bin = path.join(root, 'bin');
  const output = path.join(root, 'backups');
  const source = path.join(root, 'emblem-source');
  mkdirSync(bin);
  mkdirSync(source);
  mkdirSync(output);
  writeFileSync(path.join(source, 'emblem.bin'), 'emblem');

  const archive = path.join(root, 'emblems.tar.gz');
  const archiveResult = runShell(['-c', 'tar -czf "$1" -C "$2" .', 'sh', shellPath(archive), shellPath(source)]);
  if (archiveResult.status !== 0) throw new Error(archiveResult.stderr);

  const serviceState = path.join(root, 'running-services');
  const containerState = path.join(root, 'running-containers');
  writeFileSync(serviceState, runningServices ? `${runningServices.split(' ').join('\n')}\n` : '');
  const serviceContainers = runningServices
    .split(' ')
    .filter(Boolean)
    .map((service) => `${service}-container|${service}|false`)
    .join('\n');
  writeFileSync(containerState, [serviceContainers, extraContainers].filter(Boolean).join('\n') + '\n');

  const dockerStub = `#!/usr/bin/env sh
set -eu
printf '%s\\n' "$*" >> "$DOCKER_LOG"
if [ "\${1:-}" = events ]; then
  case " $* " in
    *" --until "*)
      if [ "$DOCKER_EVENT_QUERY_FAIL" = true ]; then
        printf '%s\\n' 'simulated Docker event drain failure' >&2
        exit 44
      fi
      if [ "$DOCKER_DELAY_WRITER_EVENT" = true ]; then
        attempt=0
        while [ ! -f "$EVENT_OBSERVED_FILE" ] && [ "$attempt" -lt 150 ]; do
          sleep 0.02
          attempt=$((attempt + 1))
        done
      fi
      if [ -f "$EVENT_HISTORY_FILE" ]; then cat "$EVENT_HISTORY_FILE"; fi
      exit 0
      ;;
  esac
  while [ ! -f "$EVENT_STOP_FILE" ]; do
    if [ -f "$EVENT_TRIGGER_FILE" ]; then
      if [ "$DOCKER_DELAY_WRITER_EVENT" = true ]; then sleep 0.5; fi
      printf '%s\\n' 'start|cleanup'
      : > "$EVENT_OBSERVED_FILE"
      rm -f "$EVENT_TRIGGER_FILE"
    fi
    sleep 0.02
  done
  exit 0
fi
case "$*" in
  *"compose ps --status running --services"*) cat "$SERVICE_STATE" ;;
  *"compose ps -q db"*) if grep -Fxq db "$SERVICE_STATE"; then printf '%s\\n' db-container; fi ;;
  *"exec -T db date -u +%s"*) printf '%s\\n' 1800000000 ;;
  *"inspect --format"*) printf '%s\\n' task14-test-project ;;
  *"ps --filter label=com.docker.compose.project=task14-test-project"*) cat "$CONTAINER_STATE" ;;
  *" stop "*)
    shift 2
    if [ "\${1:-}" = --timeout ]; then shift 2; fi
    for service in "$@"; do
      grep -Fxv "$service" "$SERVICE_STATE" > "$SERVICE_STATE.tmp" || true
      mv "$SERVICE_STATE.tmp" "$SERVICE_STATE"
      awk -F '|' -v service="$service" '$2 != service || $3 == "true"' "$CONTAINER_STATE" > "$CONTAINER_STATE.tmp"
      mv "$CONTAINER_STATE.tmp" "$CONTAINER_STATE"
    done
    ;;
  *" exec -T db "*)
    if [ "\${DOCKER_FAIL:-}" = pg_dump ]; then exit 31; fi
    printf 'fake-postgres-dump\\n'
    ;;
  *"emblem-backup"*)
    if [ "\${DOCKER_FAIL:-}" = emblem-backup ]; then exit 32; fi
    if [ "\${DOCKER_START_WRITER:-}" = true ]; then
      printf '%s\\n' 'cleanup-oneoff|cleanup|true' >> "$CONTAINER_STATE"
      printf '%s\\n' 'start|cleanup' > "$EVENT_HISTORY_FILE"
      : > "$EVENT_TRIGGER_FILE"
      if [ "$DOCKER_DELAY_WRITER_EVENT" != true ]; then
        attempt=0
        while [ ! -f "$EVENT_OBSERVED_FILE" ] && [ "$attempt" -lt 100 ]; do
          sleep 0.02
          attempt=$((attempt + 1))
        done
      else
        awk -F '|' '$2 != "cleanup" || $1 != "cleanup-oneoff"' "$CONTAINER_STATE" > "$CONTAINER_STATE.tmp"
        mv "$CONTAINER_STATE.tmp" "$CONTAINER_STATE"
      fi
    fi
    cat "$EMBLEM_ARCHIVE"
    ;;
  *" up -d --no-deps --wait "*)
    service=\${*##* }
    if ! grep -Fxq "$service" "$SERVICE_STATE"; then printf '%s\\n' "$service" >> "$SERVICE_STATE"; fi
    if ! awk -F '|' -v service="$service" '$2 == service && $3 != "true" { found=1 } END { exit !found }' "$CONTAINER_STATE"; then
      printf '%s|%s|false\\n' "$service-container" "$service" >> "$CONTAINER_STATE"
    fi
    ;;
  *) printf 'unexpected docker invocation: %s\\n' "$*" >&2; exit 90 ;;
esac
`;
  const dockerPath = path.join(bin, 'docker');
  writeFileSync(dockerPath, dockerStub);
  chmodSync(dockerPath, 0o755);
  if (!isWindows) {
    const timeoutPath = path.join(bin, 'timeout');
    writeFileSync(timeoutPath, '#!/bin/sh\nset -eu\n[ "$1" = --foreground ] && shift\ncase "$1" in --kill-after=*) shift ;; esac\nshift\nexec "$@"\n');
    chmodSync(timeoutPath, 0o755);
  }

  return {
    output,
    containerState,
    log: path.join(root, 'docker.log'),
    env: {
      ...process.env,
      BACKUP_DIR: shellPath(output),
      BACKUP_TIMEOUT_SECONDS: '30',
      CONTAINER_STATE: shellPath(containerState),
      DOCKER_LOG: shellPath(path.join(root, 'docker.log')),
      DOCKER_DELAY_WRITER_EVENT: 'false',
      DOCKER_EVENT_QUERY_FAIL: 'false',
      EMBLEM_ARCHIVE: shellPath(archive),
      EVENT_OBSERVED_FILE: shellPath(path.join(root, 'event-observed')),
      EVENT_HISTORY_FILE: shellPath(path.join(root, 'event-history')),
      EVENT_STOP_FILE: shellPath(path.join(root, 'event-stop')),
      EVENT_TRIGGER_FILE: shellPath(path.join(root, 'event-trigger')),
      PATH: `${shellPath(bin)}:/usr/bin:/bin`,
      SERVICE_STATE: shellPath(serviceState),
    },
  };
}

function runBackup(harness: ReturnType<typeof makeHarness>, overrides: Record<string, string> = {}) {
  return runShell(['-c', 'sh scripts/backup.sh'], { ...harness.env, ...overrides });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('backup.sh maintenance snapshot', () => {
  test('stops writers, uses the read-only volume helper, atomically publishes a complete set and restores prior services', () => {
    const harness = makeHarness('db app cleanup proxy');

    const result = runBackup(harness);

    expect(result.status, result.stderr).toBe(0);
    const names = readdirSync(harness.output);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^student-lottery-backup-/);
    const files = readdirSync(path.join(harness.output, names[0])).sort();
    expect(files).toEqual(['emblems.tar.gz', 'manifest.sha256', 'postgres.sql']);
    const compose = readFileSync('compose.yml', 'utf8');
    expect(compose).toMatch(/emblem-backup:[\s\S]*?profiles: \["maintenance"\][\s\S]*?emblem-data:\/emblems:ro/);
    const calls = readFileSync(harness.log, 'utf8').trim().split(/\r?\n/);
    const proxyStop = calls.findIndex((line) => line.includes('stop') && line.endsWith(' proxy'));
    const appStop = calls.findIndex((line) => line.includes('stop') && line.endsWith(' app'));
    const cleanupStop = calls.findIndex((line) => line.includes('stop') && line.endsWith(' cleanup'));
    const databaseDump = calls.findIndex((line) => line.includes('pg_dump --clean'));
    const emblemDump = calls.findIndex((line) => line.includes('emblem-backup'));
    const appRestore = calls.findIndex((line) => line.includes('up -d --no-deps --wait --wait-timeout') && line.endsWith(' app'));
    const proxyRestore = calls.findIndex((line) => line.includes('up -d --no-deps --wait --wait-timeout') && line.endsWith(' proxy'));
    expect(proxyStop).toBeGreaterThanOrEqual(0);
    expect(appStop).toBeGreaterThan(proxyStop);
    expect(cleanupStop).toBeGreaterThan(appStop);
    expect(databaseDump).toBeGreaterThan(cleanupStop);
    expect(emblemDump).toBeGreaterThan(databaseDump);
    expect(appRestore).toBeGreaterThan(emblemDump);
    expect(proxyRestore).toBeGreaterThan(appRestore);
    const eventDrain = calls.findIndex((line) => line.startsWith('events --since ') && line.includes(' --until '));
    const projectWriterChecks = calls
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.startsWith('ps --filter label=com.docker.compose.project='));
    expect(calls.some((line) => line.startsWith('events --since ') && !line.includes(' --until '))).toBe(true);
    expect(eventDrain).toBeGreaterThanOrEqual(0);
    expect(projectWriterChecks.at(-1)?.index).toBeGreaterThan(eventDrain);
  });

  test('removes the incomplete staging set and restores prior services when volume backup fails', () => {
    const harness = makeHarness();

    const result = runBackup(harness, { DOCKER_FAIL: 'emblem-backup' });

    expect(result.status).not.toBe(0);
    expect(readdirSync(harness.output)).toEqual([]);
    const calls = readFileSync(harness.log, 'utf8');
    expect(calls).toContain('up -d --no-deps --wait --wait-timeout 120 app');
    expect(calls).toContain('up -d --no-deps --wait --wait-timeout 120 cleanup');
    expect(calls).toContain('up -d --no-deps --wait --wait-timeout 120 proxy');
  });

  test('refuses to snapshot without a running database and removes its lock and staging directory', () => {
    const harness = makeHarness('app cleanup proxy');

    const result = runBackup(harness);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('database service must be running');
    expect(readdirSync(harness.output)).toEqual([]);
  });

  test('rejects a running one-off writer without stopping or removing that container', () => {
    const harness = makeHarness('db app cleanup proxy', 'cleanup-oneoff-1|cleanup|true');

    const result = runBackup(harness);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('one-off cleanup container');
    expect(readdirSync(harness.output)).toEqual([]);
    expect(readFileSync(harness.log, 'utf8')).not.toContain(' stop ');
    expect(readFileSync(harness.containerState, 'utf8')).toContain('cleanup-oneoff-1|cleanup|true');
  });

  test('invalidates a snapshot if a project writer starts during volume export', () => {
    const harness = makeHarness();

    const result = runBackup(harness, { DOCKER_START_WRITER: 'true' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('writer container started during snapshot');
    expect(readdirSync(harness.output)).toEqual([]);
    expect(readFileSync(harness.containerState, 'utf8')).toContain('cleanup-oneoff|cleanup|true');
    const calls = readFileSync(harness.log, 'utf8');
    expect(calls).toContain('up -d --no-deps --wait --wait-timeout 120 app');
    expect(calls).toContain('up -d --no-deps --wait --wait-timeout 120 cleanup');
    expect(calls).toContain('up -d --no-deps --wait --wait-timeout 120 proxy');
  });

  test('drains a delayed writer-start event before publishing the snapshot', () => {
    const harness = makeHarness();

    const result = runBackup(harness, {
      DOCKER_START_WRITER: 'true',
      DOCKER_DELAY_WRITER_EVENT: 'true',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('writer container started during snapshot');
    expect(readdirSync(harness.output)).toEqual([]);
    const calls = readFileSync(harness.log, 'utf8');
    expect(calls).toContain('up -d --no-deps --wait --wait-timeout 120 app');
    expect(calls).toContain('up -d --no-deps --wait --wait-timeout 120 cleanup');
    expect(calls).toContain('events --since ');
    expect(calls).toMatch(/events --since .* --until /);
  });

  test('refuses to publish when the bounded Docker event drain fails', () => {
    const harness = makeHarness();

    const result = runBackup(harness, { DOCKER_EVENT_QUERY_FAIL: 'true' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('event drain failure');
    expect(readdirSync(harness.output)).toEqual([]);
  });
});
