import React, { useState, useEffect, useCallback } from 'react';
import { api, saveToken, clearToken, token } from './api.js';

const STATUSES = ['applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'];

const EMPTY_FORM = { company: '', role: '', status: 'applied', url: '', notes: '' };

function AuthScreen({ onSignedIn }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = mode === 'login'
        ? await api.login(email, password)
        : await api.register(email, password);
      saveToken(res.token);
      onSignedIn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <h1>ApplyTrack</h1>
        <p className="muted">Track every job application in one place.</p>

        <label>Email</label>
        <input type="email" value={email} required
               onChange={(e) => setEmail(e.target.value)} autoComplete="email" />

        <label>Password</label>
        <input type="password" value={password} required minLength={8}
               onChange={(e) => setPassword(e.target.value)}
               autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={busy}>
          {busy ? 'Working...' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>

        <p className="muted small">
          {mode === 'login' ? 'No account?' : 'Already registered?'}{' '}
          <button type="button" className="link"
                  onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
            {mode === 'login' ? 'Create one' : 'Log in'}
          </button>
        </p>
      </form>
    </div>
  );
}

function Dashboard() {
  const [applications, setApplications] = useState([]);
  const [stats, setStats] = useState({});
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // useCallback keeps load from being a new function on every render,
  // which would retrigger the effect below forever.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, counts] = await Promise.all([api.list(page, filter), api.stats()]);
      setApplications(list.applications);
      setPages(list.pages || 1);
      setStats(counts);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => { load(); }, [load]);

  async function addApplication(e) {
    e.preventDefault();
    setError('');
    try {
      await api.create(form);
      setForm(EMPTY_FORM);
      setPage(1);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function move(id, status) {
    try {
      await api.updateStatus(id, status);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    try {
      await api.remove(id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function logout() {
    clearToken();
    window.location.reload();
  }

  const total = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <div className="wrap">
      <header>
        <h1>ApplyTrack</h1>
        <button className="link" onClick={logout}>Log out</button>
      </header>

      <section className="stats">
        <div className="stat"><strong>{total}</strong><span>Total</span></div>
        {STATUSES.map((s) => (
          <div className="stat" key={s}>
            <strong>{stats[s] ?? 0}</strong><span>{s}</span>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Add an application</h2>
        <form className="grid" onSubmit={addApplication}>
          <input placeholder="Company" required value={form.company}
                 onChange={(e) => setForm({ ...form, company: e.target.value })} />
          <input placeholder="Role" required value={form.role}
                 onChange={(e) => setForm({ ...form, role: e.target.value })} />
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input placeholder="Job link (optional)" value={form.url}
                 onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <input placeholder="Notes (optional)" value={form.notes}
                 onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button type="submit">Save</button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <div className="row">
          <h2>Applications</h2>
          <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {loading && <p className="muted">Loading...</p>}
        {!loading && applications.length === 0 && (
          <p className="muted">Nothing here yet. Add the first one above.</p>
        )}

        <ul className="list">
          {applications.map((a) => (
            <li key={a.id}>
              <div className="main">
                <strong>{a.role}</strong> at {a.company}
                <span className="muted small">
                  {' '}applied {a.applied_on}
                  {a.url && <> · <a href={a.url} target="_blank" rel="noreferrer">link</a></>}
                </span>
                {a.notes && <p className="notes">{a.notes}</p>}
              </div>
              <div className="controls">
                <select value={a.status} onChange={(e) => move(a.id, e.target.value)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className="danger" onClick={() => remove(a.id)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>

        {pages > 1 && (
          <div className="row pager">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span className="muted">Page {page} of {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        )}
      </section>
    </div>
  );
}

export default function App() {
  const [signedIn, setSignedIn] = useState(!!token());
  return signedIn
    ? <Dashboard />
    : <AuthScreen onSignedIn={() => setSignedIn(true)} />;
}