import { type FormEvent, useState } from "react";
import { MIN_PASSWORD, lockApi } from "../lock/lockApi";

export function SecuritySettings() {
  const api = lockApi();
  const [oldPw, setOldPw] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!api) return null; // browser preview has no lock

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < MIN_PASSWORD) return setMsg({ ok: false, text: `Use at least ${MIN_PASSWORD} characters.` });
    if (pw !== pw2) return setMsg({ ok: false, text: "The new passwords don't match." });
    setBusy(true);
    const r = await api!.change(oldPw, pw);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error.message });
    setOldPw(""); setPw(""); setPw2("");
    setMsg({ ok: true, text: "Password changed." });
  }

  return (
    <div className="card">
      <div>
        <h2>Security</h2>
        <p className="muted small">The app asks for your password when it opens, after the Mac's screen locks, and before any API key change.</p>
      </div>
      <form className="grid-2" onSubmit={submit}>
        <label className="field full"><span>Current password</span>
          <input type="password" autoComplete="current-password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
        </label>
        <label className="field"><span>New password</span>
          <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        <label className="field"><span>New password again</span>
          <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </label>
        <div className="row spread full" style={{ gridColumn: "1 / -1" }}>
          <span className={`small ${msg?.ok ? "" : "error-text"}`}>{msg?.text}</span>
          <button className="btn primary" disabled={!oldPw || !pw || !pw2 || busy}>{busy ? "Saving…" : "Change password"}</button>
        </div>
      </form>
    </div>
  );
}
