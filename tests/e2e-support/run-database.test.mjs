import assert from 'node:assert/strict';
import pg from 'pg';
import test from 'node:test';
import { removeE2ERunDatabase } from './run-database.mjs';

const adminUrl = process.env.E2E_DATABASE_ADMIN_URL;

test('cleanup refuses the base database and mismatched run identities before connecting', async () => {
  const runId = 'a'.repeat(32);
  const validRun = {
    database: `lottery_e2e_run_${runId}`,
    role: `lottery_e2e_app_${runId}`,
    marker: `student-lottery-e2e-run:v1:${runId}`,
    roleMarker: `student-lottery-e2e-role:v1:${runId}`,
  };

  await assert.rejects(
    removeE2ERunDatabase('not-a-dsn', { ...validRun, database: 'lottery_e2e' }),
    /invocation-owned/,
  );
  await assert.rejects(
    removeE2ERunDatabase('not-a-dsn', { ...validRun, role: `lottery_e2e_app_${'b'.repeat(32)}` }),
    /invocation-owned/,
  );
});

test('marked cleanup retries transient errors a bounded number of times', async () => {
  const { retryE2ECleanup } = await import('./run-database.mjs');
  let attempts = 0;
  const result = await retryE2ECleanup(async () => {
    attempts += 1;
    if (attempts < 3) throw new Error('transient drop race');
    return 'removed';
  }, { delay: () => 0 });
  assert.equal(result, 'removed');
  assert.equal(attempts, 3);

  attempts = 0;
  await assert.rejects(retryE2ECleanup(async () => {
    attempts += 1;
    throw new Error('persistent cleanup failure');
  }, { delay: () => 0 }), /persistent cleanup failure/);
  assert.equal(attempts, 5);
});

test('explicit recovery refuses active runs and removes only the selected marked run', {
  skip: !adminUrl && 'requires the process-scoped dedicated E2E database admin URL',
  timeout: 120_000,
}, async () => {
  const { acquireE2ERunLease, createE2ERunDatabase, recoverE2ERunDatabase, removeE2ERunDatabase } = await import('./run-database.mjs');
  const admin = new pg.Client({ connectionString: adminUrl, connectionTimeoutMillis: 5000 });
  await admin.connect();
  const selected = await createE2ERunDatabase(adminUrl);
  const concurrent = await createE2ERunDatabase(adminUrl);
  const liveClient = new pg.Client({ connectionString: selected.databaseUrl, connectionTimeoutMillis: 5000 });
  let releaseLease;

  try {
    releaseLease = await acquireE2ERunLease(adminUrl, selected);
    const runId = selected.database.slice('lottery_e2e_run_'.length);
    await assert.rejects(recoverE2ERunDatabase(adminUrl, runId), /already active/i);
    await releaseLease();
    releaseLease = undefined;
    await liveClient.connect();
    await assert.rejects(recoverE2ERunDatabase(adminUrl, runId), /active connection/i);
    const activeObjects = await admin.query(`
      select
        exists(select 1 from pg_database where datname = $1) as selected_database,
        exists(select 1 from pg_roles where rolname = $2) as selected_role,
        exists(select 1 from pg_database where datname = $3) as concurrent_database,
        exists(select 1 from pg_roles where rolname = $4) as concurrent_role
    `, [selected.database, selected.role, concurrent.database, concurrent.role]);
    assert.deepEqual(activeObjects.rows, [{
      selected_database: true,
      selected_role: true,
      concurrent_database: true,
      concurrent_role: true,
    }]);

    await liveClient.end();
    assert.equal(await recoverE2ERunDatabase(adminUrl, runId), true);
    const recovered = await admin.query(`
      select
        exists(select 1 from pg_database where datname = $1) as selected_database,
        exists(select 1 from pg_roles where rolname = $2) as selected_role,
        exists(select 1 from pg_database where datname = $3) as concurrent_database,
        exists(select 1 from pg_roles where rolname = $4) as concurrent_role
    `, [selected.database, selected.role, concurrent.database, concurrent.role]);
    assert.deepEqual(recovered.rows, [{
      selected_database: false,
      selected_role: false,
      concurrent_database: true,
      concurrent_role: true,
    }]);
  } finally {
    if (releaseLease) await releaseLease().catch(() => {});
    await liveClient.end().catch(() => {});
    await removeE2ERunDatabase(adminUrl, selected).catch(() => {});
    await removeE2ERunDatabase(adminUrl, concurrent);
    await admin.end();
  }
});

