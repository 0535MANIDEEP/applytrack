// Server entry point.
//
// Environment variables are loaded by Node itself, from the --env-file
// flag in the npm scripts. There is no dotenv import here, which is the
// modern way: the flag has been stable in Node since v20.6 and removes
// a dependency entirely.

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import db, { migrate } from './db.js';
import authRoutes from './auth.js';
import applicationRoutes from './applications.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// A JSON body larger than this is not a real request from this app.
app.use(express.json({ limit: '32kb' }));

// The API and the front end are served from one process in production,
// so this is only doing anything during development.
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));

app.get('/api/health', async (req, res) => {
  try {
    // A health check that does not touch the database cannot tell you
    // whether the database is reachable, which is usually the thing
    // that has actually broken.
    await db.query('SELECT 1');
    res.json({ status: 'ok', database: 'ok' });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'unreachable' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/applications', applicationRoutes);

// Serve the built front end if it exists, so one process serves both.
const webDist = path.join(import.meta.dirname, '..', 'web', 'dist');
app.use(express.static(webDist));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'No such endpoint' });
  }
  // Anything else is a client-side route, so hand back the app.
  res.sendFile(path.join(webDist, 'index.html'), (err) => {
    if (err) next();
  });
});

// Four arguments means Express treats this as error middleware.
// Express 5 also forwards rejected promises from async handlers here
// on its own, which is why none of the route handlers need try/catch.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

// The schema runs before the server starts listening, so the first
// request cannot arrive at a database with no tables in it.
await migrate();

// Exported so the test suite can shut it down. A test process that ends
// with a listening socket and an open connection pool never exits on
// its own, and a CI job that never exits is a red build that never
// arrives.
export const server = app.listen(PORT, () => {
  console.log(`applytrack listening on http://localhost:${PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => {
    db.end?.();
    process.exit(0);
  });
});

export default app;