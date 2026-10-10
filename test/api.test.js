// Tests for the API.
//
// Run with:  npm test
//
// These use node:test, which is built into Node. There is no test
// framework to install and no extra dependency, so "run the tests" is
// one command with nothing to configure.
//
// The database used here is a separate file from the development one,
// so running the suite never touches real data. Set up and teardown are
// in hooks.test.js, which runs before and after this file.

import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/server.js';

// ---- auth ------------------------------------------------------------

test('register creates a user and returns a token', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'new@example.com', password: 'password123' });

  assert.equal(res.status, 201);
  assert.ok(res.body.token, 'expected a token');
  assert.equal(res.body.user.email, 'new@example.com');
});

test('register rejects a duplicate email', async () => {
  const body = { email: 'dup@example.com', password: 'password123' };
  await request(app).post('/api/auth/register').send(body);

  const res = await request(app).post('/api/auth/register').send(body);
  assert.equal(res.status, 409);
});

test('register rejects a short password', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'short@example.com', password: 'abc' });

  assert.equal(res.status, 400);
});

test('register rejects an email with no password', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'nopass@example.com' });

  assert.equal(res.status, 400);
});

test('login returns a token for correct credentials', async () => {
  await request(app)
    .post('/api/auth/register')
    .send({ email: 'login@example.com', password: 'password123' });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'login@example.com', password: 'password123' });

  assert.equal(res.status, 200);
  assert.ok(res.body.token);
});

test('login is rejected for a wrong password', async () => {
  await request(app)
    .post('/api/auth/register')
    .send({ email: 'wrong@example.com', password: 'password123' });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'wrong@example.com', password: 'wrongpassword' });

  assert.equal(res.status, 401);
});

test('login gives the same message for an unknown email as for a wrong password', async () => {
  const unknown = await request(app)
    .post('/api/auth/login')
    .send({ email: 'nobody@example.com', password: 'password123' });

  await request(app)
    .post('/api/auth/register')
    .send({ email: 'real@example.com', password: 'password123' });

  const wrongPass = await request(app)
    .post('/api/auth/login')
    .send({ email: 'real@example.com', password: 'nope12345' });

  // If these two messages differed, the endpoint could be used to find
  // out which email addresses are registered.
  assert.equal(unknown.body.error, wrongPass.body.error);
});

// ---- auth guard ------------------------------------------------------

test('applications are refused without a token', async () => {
  const res = await request(app).get('/api/applications');
  assert.equal(res.status, 401);
});

test('applications are refused for a token that is not valid', async () => {
  const res = await request(app)
    .get('/api/applications')
    .set('Authorization', 'Bearer not.a.real.token');

  assert.equal(res.status, 401);
});

// ---- applications ----------------------------------------------------

async function signedIn(email) {
  await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'password123' });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'password123' });

  return res.body.token;
}

test('creating an application returns 201 and the stored row', async () => {
  const token = await signedIn('create@example.com');

  const res = await request(app)
    .post('/api/applications')
    .set('Authorization', 'Bearer ' + token)
    .send({ company: 'Acme', role: 'Frontend Developer' });

  assert.equal(res.status, 201);
  assert.equal(res.body.company, 'Acme');
  assert.equal(res.body.status, 'applied', 'new applications default to applied');
});

test('creating an application requires a company and a role', async () => {
  const token = await signedIn('novalidate@example.com');

  const res = await request(app)
    .post('/api/applications')
    .set('Authorization', 'Bearer ' + token)
    .send({ company: '', role: '' });

  assert.equal(res.status, 400);
});

test('an unknown status on create falls back to applied', async () => {
  const token = await signedIn('badstatus@example.com');

  const res = await request(app)
    .post('/api/applications')
    .set('Authorization', 'Bearer ' + token)
    .send({ company: 'Acme', role: 'Dev', status: 'hired' });

  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'applied');
});

test('applications can be listed for the signed in user', async () => {
  const token = await signedIn('list@example.com');

  await request(app)
    .post('/api/applications')
    .set('Authorization', 'Bearer ' + token)
    .send({ company: 'Listed Co', role: 'Dev' });

  const res = await request(app)
    .get('/api/applications')
    .set('Authorization', 'Bearer ' + token);

  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.applications[0].company, 'Listed Co');
});

test('the list can be filtered by status', async () => {
  const token = await signedIn('filter@example.com');

  for (const status of ['applied', 'interview']) {
    await request(app)
      .post('/api/applications')
      .set('Authorization', 'Bearer ' + token)
      .send({ company: 'Co ' + status, role: 'Dev', status });
  }

  const res = await request(app)
    .get('/api/applications?status=interview')
    .set('Authorization', 'Bearer ' + token);

  assert.equal(res.body.total, 1);
  assert.equal(res.body.applications[0].status, 'interview');
});

