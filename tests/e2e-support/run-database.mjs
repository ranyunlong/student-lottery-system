import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';
import {
  validateE2EDatabaseIdentity,
  validateE2EDatabaseUrl,
} from './runtime-env.mjs';

const baseMarker = 'student-lottery-e2e:v1';
const runPrefix = 'lottery_e2e_run_';
const rolePrefix = 'lottery_e2e_app_';

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function assertRunIdentity(run) {
  if (
    !run
    || !/^lottery_e2e_run_[a-f0-9]{32}$/.test(run.database)
    || !/^lottery_e2e_app_[a-f0-9]{32}$/.test(run.role)
    || run.role !== `${rolePrefix}${run.database.slice(runPrefix.length)}`
    || run.marker !== `student-lottery-e2e-run:v1:${run.database.slice(runPrefix.length)}`
    || run.roleMarker !== `student-lottery-e2e-role:v1:${run.database.slice(runPrefix.length)}`
  ) {
    throw new Error('Refusing E2E database cleanup: run database identity is not invocation-owned.');
  }
}

async function withAdmin(url, operation) {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

export async function verifyE2EBaseDatabase(value = process.env.E2E_DATABASE_ADMIN_URL) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('E2E_DATABASE_ADMIN_URL is required; provide a process-scoped provisioning URL for the marked local PostgreSQL 17 E2E database.');
  }
  const connectionString = validateE2EDatabaseUrl(value, 'E2E_DATABASE_ADMIN_URL');
  await withAdmin(connectionString, async (client) => {
    const { rows } = await client.query(`
      select current_database() as database,
        (select shobj_description(oid, 'pg_database') from pg_database where datname = current_database()) as marker,
        role.rolsuper as superuser,
        role.rolcreatedb as createdb,
        role.rolcreaterole as createrole,
        pg_has_role(current_user, 'pg_signal_backend', 'MEMBER') as "canSignalBackends"
      from pg_roles as role where role.rolname = current_user
    `);
    const [identity] = rows;
    if (
      rows.length !== 1
      || identity.database !== 'lottery_e2e'
      || identity.marker !== baseMarker
      || !(identity.superuser || (identity.createdb && identity.createrole && identity.canSignalBackends))
    ) {
      throw new Error('Refusing E2E provisioning: expected the marked lottery_e2e database and a local database provisioning role.');
    }
  });
  return connectionString;
}

