// Runs the whole test suite against a REAL Postgres, not pg-mem.
//
// Why this file exists: the normal suite sets DB_DRIVER=memory and uses
// pg-mem, which is an emulator. pg-mem is good enough to make the
// tests meaningful, but it is not Postgres. Nothing proves the app
// works against the real thing until it has been run against the real
// thing.
//
// This creates a throwaway database on the local server, runs the
// suite against it, and drops it again. It never touches a database
// that holds anything.
//
// Usage:  node test/against-real-postgres.js
//         ADMIN_DATABASE_URL=... node test/against-real-postgres.js

import pg from 'pg';
import { spawn } from 'node:child_process';

const ADMIN_URL = process.env.ADMIN_DATABASE_URL
  || 'postgresql://postgres@localhost:5432/postgres';

const DB_NAME = 'applytrack_test';

const admin = new pg.Client({ connectionString: ADMIN_URL });

async function dropIfExists(client, name) {
  // Postgres refuses to drop a database while a session is connected,
  // so other sessions on it are terminated first.
  await client.query(`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = $1 AND pid <> pg_backend_pid()
  `, [name]);
  await client.query(`DROP DATABASE IF EXISTS "${name}"`);
}

function runTests(env) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['--test', 'test/api.test.js'],
      { env: { ...process.env, ...env }, stdio: 'inherit' }
    );
    child.on('close', resolve);
  });
}

async function main() {
  await admin.connect();
  await dropIfExists(admin, DB_NAME);
  await admin.query(`CREATE DATABASE "${DB_NAME}"`);
  await admin.end();

  const url = ADMIN_URL.replace(/\/[^/]*(\?|$)/, `/${DB_NAME}$1`);

  console.log(`\ncreated ${DB_NAME}`);
  console.log('running the suite against real Postgres 17...\n');

  // DB_DRIVER is deliberately left unset, so src/db.js opens a real
  // pool against DATABASE_URL instead of loading pg-mem.
  const code = await runTests({
    DATABASE_URL: url,
    JWT_SECRET: 'real-postgres-check',
  });

  const cleanup = new pg.Client({ connectionString: ADMIN_URL });
  await cleanup.connect();
  await dropIfExists(cleanup, DB_NAME);
  await cleanup.end();

  console.log(`\ndropped ${DB_NAME}`);
  console.log(code === 0
    ? 'RESULT: the suite passes against real Postgres'
    : `RESULT: FAILED against real Postgres (exit ${code})`);
  process.exit(code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});