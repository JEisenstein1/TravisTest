import { useState } from 'react'
import { login, logout, register, syncNow } from '../../services/syncApi'
import { useApp } from '../../state/store'

export default function SyncTab(): JSX.Element {
  const s = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      setMsg(ok)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  if (s.authToken) {
    return (
      <div>
        <p>
          Signed in as <strong>{s.authEmail}</strong>
        </p>
        <div className="field-row">
          <button
            className="btn primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await syncNow()
                setMsg(`Synced: ${r.boats} boats, ${r.routes} routes.`)
              }, 'Synced.')
            }
          >
            ⇅ Sync now
          </button>
          <button className="btn" onClick={logout}>Sign out</button>
        </div>
        {msg && <p className="hint">{msg}</p>}
        <p className="hint">
          Boats and routes sync across devices (last write wins). Everything also works fully
          offline — sync is optional and requires the Soundline server to be running.
        </p>
      </div>
    )
  }

  return (
    <div>
      <label className="field">
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        Password (8+ chars)
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <div className="field-row">
        <button className="btn primary" disabled={busy} onClick={() => run(() => login(email, password), 'Signed in.')}>
          Sign in
        </button>
        <button className="btn" disabled={busy} onClick={() => run(() => register(email, password), 'Account created.')}>
          Create account
        </button>
      </div>
      {msg && <p className="hint warn">{msg}</p>}
      <p className="hint">
        Optional — the app is fully usable without an account. Sync requires the bundled server
        (see server/README in the repo).
      </p>
    </div>
  )
}
