import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import pg from 'pg';

const allowedHosts = new Set(['127.0.0.1', 'localhost']);
const databaseMarker = 'student-lottery-e2e:v1';
const inheritedChildEnvironmentKeys = [
  'PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA',
  'LOCALAPPDATA', 'HOMEDRIVE', 'HOMEPATH', 'ProgramData', 'COMSPEC', 'PATHEXT',
];
const runtimeChildEnvironmentKeys = [
  'DATABASE_URL', 'E2E_RUN_DATABASE_URL', 'E2E_RUN_DATABASE_NAME',
  'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'EMBLEM_DIR', 'CIRCLE_NODE_TOTAL',
];

export function createE2EChildEnvironment(parentEnvironment, runtimeEnvironment) {
  const childEnvironment = {};
  for (const key of inheritedChildEnvironmentKeys) {
    if (typeof parentEnvironment[key] === 'string') childEnvironment[key] = parentEnvironment[key];
  }
  for (const key of runtimeChildEnvironmentKeys) {
    if (typeof runtimeEnvironment[key] === 'string') childEnvironment[key] = runtimeEnvironment[key];
  }
  return childEnvironment;
}

export function validateE2EDatabaseUrl(value = process.env.E2E_DATABASE_URL, variableName = 'E2E_DATABASE_URL') {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${variableName} is required; provide credentials for the dedicated PostgreSQL database at 127.0.0.1:55433/lottery_e2e.`);
  }

  let databaseUrl;
  try {
    databaseUrl = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL connection URL for the dedicated local E2E database.`);
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
    throw new Error(`Refusing ${variableName}: it must target only localhost:55433/lottery_e2e with PostgreSQL credentials and no query or fragment.`);
  }

  return value;
}

export function validateE2EDatabaseIdentity(identity, expectedDatabase = 'lottery_e2e', expectedMarker = databaseMarker) {
  if (
    identity?.database !== expectedDatabase
    || identity.marker !== expectedMarker
    || !identity.user
    || identity.user === identity.tableOwner
    || identity.user === identity.databaseOwner
    || identity.hasTableOwnerRole
    || identity.hasDatabaseOwnerRole
    || identity.superuser
    || identity.createDatabase
    || identity.createRole
    || identity.replication
    || identity.bypassRls
    || !identity.canUseSchema
    || identity.canCreateInSchema
    || !identity.canWriteWinningRecords
    || identity.canTruncateWinningRecords
    || identity.canManageWinningRecordTriggers
  ) {
    throw new Error('Refusing E2E database: expected the marked invocation database and a non-owner, non-privileged runner role with fixture DML access.');
  }

  return true;
}

export async function verifyE2EDatabaseIdentity(value = process.env.E2E_DATABASE_URL) {
  const connectionString = validateE2EDatabaseUrl(value);
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });

  try {
    await client.connect();
    const { rows } = await client.query(`
      select current_database() as database,
        current_user as "user",
        (select shobj_description(oid, 'pg_database')
          from pg_database where datname = current_database()) as marker,
        pg_get_userbyid(database.datdba) as "databaseOwner",
        role.rolsuper as "superuser",
        role.rolcreatedb as "createDatabase",
        role.rolcreaterole as "createRole",
        role.rolreplication as replication,
        role.rolbypassrls as "bypassRls",
        pg_get_userbyid(relation.relowner) as "tableOwner",
        pg_has_role(current_user, relation.relowner, 'MEMBER') as "hasTableOwnerRole",
        pg_has_role(current_user, database.datdba, 'MEMBER') as "hasDatabaseOwnerRole",
        has_schema_privilege(current_user, 'public', 'USAGE') as "canUseSchema",
        has_schema_privilege(current_user, 'public', 'CREATE') as "canCreateInSchema",
        has_table_privilege(current_user, 'public.winning_records', 'SELECT,INSERT,UPDATE,DELETE') as "canWriteWinningRecords",
        has_table_privilege(current_user, 'public.winning_records', 'TRUNCATE') as "canTruncateWinningRecords",
        has_table_privilege(current_user, 'public.winning_records', 'TRIGGER') as "canManageWinningRecordTriggers"
      from pg_roles as role
      join pg_database as database on database.datname = current_database()
      join pg_class as relation on relation.oid = to_regclass('public.winning_records')
      where role.rolname = current_user
    `);

    if (rows.length !== 1) {
      throw new Error('required E2E schema is missing');
    }
    validateE2EDatabaseIdentity(rows[0]);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Refusing E2E database:')) throw error;
    throw new Error('Could not verify the marked E2E database and restricted runner role. Confirm the database marker, schema, and grants.');
  } finally {
    await client.end().catch(() => {});
  }

  return connectionString;
}

export function assertChromiumInstalled(executablePath, exists = existsSync) {
  if (!exists(executablePath)) {
    throw new Error('Playwright Chromium is not installed. Run `npx playwright install chromium` before `npm run test:e2e`.');
  }

  return true;
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
