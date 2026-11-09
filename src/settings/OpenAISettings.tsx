import { useState } from "react";
import { unwrap } from "../ai/bridge";
import { TEXT_MODEL } from "../ai/prompts";
import { notifyKeyChanged, useAI, useAIJob } from "../ai/useAI";
import { usePasswordCheck } from "../lock/usePasswordCheck";
import { Pill } from "../ui/kit";

/** OpenAI key: pasted once, checked against the model, then kept encrypted by the Mac's Keychain. */
export function OpenAISettings() {
  const ai = useAI();
  const job = useAIJob();
  const check = usePasswordCheck();
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const connected = ai.state === "ready" && !ai.practice;
  const canEdit = ai.state === "ready" ? !ai.practice : ai.state === "no-key";

  async function save() {
    if (ai.state !== "no-key" && ai.state !== "ready") return;
    const transport = ai.ai;
    if (!(await check.ask("Confirm it's you before saving an API key."))) return;
    void job.run("Checking the key…", async () => {
      unwrap(await transport.setKey(key.trim(), TEXT_MODEL));
      setKey("");
      setMsg("Connected. The key is saved securely on this Mac.");
      notifyKeyChanged();
    });
  }

  function test() {
    if (ai.state !== "ready") return;
    const transport = ai.ai;
    void job.run("Testing…", async () => {
      unwrap(await transport.test(TEXT_MODEL));
      setMsg(`Working: the key can use ${TEXT_MODEL}.`);
    });
  }

  async function remove() {
    if (ai.state !== "ready" || !confirm("Remove the OpenAI key from this Mac?")) return;
    const transport = ai.ai;
    if (!(await check.ask("Confirm it's you before removing an API key."))) return;
    void job.run("Removing…", async () => {
      unwrap(await transport.clearKey());
      setMsg(null);
      notifyKeyChanged();
    });
  }

  return (
    <div className="dest" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
      <div className="row">
        <div className="grow" style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>OpenAI</div>
          <div className="muted small">Writes facts, titles and posts with {TEXT_MODEL}, using your own API key</div>
        </div>
        {connected ? <Pill tone="ok">Connected</Pill> : ai.state === "ready" && ai.practice ? <Pill tone="warn">Practice AI</Pill> : <Pill>Not connected</Pill>}
        {connected && (
          <>
            <button className="btn small" onClick={test} disabled={!!job.busy}>Test</button>
            <button className="btn small ghost" onClick={() => void remove()} disabled={!!job.busy}>Remove</button>
          </>
        )}
      </div>

      {!connected && canEdit && (
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Paste your API key (sk-…)"
            onKeyDown={(e) => { if (e.key === "Enter" && key.trim()) void save(); }}
          />
          {window.ckDesktop && (
            <button
              className="btn small"
              type="button"
              onClick={async () => {
                const r = await window.ckDesktop!.readClipboard();
                if (r.ok) setKey(r.data.trim());
              }}
            >
              Paste
            </button>
          )}
          <button className="btn small primary" disabled={!key.trim() || !!job.busy} onClick={() => void save()}>Connect</button>
        </div>
      )}
      {!canEdit && <div className="muted small">Open the desktop app to connect OpenAI. In this browser preview, a practice AI stands in.</div>}
      {!connected && canEdit && (
        <div className="muted small">
          Get a key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">platform.openai.com/api-keys</a>. It's checked before saving and never leaves this Mac except to talk to OpenAI.
        </div>
      )}
      {job.busy && <div className="notice"><span className="spinner" /> {job.busy}</div>}
      {job.error && <div className="notice error">{job.error}</div>}
      {msg && !job.error && !job.busy && <div className="notice">{msg}</div>}
      {check.dialog}
    </div>
  );
}
