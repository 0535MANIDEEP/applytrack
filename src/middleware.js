// Requiring a valid token on protected routes.
//
// Every protected route starts with requireAuth. It reads the
// Authorization header, checks the token, and attaches the user id to
// the request. Handlers never read the token themselves.

import { verify } from './jwt.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';

  // The client sends "Bearer <token>". Anything else is not a request
  // this server knows how to answer.
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = verify(token);
    // Anything set on req here is readable by every handler after this
    // point. Keeping the id on req is what stops one user reading
    // another user's applications.
    req.userId = payload.sub;
    next();
  } catch {
    // Both an expired token and a tampered one land here, and both get
    // the same message. Telling them apart would tell an attacker
    // whether a token is real.
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}