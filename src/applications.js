// Application routes. Every one of these is behind requireAuth, and
// every query is filtered by user_id.
//
// That filter is the important part. Without user_id in the WHERE
// clause, GET /api/applications/7 would return anyone's application,
// and PATCH or DELETE on it would change or destroy it.
//
// Every value goes through a $1 placeholder rather than being written
// into the SQL string. With a string you would need to escape
// everything yourself and it is easy to miss one; a placeholder is
// sent to Postgres separately from the query and can never become SQL.

import express from 'express';
import db from './db.js';
import { requireAuth } from './middleware.js';

const router = express.Router();

router.use(requireAuth);

const STATUSES = ['applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'];

function body(req) {
  return req.body ?? {};
}

// GET /api/applications?status=interview&page=1&limit=10
router.get('/', async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Number.parseInt(req.query.limit, 10) || 10);
  const offset = (page - 1) * limit;

  const { status } = req.query;
  const filtered = Boolean(status) && STATUSES.includes(status);

  const { rows } = filtered
    ? await db.query(
        `SELECT * FROM applications
         WHERE user_id = $1 AND status = $2
         ORDER BY applied_on DESC, id DESC
         LIMIT $3 OFFSET $4`,
        [req.userId, status, limit, offset]
      )
    : await db.query(
        `SELECT * FROM applications
         WHERE user_id = $1
         ORDER BY applied_on DESC, id DESC
         LIMIT $2 OFFSET $3`,
        [req.userId, limit, offset]
      );

  const countSql = filtered
    ? 'SELECT COUNT(*)::int AS n FROM applications WHERE user_id = $1 AND status = $2'
    : 'SELECT COUNT(*)::int AS n FROM applications WHERE user_id = $1';
  const countArgs = filtered ? [req.userId, status] : [req.userId];

  const { rows: [{ n: total }] } = await db.query(countSql, countArgs);

  res.json({ applications: rows, total, page, limit, pages: Math.ceil(total / limit) });
});

// GET /api/applications/stats
// Counts per status for the dashboard. Separate from the list route
// because it does not paginate and reports every status, including the
// ones with nothing in them.
router.get('/stats', async (req, res) => {
  const { rows } = await db.query(
    `SELECT status, COUNT(*)::int AS count
     FROM applications
     WHERE user_id = $1
     GROUP BY status`,
    [req.userId]
  );

  const stats = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const row of rows) stats[row.status] = row.count;

  res.json(stats);
});

// POST /api/applications
router.post('/', async (req, res) => {
  const b = body(req);
  const company = String(b.company || '').trim();
  const role = String(b.role || '').trim();

  if (!company || !role) {
    return res.status(400).json({ error: 'Company and role are required' });
  }

  const status = STATUSES.includes(b.status) ? b.status : 'applied';
  const url = String(b.url || '').trim() || null;
  const notes = String(b.notes || '').trim() || null;

  const { rows } = await db.query(
    `INSERT INTO applications (user_id, company, role, status, url, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [req.userId, company, role, status, url, notes]
  );

  res.status(201).json(rows[0]);
});

// PATCH /api/applications/:id
// Only the status is editable. Editing the company a month later is how
// job trackers fill up with half-remembered rows.
router.patch('/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const { status } = body(req);

  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Unknown status' });
  }

  // rowCount of 0 means no row matched, which for this query means the
  // id does not exist or belongs to somebody else. Both answer 404,
  // because answering differently would confirm the row exists.
  const { rows, rowCount } = await db.query(
    `UPDATE applications SET status = $1
     WHERE id = $2 AND user_id = $3
     RETURNING *`,
    [status, id, req.userId]
  );

  if (rowCount === 0) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.json(rows[0]);
});

// DELETE /api/applications/:id
router.delete('/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);

  const { rowCount } = await db.query(
    'DELETE FROM applications WHERE id = $1 AND user_id = $2',
    [id, req.userId]
  );

  if (rowCount === 0) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.status(204).end();
});

export default router;