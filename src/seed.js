// Fills the database with a few example applications so the front end
// has something to show on first run.
//
// Run with: npm run seed

import db, { migrate } from './db.js';
import bcrypt from 'bcryptjs';

const email = 'demo@example.com';
const password = 'password123';

await migrate();

const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
if (existing.rowCount > 0) {
  console.log('Seed user already exists, nothing to do.');
  process.exit(0);
}

const { rows: [user] } = await db.query(
  'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email',
  [email, await bcrypt.hash(password, 10)]
);

const rows = [
  ['Northwind Traders', 'Frontend Developer', 'interview', 'https://example.com/northwind', 'Panel scheduled for Thursday.'],
  ['Contoso Retail', 'Full Stack Engineer', 'screening', 'https://example.com/contoso', 'Recruiter asked for resume and GitHub links.'],
  ['Fabrikam Systems', 'Software Engineer', 'applied', 'https://example.com/fabrikam', 'Referred through a colleague from Crystalline.'],
  ['Tailspin Toys', 'Web Developer', 'rejected', 'https://example.com/tailspin', 'Went with someone with more backend experience.'],
  ['Adventure Works', 'Software Engineer Intern', 'offer', 'https://example.com/adventure', 'Offer received, responding this week.'],
];

// One transaction, so a failure part way through cannot leave half the
// rows written. BEGIN, the inserts, COMMIT: all of it or none of it.
const client = await db.connect();
try {
  await client.query('BEGIN');
  for (const [company, role, status, url, notes] of rows) {
    await client.query(
      `INSERT INTO applications (user_id, company, role, status, url, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, company, role, status, url, notes]
    );
  }
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}

console.log(`Seeded ${rows.length} applications.`);
console.log(`Log in with ${email} / ${password}`);

process.exit(0);