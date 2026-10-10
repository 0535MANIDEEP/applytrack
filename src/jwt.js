// Creating and reading a JWT.
//
// The token is the whole of the auth system: the browser stores it and
// sends it back on every request, and the server decides whether a
// request is allowed by checking it. There is no session table.

import jwt from 'jsonwebtoken';

// This must exist. The app refuses to start without it rather than
// falling back to a default, because a default secret is a secret
// anyone can read.
const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  throw new Error('JWT_SECRET is not set. Copy .env.example to .env and fill it in.');
}

const EXPIRES_IN = '7d';

export function sign(user) {
  return jwt.sign({ sub: user.id, email: user.email }, SECRET, { expiresIn: EXPIRES_IN });
}

// Decoding is not the same as verifying. verify checks the signature
// and the expiry, decode does not. Only verify is used on requests.
export function verify(token) {
  return jwt.verify(token, SECRET);
}

export { EXPIRES_IN };