test('repeated E2E database lifecycles leave no run database or runner role behind', {
  skip: !adminUrl && 'requires the process-scoped dedicated E2E database admin URL',
  timeout: 120_000,
}, async () => {
  const { createE2ERunDatabase, removeE2ERunDatabase } = await import('./run-database.mjs');
  const admin = new pg.Client({ connectionString: adminUrl, connectionTimeoutMillis: 5000 });
  await admin.connect();

  try {
    const base = await admin.query(`
      select current_database() as database,
        (select shobj_description(oid, 'pg_database') from pg_database where datname = current_database()) as marker
    `);
    assert.deepEqual(base.rows, [{ database: 'lottery_e2e', marker: 'student-lottery-e2e:v1' }]);

    const baseFixtures = async () => {
      const { rows } = await admin.query(`
        select
          (select count(*)::int from public."user" where email like '%@task15.example.test') as users,
          (select count(*)::int from public.classes where name like 'Task15%') as classes,
          (select count(*)::int from public.winning_records wins
            join public.classes c on c.id = wins.class_id where c.name like 'Task15%') as wins
      `);
      return rows[0];
    };
    const initialFixtures = await baseFixtures();
    const initialRunResidue = await admin.query(`
      select
        (select count(*)::int from pg_database where datname like 'lottery_e2e_run_%') as databases,
        (select count(*)::int from pg_roles where rolname like 'lottery_e2e_app_%') as roles
    `);
    assert.deepEqual(initialRunResidue.rows, [{ databases: 0, roles: 0 }]);

    for (let index = 0; index < 2; index++) {
      const run = await createE2ERunDatabase(adminUrl);
      try {
        assert.match(run.database, /^lottery_e2e_run_[a-f0-9]{32}$/);
        assert.match(run.role, /^lottery_e2e_app_[a-f0-9]{32}$/);

        const runtime = new pg.Client({ connectionString: run.databaseUrl, connectionTimeoutMillis: 5000 });
        await runtime.connect();
        try {
          const identity = await runtime.query(`
            select current_database() as database,
              current_user as role,
              (select shobj_description(oid, 'pg_database') from pg_database where datname = current_database()) as marker,
              (select rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls
                from pg_roles where rolname = current_user) as elevated,
              (select rolconnlimit from pg_roles where rolname = current_user) as connection_limit,
              has_schema_privilege(current_user, 'public', 'CREATE') as can_create_schema,
              has_table_privilege(current_user, 'public.winning_records', 'TRUNCATE,TRIGGER') as can_alter_history
          `);
          assert.deepEqual(identity.rows, [{
            database: run.database,
            role: run.role,
            marker: run.marker,
            elevated: false,
            connection_limit: 80,
            can_create_schema: false,
            can_alter_history: false,
          }]);
        } finally {
          await runtime.end();
        }
      } finally {
        await removeE2ERunDatabase(adminUrl, run);
      }

      const residue = await admin.query(`
        select
          exists(select 1 from pg_database where datname = $1) as database_exists,
          exists(select 1 from pg_roles where rolname = $2) as role_exists,
          (select count(*)::int from pg_database where datname like 'lottery_e2e_run_%') as run_databases,
          (select count(*)::int from pg_roles where rolname like 'lottery_e2e_app_%') as run_roles
      `, [run.database, run.role]);
      assert.deepEqual(residue.rows, [{ database_exists: false, role_exists: false, run_databases: 0, run_roles: 0 }]);
      assert.deepEqual(await baseFixtures(), initialFixtures);
    }
    console.log(`Base fixtures unchanged across two runs: ${JSON.stringify(initialFixtures)}; temporary databases/roles after each run: 0/0.`);
  } finally {
    await admin.end();
  }
});
