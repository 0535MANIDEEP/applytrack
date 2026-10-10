# ApplyTrack

A small job application tracker. Sign in, add the roles you applied to,
move each one through screening and interview to offer, and see where
everything stands.

Built to be read. It is about 500 lines of server code and 300 of front
end, with 23 tests that explain what each rule is for.

![Stack](https://img.shields.io/badge/Node-20%2B-green) ![Express](https://img.shields.io/badge/Express-5-green) ![Postgres](https://img.shields.io/badge/Postgres-blue) ![React](https://img.shields.io/badge/React-19-blue)

## What it does

- Register and sign in, with a JWT that expires after 7 days
- Add an application with company, role, link and notes
- Move it through `applied`, `screening`, `interview`, `offer`, `rejected`, `withdrawn`
- Filter by status and page through the list
- Counts per status across the top of the page
- One account cannot read or change another account's applications

## Running it

You need Node 20 or newer and a Postgres database. The free one from
[Neon](https://neon.tech) takes about two minutes and needs no card.

```bash
git clone https://github.com/0535MANIDEEP/applytrack
cd applytrack

npm install
cp .env.example .env      # then paste in DATABASE_URL and JWT_SECRET
npm run seed              # optional, adds five example applications
npm start                  # http://localhost:3001
```

To work on the front end, run the API and the dev server separately:

```bash
npm run dev          # API on :3001, restarts on change
npm run web          # front end on :1234
```

The dev server needs to know where the API is. Create `web/.env`:

```
API_URL=http://localhost:3001/api
```

In production that file does not exist, so the app calls `/api` on its
own origin, which is where Express serves it from.

## Running the tests

```bash
npm test
```

No database needed and no Docker. `test/setup.js` sets `DB_DRIVER=memory`,
which makes `src/db.js` load [pg-mem](https://github.com/oguimbal/pg-mem)
instead of connecting to Postgres. pg-mem is an in-memory Postgres, and
every query the suite runs is the same SQL the app runs against a real
database.

## Deploying

`render.yaml` deploys the app to Render as a Node web service. Set
`DATABASE_URL` and `JWT_SECRET` as secrets in the dashboard and it is
live.

The database is a Neon instance rather than Render Postgres, because
Render's free Postgres expires after 30 days.

**Why not SQLite?** It was the first choice, since it needs no setup at
all. Render's documentation says a free web service has an "ephemeral
filesystem" and that "local SQLite databases" are lost "every time the
service redeploys, restarts, or spins down". An application tracker that
empties itself whenever the server idles is not much use.

## How it is put together

```
src/
  server.js         entry point, middleware, static files
  db.js             pool, schema, and the two drivers
  auth.js           register and login
  applications.js   the CRUD routes
  jwt.js            signing and verifying tokens
  middleware.js     requireAuth
web/src/
  App.jsx           the whole UI
  api.js            every fetch call
test/
  setup.js          runs before the tests
  api.test.js       23 tests
```

### Decisions worth explaining in an interview

**Every query filters by `user_id`.** Not most of them. Every one. Without
that in the `WHERE` clause, `GET /api/applications/7` returns somebody
else's application and `DELETE` destroys it. There is a test that
registers two users and checks the second can neither read nor modify the
first one's rows, including by guessing the id.

**Every value is a placeholder, never string concatenation.** `$1`, `$2`
and so on. The value is sent to Postgres separately from the SQL, so it
is impossible for a value to become SQL. Building the query with template
literals would work until one string is missed.

**Passwords are hashed with bcrypt and a salt.** A salt means two people
with the same password get different hashes, so one leaked table does not
reveal both. Login compares a hash rather than comparing strings.

**Login gives the same message for an unknown email and a wrong
password.** Different messages would let anyone check which addresses are
registered. There is a test for it.

**Expired and tampered tokens get the same message.** Saying which one it
was tells an attacker whether a token is real.

**No ORM.** Every query is visible in the file. Interviewers ask about
SQL, not about a query builder.

**`node:test` rather than Jest.** It is built into Node, so the suite
needs no test framework installed and no configuration file.

**Express 5 rather than Express 4.** Express 5 forwards a rejected
promise from an async handler to the error middleware on its own, so
none of the route handlers wrap their queries in try/catch.

**Environment variables come from Node, not from a library.** The npm
scripts use `--env-file-if-exists=.env`, which has been stable since
Node 20.6, so there is no `dotenv` dependency.

**ES modules throughout.** `"type": "module"`, `import` and
`import.meta.dirname`. `__dirname` does not exist in ES modules.

**npm workspaces.** `web` is a workspace of the root package, so one
`npm install` covers the server and the front end together and there is
one `package-lock.json` rather than two that can drift apart.

### Known limits

This is a small project and these are deliberate, not oversights:

- The token is in `localStorage`, which any script on the page can
  read. An `httpOnly` cookie set by the server cannot be read by script
  and is what a real deployment should use. It is acceptable here
  because the app holds nothing but the owner's own rows.
- The token cannot be revoked before it expires. Signing out clears it
  from the browser and nothing else.
- There is no password reset, and no email is ever sent.
- Status is the only editable field after creation.

## Licence

MIT