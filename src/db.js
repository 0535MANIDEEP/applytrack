// Database connection and schema.
//
// Postgres, not SQLite. SQLite was the first choice here because it
// needs no installation, and that is still true of it locally. The
// problem is deployment: Render's free tier documents that a web
// service has an "ephemeral filesystem" and that "local SQLite
// databases" are lost "every time the service redeploys, restarts, or
// spins down". An application tracker that loses every row when the
// server idles for a few minutes is not an application tracker.
//
// Postgres fixes that and is what job descriptions actually screen for.
//
// TWO DRIVERS, ONE SET OF SQL
//
//   normal   a real Postgres pool, via DATABASE_URL
//   memory   pg-mem, an in-memory Postgres, used by the test suite
//
// The reason for the second one is that the tests must run with one
// command and no database installed. Every statement below is standard
// SQL and runs unchanged against either, so the test suite exercises
// the same queries the app runs in production.

import pg from 'pg';

const useMemory = process.env.DB_DRIVER === 'memory';

let pool;

if (useMemory) {
  const { newDb } = await import('pg-mem');
  const memory = newDb();
  const adapter = memory.adapters.createPg();
  pool = new adapter.Pool();
} else {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and point it at a Postgres database.'
    );
  }
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    // A pool opens connections lazily and reuses them. Without a cap
    // a burst of traffic can open more connections than Postgres is
    // configured to allow, and the new connections then get refused.
    max: 10,
  });
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id         SERIAL PRIMARY KEY,
    email      TEXT NOT NULL UNIQUE,
    password   TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS applications (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company    TEXT NOT NULL,
    role       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'applied',
    url        TEXT,
    notes      TEXT,
    applied_on DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_applications_user
    ON applications(user_id, applied_on DESC);
`;

// Runs the schema. Safe to call on every start: CREATE TABLE IF NOT
// EXISTS and CREATE INDEX IF NOT EXISTS are both no-ops when the
// objects are already there.
export async function migrate() {
  await pool.query(SCHEMA);
}

export async function close() {
  await pool.end();
}

export default pool;