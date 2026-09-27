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

test('E2E runner rejects a missing database URL before starting Next.js', () => {
  const env = { ...process.env };
  delete env.E2E_DATABASE_URL;
  const result = spawnSync(process.execPath, [resolve(projectRoot, 'tests/e2e/run.mjs')], {
    cwd: projectRoot,
    env,
    encoding: 'utf8',
    timeout: 10_000,
  });

  assert.equal(result.status, 1, result.error?.message ?? result.stderr);
  assert.match(result.stderr, /E2E_DATABASE_URL is required/);
  assert.doesNotMatch(result.stdout, /E2E Next server listening/);
});
