import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const runtimeModule = resolve(projectRoot, 'tests/e2e-support/runtime-env.mjs');

test('E2E runtime requires the dedicated database and creates ephemeral secrets', async () => {
  assert.ok(existsSync(runtimeModule), 'shared E2E runtime environment guard is missing');
  const { validateE2EDatabaseUrl, createRuntimeSecret, createFixturePassword } = await import(pathToFileURL(runtimeModule));

  assert.throws(() => validateE2EDatabaseUrl(), /E2E_DATABASE_URL is required/);
  assert.throws(() => validateE2EDatabaseUrl(undefined, 'E2E_DATABASE_ADMIN_URL'), /E2E_DATABASE_ADMIN_URL is required/);
  for (const validUrl of [
    'postgres://demo:placeholder@127.0.0.1:55433/lottery_e2e',
    'postgresql://demo:placeholder@localhost:55433/lottery_e2e',
  ]) {
    assert.equal(validateE2EDatabaseUrl(validUrl), validUrl);
  }
  for (const unsafeUrl of [
    'postgres://demo:placeholder@db.example.test:55433/lottery_e2e',
    'postgres://demo:placeholder@127.0.0.1:5432/lottery_e2e',
    'postgres://demo:placeholder@127.0.0.1:55433/postgres',
    'postgres://demo:placeholder@127.0.0.1:55433/lottery_e2e?sslmode=disable',
  ]) {
    assert.throws(() => validateE2EDatabaseUrl(unsafeUrl));
  }

  const secrets = Array.from({ length: 4 }, createRuntimeSecret);
  const passwords = Array.from({ length: 4 }, createFixturePassword);
  assert.ok(secrets.every((secret) => secret.length >= 32));
  assert.ok(passwords.every((password) => password.length >= 16));
  assert.equal(new Set(secrets).size, secrets.length);
  assert.equal(new Set(passwords).size, passwords.length);
});

test('E2E runtime accepts only a marked database and a non-owner restricted role', async () => {
  const { validateE2EDatabaseIdentity } = await import(pathToFileURL(runtimeModule));
  const validIdentity = {
    database: 'lottery_e2e',
    marker: 'student-lottery-e2e:v1',
    user: 'lottery_e2e_runner',
    tableOwner: 'lottery_e2e_owner',
    databaseOwner: 'lottery_e2e_owner',
    hasTableOwnerRole: false,
    hasDatabaseOwnerRole: false,
    superuser: false,
    createDatabase: false,
    createRole: false,
    replication: false,
    bypassRls: false,
    canUseSchema: true,
    canCreateInSchema: false,
    canWriteWinningRecords: true,
    canTruncateWinningRecords: false,
    canManageWinningRecordTriggers: false,
  };

  assert.equal(validateE2EDatabaseIdentity(validIdentity), true);
  for (const invalidIdentity of [
    { ...validIdentity, marker: null },
    { ...validIdentity, database: 'postgres' },
    { ...validIdentity, superuser: true },
    { ...validIdentity, createDatabase: true },
    { ...validIdentity, createRole: true },
    { ...validIdentity, replication: true },
    { ...validIdentity, bypassRls: true },
    { ...validIdentity, tableOwner: validIdentity.user },
    { ...validIdentity, databaseOwner: validIdentity.user },
    { ...validIdentity, hasTableOwnerRole: true },
    { ...validIdentity, hasDatabaseOwnerRole: true },
    { ...validIdentity, canUseSchema: false },
    { ...validIdentity, canCreateInSchema: true },
    { ...validIdentity, canWriteWinningRecords: false },
    { ...validIdentity, canTruncateWinningRecords: true },
    { ...validIdentity, canManageWinningRecordTriggers: true },
  ]) {
    assert.throws(() => validateE2EDatabaseIdentity(invalidIdentity));
  }
});

test('E2E runner reports the Chromium installation command before starting the app', async () => {
  const { assertChromiumInstalled } = await import(pathToFileURL(runtimeModule));
  const runner = await readFile(resolve(projectRoot, 'tests/e2e/run.mjs'), 'utf8');
  const readme = await readFile(resolve(projectRoot, 'README.md'), 'utf8');

  assert.equal(assertChromiumInstalled('chromium.exe', () => true), true);
  assert.throws(
    () => assertChromiumInstalled('missing-chromium.exe', () => false),
    /npx playwright install chromium/,
  );
  const server = await readFile(resolve(projectRoot, 'tests/e2e/server.mjs'), 'utf8');
  assert.match(runner, /assertChromiumInstalled\(chromium\.executablePath\(\)\)/);
  assert.ok(runner.indexOf('assertChromiumInstalled') < runner.indexOf("tests/e2e/server.mjs"));
  assert.ok(runner.indexOf('await stopE2EServer(appServer)') < runner.indexOf('await removeE2ERunDatabase(process.env'));
  assert.match(server, /await app\.prepare\(\)/);
  assert.match(server, /type: 'ready'/);
  assert.match(readme, /npx playwright install chromium/);
});

test('fixture cleanup never disables the winning-record protection trigger', async () => {
  const fixtures = await readFile(resolve(projectRoot, 'tests/e2e/fixtures.ts'), 'utf8');
  assert.doesNotMatch(fixtures, /ALTER\s+TABLE\s+winning_records\s+DISABLE\s+TRIGGER/i);
  assert.doesNotMatch(fixtures, /ALTER\s+TABLE\s+winning_records\s+ENABLE\s+TRIGGER/i);
});

test('E2E entrypoint and sources do not embed database or account credentials', async () => {
  const packageJson = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['test:e2e'], 'node tests/e2e/run.mjs');

  const sources = await Promise.all([
    'playwright.config.ts',
    'tests/e2e/run.mjs',
    'tests/e2e/fixtures.ts',
    'tests/e2e/admin-and-import.spec.ts',
    'README.md',
    '.superpowers/sdd/2026-09-25-student-lottery-system/task-15-report.md',
  ].map((path) => readFile(resolve(projectRoot, path), 'utf8')));
  const source = sources.join('\n');

  assert.doesNotMatch(source, /postgres(?:ql)?:\/\/[^\s/'"`]+:[^\s@/'"`]+@(?:127\.0\.0\.1|localhost):55433\/lottery_e2e/i);
  assert.doesNotMatch(source, /BETTER_AUTH_SECRET\s*=\s*['"`]/);
  assert.doesNotMatch(source, /\b(?:temporaryPassword|permanentPassword|changedPassword)\s*=\s*['"`]/i);
});

test('E2E runner rejects a missing provisioning URL before starting Next.js', () => {
  const env = { ...process.env };
  delete env.E2E_DATABASE_URL;
  delete env.E2E_DATABASE_ADMIN_URL;
  const result = spawnSync(process.execPath, [resolve(projectRoot, 'tests/e2e/run.mjs')], {
    cwd: projectRoot,
    env,
    encoding: 'utf8',
    timeout: 10_000,
  });

  assert.equal(result.status, 1, result.error?.message ?? result.stderr);
  assert.match(result.stderr, /E2E_DATABASE_ADMIN_URL is required/);
  assert.doesNotMatch(result.stdout, /E2E Next server listening/);
});
