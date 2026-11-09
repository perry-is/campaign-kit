import { useStore } from "../data/store";
import { Pill, Toggle } from "../ui/kit";
import { BrandSettings } from "./BrandSettings";
import { OpenAISettings } from "./OpenAISettings";
import { SecuritySettings } from "./SecuritySettings";

const CONNECTIONS = [
  { id: "eventbrite", name: "Eventbrite", detail: "Private token + organization" },
  { id: "instagram", name: "Instagram", detail: "Professional account via Meta" },
  { id: "linkedin", name: "LinkedIn", detail: "Company page admin" },
  { id: "meetup", name: "Meetup", detail: "Practice mode only for now" },
];

export function SettingsView() {
  const { dryRun, setDryRun } = useStore();
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <div className="sub">Brand, accounts and publishing safety.</div>
        </div>
      </div>

      <BrandSettings />

      <div className="card">
        <div>
          <h2>Accounts</h2>
          <p className="muted small">Keys are encrypted with this Mac's Keychain and never shown again.</p>
        </div>
        <div className="checklist">
          <OpenAISettings />
          {CONNECTIONS.map((c) => (
            <div className="dest" key={c.id}>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{c.name}</div>
                <div className="muted small">{c.detail}</div>
              </div>
              <Pill>Not connected</Pill>
              <button className="btn small" disabled>Connect</button>
              <button className="btn small ghost" disabled>Test</button>
            </div>
          ))}
        </div>
      </div>

      <SecuritySettings />

      <div className="card">
        <Toggle checked={dryRun} onChange={setDryRun} label={<><strong>Practice mode</strong> <span className="muted small">— run the whole flow without posting anything live</span></>} />
      </div>
    </div>
  );
}
