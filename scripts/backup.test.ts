import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

const bash = 'C:\\Program Files\\Git\\bin\\bash.exe';
const temporaryDirectories: string[] = [];

function bashPath(value: string): string {
  return execFileSync(bash, ['-lc', 'cygpath -u "$1"', '--', value], { encoding: 'utf8' }).trim();
}

function makeHarness(runningServices = 'db app cleanup proxy') {
  const root = mkdtempSync(path.join(os.tmpdir(), 'task14-backup-test-'));
  temporaryDirectories.push(root);
  const bin = path.join(root, 'bin');
  const output = path.join(root, 'backups');
  const source = path.join(root, 'emblem-source');
  mkdirSync(bin);
  mkdirSync(source);
  mkdirSync(output);
  writeFileSync(path.join(source, 'emblem.bin'), 'emblem');

  const posixSource = bashPath(source);
  const archive = path.join(root, 'emblems.tar.gz');
  execFileSync(bash, ['-lc', 'tar -czf "$1" -C "$2" .', '--', bashPath(archive), posixSource]);
  const serviceState = path.join(root, 'running-services');
  writeFileSync(serviceState, runningServices.split(' ').join('\n') + '\n');

  const dockerStub = `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >> "$DOCKER_LOG"
case " $* " in
  *" ps --status running --services "*) cat "$SERVICE_STATE" ;;
  *" stop "*)
    shift 2
    if [[ "$1" == "--timeout" ]]; then shift 2; fi
    for service in "$@"; do
      grep -Fxv "$service" "$SERVICE_STATE" > "$SERVICE_STATE.tmp" || true
      mv "$SERVICE_STATE.tmp" "$SERVICE_STATE"
    done
    ;;
  *" exec -T db "*)
    if [[ "${'${'}DOCKER_FAIL:-}" == "pg_dump" ]]; then exit 31; fi
    printf 'fake-postgres-dump\\n'
    ;;
  *" emblem-backup "*)
    if [[ "${'${'}DOCKER_FAIL:-}" == "emblem-backup" ]]; then exit 32; fi
    cat "$EMBLEM_ARCHIVE"
    ;;
  *" up -d --no-deps --wait "*)
    service="${'${'}@: -1}"
    if ! grep -Fxq "$service" "$SERVICE_STATE"; then printf '%s\\n' "$service" >> "$SERVICE_STATE"; fi
    ;;
  *) printf 'unexpected docker invocation: %s\\n' "$*" >&2; exit 90 ;;
esac
`;
  const dockerPath = path.join(bin, 'docker');
  writeFileSync(dockerPath, dockerStub);
  chmodSync(dockerPath, 0o755);

  return {
    root,
    output,
    log: path.join(root, 'docker.log'),
    env: {
      ...process.env,
      BACKUP_DIR: bashPath(output),
      BACKUP_TIMEOUT_SECONDS: '30',
      DOCKER_LOG: bashPath(path.join(root, 'docker.log')),
      EMBLEM_ARCHIVE: bashPath(archive),
      PATH: `${bashPath(bin)}:/usr/bin:/bin`,
      RUNNING_SERVICES: runningServices,
      SERVICE_STATE: bashPath(serviceState),
    },
  };
}

function runBackup(harness: ReturnType<typeof makeHarness>, overrides: Record<string, string> = {}) {
  return spawnSync(bash, ['-lc', './scripts/backup.sh'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...harness.env, ...overrides },
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('backup.sh maintenance snapshot', () => {
  test('stops writers, uses the read-only volume helper, atomically publishes a complete set and restores prior services', () => {
    const harness = makeHarness('db app proxy');

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
    const databaseDump = calls.findIndex((line) => line.includes('exec -T db'));
    const emblemDump = calls.findIndex((line) => line.includes('emblem-backup'));
    const appRestore = calls.findIndex((line) => line.includes('up -d --no-deps --wait --wait-timeout') && line.endsWith(' app'));
    const proxyRestore = calls.findIndex((line) => line.includes('up -d --no-deps --wait --wait-timeout') && line.endsWith(' proxy'));
    expect(proxyStop).toBeGreaterThanOrEqual(0);
    expect(appStop).toBeGreaterThan(proxyStop);
    expect(databaseDump).toBeGreaterThan(appStop);
    expect(emblemDump).toBeGreaterThan(databaseDump);
    expect(appRestore).toBeGreaterThan(emblemDump);
    expect(proxyRestore).toBeGreaterThan(appRestore);
    expect(calls.some((line) => line.endsWith(' cleanup'))).toBe(false);
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
    expect(readFileSync(harness.log, 'utf8').trim().split(/\r?\n/)).toEqual([
      'compose ps --status running --services',
    ]);
  });
});