test('a filter that is not a known status is ignored rather than erroring', async () => {
  const token = await signedIn('badfilter@example.com');

  await request(app)
    .post('/api/applications')
    .set('Authorization', 'Bearer ' + token)
    .send({ company: 'Acme', role: 'Dev' });

  const res = await request(app)
    .get('/api/applications?status=nonsense')
    .set('Authorization', 'Bearer ' + token);

  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1, 'the unrecognised filter should return everything');
});

test('pagination splits the list and reports the page count', async () => {
  const token = await signedIn('page@example.com');

  for (let i = 1; i <= 5; i++) {
    await request(app)
      .post('/api/applications')
      .set('Authorization', 'Bearer ' + token)
      .send({ company: 'Co ' + i, role: 'Dev' });
  }

  const first = await request(app)
    .get('/api/applications?page=1&limit=2')
    .set('Authorization', 'Bearer ' + token);

  assert.equal(first.body.applications.length, 2);
  assert.equal(first.body.total, 5);
  assert.equal(first.body.pages, 3);

  const last = await request(app)
    .get('/api/applications?page=3&limit=2')
    .set('Authorization', 'Bearer ' + token);

  assert.equal(last.body.applications.length, 1, 'the last page holds the remainder');
});

test('a status can be changed', async () => {
  const token = await signedIn('update@example.com');

  const created = await request(app)
    .post('/api/applications')
    .set('Authorization', 'Bearer ' + token)
    .send({ company: 'Acme', role: 'Dev' });

  const res = await request(app)
    .patch('/api/applications/' + created.body.id)
    .set('Authorization', 'Bearer ' + token)
    .send({ status: 'interview' });

  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'interview');
});

test('a status that is not on the list is rejected', async () => {
  const token = await signedIn('rejectstatus@example.com');

  const created = await request(app)
    .post('/api/applications')
    .set('Authorization', 'Bearer ' + token)
    .send({ company: 'Acme', role: 'Dev' });

  const res = await request(app)
    .patch('/api/applications/' + created.body.id)
    .set('Authorization', 'Bearer ' + token)
    .send({ status: 'hired' });

  assert.equal(res.status, 400);
});

test('an application can be deleted', async () => {
  const token = await signedIn('delete@example.com');

  const created = await request(app)
    .post('/api/applications')
    .set('Authorization', 'Bearer ' + token)
    .send({ company: 'Acme', role: 'Dev' });

  const res = await request(app)
    .delete('/api/applications/' + created.body.id)
    .set('Authorization', 'Bearer ' + token);

  assert.equal(res.status, 204);

  const after = await request(app)
    .get('/api/applications')
    .set('Authorization', 'Bearer ' + token);

  assert.equal(after.body.total, 0);
});

test('stats count applications per status', async () => {
  const token = await signedIn('stats@example.com');

  for (const status of ['applied', 'applied', 'offer']) {
    await request(app)
      .post('/api/applications')
      .set('Authorization', 'Bearer ' + token)
      .send({ company: 'Acme', role: 'Dev', status });
  }

  const res = await request(app)
    .get('/api/applications/stats')
    .set('Authorization', 'Bearer ' + token);

  assert.equal(res.body.applied, 2);
  assert.equal(res.body.offer, 1);
  assert.equal(res.body.rejected, 0, 'statuses with nothing in them are still reported as zero');
});

// ---- the one that matters --------------------------------------------

test('one user cannot see or change another user applications', async () => {
  const alice = await signedIn('alice@example.com');
  const bob = await signedIn('bob@example.com');

  const alicesApp = await request(app)
    .post('/api/applications')
    .set('Authorization', 'Bearer ' + alice)
    .send({ company: 'Alice Corp', role: 'Dev' });

  // Bob's list must not contain it.
  const bobList = await request(app)
    .get('/api/applications')
    .set('Authorization', 'Bearer ' + bob);
  assert.equal(bobList.body.total, 0);

  // And Bob must not be able to change it by guessing the id.
  const bobPatch = await request(app)
    .patch('/api/applications/' + alicesApp.body.id)
    .set('Authorization', 'Bearer ' + bob)
    .send({ status: 'rejected' });
  assert.equal(bobPatch.status, 404);

  const bobDelete = await request(app)
    .delete('/api/applications/' + alicesApp.body.id)
    .set('Authorization', 'Bearer ' + bob);
  assert.equal(bobDelete.status, 404);

  // And it must still be there for Alice.
  const aliceList = await request(app)
    .get('/api/applications')
    .set('Authorization', 'Bearer ' + alice);
  assert.equal(aliceList.body.total, 1);
});

// ---- odds and ends ---------------------------------------------------

test('health check responds', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
});

test('an unknown api route returns 404 as json', async () => {
  const res = await request(app).get('/api/does-not-exist');
  assert.equal(res.status, 404);
  assert.ok(res.body.error);
});

