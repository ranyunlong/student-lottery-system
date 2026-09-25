import { pool } from '../src/db/client';
import { runEmblemCleanupBatch } from '../src/features/classes/emblem';

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--limit')) {
    throw new Error('Usage: npm run emblem:cleanup -- [--limit 1..100]');
  }
  const limit = args.length ? Number(args[1]) : 50;
  const result = await runEmblemCleanupBatch(limit);
  console.log(JSON.stringify(result));
  if (result.failed) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => pool.end());
