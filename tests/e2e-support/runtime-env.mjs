import { randomBytes } from 'node:crypto';

const allowedHosts = new Set(['127.0.0.1', 'localhost']);

export function validateE2EDatabaseUrl(value = process.env.E2E_DATABASE_URL) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('E2E_DATABASE_URL is required; provide credentials for the dedicated PostgreSQL database at 127.0.0.1:55433/lottery_e2e.');
  }

  let databaseUrl;
  try {
    databaseUrl = new URL(value);
  } catch {
    throw new Error('E2E_DATABASE_URL must be a valid PostgreSQL connection URL for the dedicated local E2E database.');
  }

  if (
    !['postgres:', 'postgresql:'].includes(databaseUrl.protocol)
    || !allowedHosts.has(databaseUrl.hostname.toLowerCase())
    || databaseUrl.port !== '55433'
    || databaseUrl.pathname !== '/lottery_e2e'
    || databaseUrl.username.length === 0
    || databaseUrl.password.length === 0
    || databaseUrl.search.length > 0
    || databaseUrl.hash.length > 0
  ) {
    throw new Error('Refusing E2E_DATABASE_URL: it must target only localhost:55433/lottery_e2e with PostgreSQL credentials and no query or fragment.');
  }

  return value;
}

export function createRuntimeSecret() {
  return randomBytes(32).toString('base64url');
}

export function createFixturePassword() {
  const entropy = randomBytes(32);
  const uppercase = String.fromCharCode(65 + (entropy[0] % 26));
  const lowercase = String.fromCharCode(97 + (entropy[1] % 26));
  const digit = String.fromCharCode(48 + (entropy[2] % 10));
  const punctuation = ['!', '@', '#', '$', '%', '^', '&', '*'][entropy[3] % 8];
  return `${uppercase}${lowercase}${digit}${punctuation}${entropy.subarray(4).toString('base64url')}`;
}