export async function verifyE2ERunDatabase(run) {
  assertRunIdentity(run);
  const databaseUrl = run.databaseUrl;
  const target = new URL(databaseUrl);
  if (
    !['postgres:', 'postgresql:'].includes(target.protocol)
    || !['127.0.0.1', 'localhost'].includes(target.hostname.toLowerCase())
    || target.port !== '55433'
    || target.pathname !== `/${run.database}`
    || decodeURIComponent(target.username) !== run.role
    || !target.username
    || !target.password
    || target.search
    || target.hash
  ) {
    throw new Error('Refusing E2E runtime URL: it must target only this invocation’s loopback PostgreSQL 17 database.');
  }

  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const { rows } = await client.query(`
      select current_database() as database,
        current_user as "user",
        (select shobj_description(oid, 'pg_database') from pg_database where datname = current_database()) as marker,
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
    if (rows.length !== 1 || rows[0].user !== run.role) throw new Error('required E2E schema or role is missing');
    validateE2EDatabaseIdentity(rows[0], run.database, run.marker);

    const { rows: triggerRows } = await client.query(`
      select tgenabled from pg_trigger
      where tgrelid = 'public.winning_records'::regclass
        and tgname = 'protect_winning_record_trigger'
    `);
    if (triggerRows.length !== 1 || triggerRows[0].tgenabled !== 'O') {
      throw new Error('Refusing E2E runtime: the winning-record protection trigger is not enabled.');
    }
  } catch {
    throw new Error('Could not verify the invocation-owned E2E database and restricted app role.');
  } finally {
    await client.end().catch(() => {});
  }
  return databaseUrl;
}

export async function createE2ERunDatabase(value = process.env.E2E_DATABASE_ADMIN_URL) {
  const adminUrl = await verifyE2EBaseDatabase(value);
  const suffix = randomUUID().replaceAll('-', '');
  const run = {
    database: `${runPrefix}${suffix}`,
    role: `${rolePrefix}${suffix}`,
    marker: `student-lottery-e2e-run:v1:${suffix}`,
    roleMarker: `student-lottery-e2e-role:v1:${suffix}`,
  };
  const password = randomBytes(32).toString('base64url');
  let databaseCreated = false;
  let roleCreated = false;

  try {
    await withAdmin(adminUrl, async (client) => {
      await client.query(`CREATE DATABASE ${quoteIdentifier(run.database)} TEMPLATE template0`);
      databaseCreated = true;
      await client.query(`COMMENT ON DATABASE ${quoteIdentifier(run.database)} IS '${run.marker}'`);
      await client.query(`CREATE ROLE ${quoteIdentifier(run.role)} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 80 PASSWORD '${password}'`);
      roleCreated = true;
      await client.query(`COMMENT ON ROLE ${quoteIdentifier(run.role)} IS '${run.roleMarker}'`);
    });

    const adminRunUrl = new URL(adminUrl);
    adminRunUrl.pathname = `/${run.database}`;
    const pool = new pg.Pool({ connectionString: adminRunUrl.toString(), max: 2, connectionTimeoutMillis: 5000 });
    try {
      await migrate(drizzle(pool), { migrationsFolder: resolve('drizzle') });
      await pool.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
      await pool.query(`GRANT CONNECT ON DATABASE ${quoteIdentifier(run.database)} TO ${quoteIdentifier(run.role)}`);
      await pool.query(`GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(run.role)}`);
      await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${quoteIdentifier(run.role)}`);
      await pool.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${quoteIdentifier(run.role)}`);
      const trigger = await pool.query(`
        select tgenabled from pg_trigger
        where tgrelid = 'public.winning_records'::regclass
          and tgname = 'protect_winning_record_trigger'
      `);
      if (trigger.rowCount !== 1 || trigger.rows[0].tgenabled !== 'O') {
        throw new Error('Migration did not install the enabled winning-record protection trigger.');
      }
    } finally {
      await pool.end();
    }

    const runtimeUrl = new URL(adminUrl);
    runtimeUrl.pathname = `/${run.database}`;
    runtimeUrl.username = run.role;
    runtimeUrl.password = password;
    run.databaseUrl = runtimeUrl.toString();
    await verifyE2ERunDatabase(run);
    return run;
  } catch {
    if (databaseCreated || roleCreated) {
      try {
        await removeE2ERunDatabase(adminUrl, run, { databaseCreated, roleCreated });
      } catch {
        throw new Error('E2E database setup failed and its invocation-owned temporary objects could not be cleaned up.');
      }
    }
    throw new Error('E2E run database setup failed; credentials and connection details were withheld.');
  }
}

export async function removeE2ERunDatabase(value, run, created = { databaseCreated: true, roleCreated: true }) {
  assertRunIdentity(run);
  const adminUrl = validateE2EDatabaseUrl(value, 'E2E_DATABASE_ADMIN_URL');
  await withAdmin(adminUrl, async (client) => {
    if (created.databaseCreated) {
      const { rows } = await client.query("select shobj_description(oid, 'pg_database') as marker from pg_database where datname = $1", [run.database]);
      if (rows.length > 0) {
        if (rows[0].marker !== run.marker) throw new Error('Refusing to drop a database without this run’s identity marker.');
        await client.query('select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()', [run.database]);
        await client.query(`DROP DATABASE ${quoteIdentifier(run.database)}`);
      }
    }

    if (created.roleCreated) {
      const { rows } = await client.query(`
        select shobj_description(oid, 'pg_authid') as marker
        from pg_roles where rolname = $1
      `, [run.role]);
      if (rows.length > 0) {
        if (rows[0].marker !== run.roleMarker) throw new Error('Refusing to drop a role without this run’s identity marker.');
        await client.query(`DROP ROLE ${quoteIdentifier(run.role)}`);
      }
    }
  });
}
