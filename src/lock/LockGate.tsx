import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useStore } from "../data/store";
import { applyBrand } from "../theme/brand";
import { NetworkArt } from "../ui/kit";
import { type LockStatus, MIN_PASSWORD, lockApi } from "./lockApi";

/** Shows the lock screen until the app is unlocked. In a plain browser there is no lock. */
export function LockGate({ children }: { children: ReactNode }) {
  const api = lockApi();
  const [status, setStatus] = useState<LockStatus | null>(api ? null : { hasPassword: true, unlocked: true });

  useEffect(() => {
    if (!api) return;
    void api.status().then((r) => r.ok && setStatus(r.data));
    return api.onChange(setStatus);
  }, [api]);

  if (!status) return <div className="lock-screen" />;
  if (status.unlocked) return <>{children}</>;
  // key: start fresh (setup vs unlock) whenever the password state changes
  return <LockScreen key={String(status.hasPassword)} hasPassword={status.hasPassword} onDone={(s) => setStatus(s)} />;
}

function LockScreen({ hasPassword, onDone }: { hasPassword: boolean; onDone: (s: LockStatus) => void }) {
  const api = lockApi()!;
  const { brand } = useStore();
  const [mode, setMode] = useState<"unlock" | "setup" | "forgot">(hasPassword ? "unlock" : "setup");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [confirmWord, setConfirmWord] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => applyBrand(brand), [brand]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "setup") {
      if (pw.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
      if (pw !== pw2) return setError("The two passwords don't match.");
    }
    setBusy(true);
    const r =
      mode === "setup" ? await api.setup(pw) : mode === "unlock" ? await api.unlock(pw) : await api.reset(confirmWord);
    setBusy(false);
    if (!r.ok) {
      setError(r.error.message);
      return;
    }
    if (mode === "forgot") {
      setMode("setup");
      setPw("");
      setPw2("");
      setConfirmWord("");
      return;
    }
    onDone({ hasPassword: true, unlocked: true });
  }

  return (
    <div className="lock-screen">
      <NetworkArt className="lock-art" seed={11} />
      <form className="lock-card" onSubmit={submit}>
        <img src={brand.logoUrl} alt={brand.name} className="lock-logo" />
        {mode === "setup" && (
          <>
            <h2>Create a password</h2>
            <p className="muted small">You'll enter it each time the app opens, and again before changing API keys.</p>
            <input type="password" autoFocus autoComplete="new-password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <input type="password" autoComplete="new-password" placeholder="Type it again" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </>
        )}
        {mode === "unlock" && (
          <>
            <h2>Welcome back</h2>
            <input type="password" autoFocus autoComplete="current-password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </>
        )}
        {mode === "forgot" && (
          <>
            <h2>Forgot your password?</h2>
            <p className="muted small">
              You can set a new one, but for safety this <strong>erases the saved API keys</strong> (OpenAI and connected
              accounts). You'll paste them in again. Your events and brands stay.
            </p>
            <input autoFocus placeholder="Type RESET to confirm" value={confirmWord} onChange={(e) => setConfirmWord(e.target.value)} />
          </>
        )}

        {error && <div className="notice error">{error}</div>}

        <button className="btn primary" type="submit" disabled={busy || (mode === "forgot" ? confirmWord !== "RESET" : !pw)}>
          {busy ? "One moment…" : mode === "setup" ? "Create password" : mode === "unlock" ? "Unlock" : "Erase keys and start over"}
        </button>
        {mode === "unlock" && (
          <button type="button" className="link-btn" onClick={() => { setMode("forgot"); setError(null); }}>Forgot password?</button>
        )}
        {mode === "forgot" && (
          <button type="button" className="link-btn" onClick={() => { setMode("unlock"); setError(null); }}>Back</button>
        )}
      </form>
    </div>
  );
}
