import { type FormEvent, useCallback, useRef, useState } from "react";
import { lockApi } from "./lockApi";

/**
 * Ask for the password again before a sensitive action (API keys).
 * `ask()` resolves true once the password is confirmed, false if cancelled.
 * Render `dialog` somewhere in the component.
 */
export function usePasswordCheck() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback((why: string) => {
    if (!lockApi()) return Promise.resolve(true); // browser preview: no lock
    setReason(why);
    setPw("");
    setError(null);
    setOpen(true);
    return new Promise<boolean>((res) => { resolver.current = res; });
  }, []);

  const finish = (ok: boolean) => {
    setOpen(false);
    resolver.current?.(ok);
    resolver.current = null;
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await lockApi()!.recheck(pw);
    setBusy(false);
    if (r.ok) finish(true);
    else setError(r.error.message);
  }

  const dialog = open ? (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && finish(false)}>
      <form className="modal" onSubmit={submit}>
        <h2>Enter your password</h2>
        <p className="muted small">{reason}</p>
        <input type="password" autoFocus autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" />
        {error && <div className="notice error">{error}</div>}
        <div className="row spread">
          <button type="button" className="btn ghost" onClick={() => finish(false)}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!pw || busy}>{busy ? "Checking…" : "Continue"}</button>
        </div>
      </form>
    </div>
  ) : null;

  return { ask, dialog };
}
