// Auth routes: register and login.
//
// Every handler is async now that the database is Postgres. Express 5
// catches a rejected promise from an async handler and passes it to the
// error middleware, so none of these need try/catch around the queries.
// That is one of the real reasons to be on Express 5 rather than 4.

import express from 'express';
import bcrypt from 'bcryptjs';
import db from './db.js';
import { sign } from './jwt.js';

const router = express.Router();

const SALT_ROUNDS = 10;

// Express 5 uses body-parser 2, where req.body is no longer always
// initialised. A POST with no body leaves it undefined, so every route
// that reads it starts from an empty object.
function body(req) {
  return req.body ?? {};
}

// POST /api/auth/register
// Creates a user and returns a token, so a new account is signed in
// without a second request.
router.post('/register', async (req, res) => {
  const { email: rawEmail, password: rawPassword } = body(req);
  const email = String(rawEmail || '').trim().toLowerCase();
  const password = String(rawPassword || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rowCount > 0) {
    return res.status(409).json({ error: 'That email is already registered' });
  }

  // Hashing is not optional and not cosmetic. bcrypt turns the password
  // into a hash, and the point of a salt is that two people with the
  // same password get different hashes, so one stolen table does not
  // reveal both.
  const hash = await bcrypt.hash(password, SALT_ROUNDS);

  const { rows } = await db.query(
    'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email',
    [email, hash]
  );

  res.status(201).json({ token: sign(rows[0]), user: rows[0] });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email: rawEmail, password: rawPassword } = body(req);
  const email = String(rawEmail || '').trim().toLowerCase();
  const password = String(rawPassword || '');

  const { rows } = await db.query(
    'SELECT id, email, password FROM users WHERE email = $1',
    [email]
  );

  const user = rows[0];

  // One message for "no such user" and for "wrong password", so the
  // endpoint cannot be used to find which emails are registered.
  if (!user) {
    return res.status(401).json({ error: 'Email or password is wrong' });
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    return res.status(401).json({ error: 'Email or password is wrong' });
  }

  const safe = { id: user.id, email: user.email };
  res.json({ token: sign(safe), user: safe });
});

export default router;