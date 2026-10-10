// Loaded before any test file, with:  node --test --import ./test/setup.js
//
// Each test file runs in its own process, so setting process.env inside
// a test file does nothing for the others. And ./src/db.js reads its
// configuration the moment it is imported, which happens at the top of
// api.test.js.
//
// So the two things that have to happen first happen here instead.
//
// DB_DRIVER=memory makes db.js load pg-mem instead of connecting to a
// real Postgres. That is what lets "npm test" work on a machine with no
// database installed and no Docker, while every query in the suite is
// still the same SQL the app runs against a real database.

process.env.DB_DRIVER = 'memory';

// A throwaway secret for tests. It is never used outside the suite.
process.env.JWT_SECRET = 'test-secret-for-the-suite-only';