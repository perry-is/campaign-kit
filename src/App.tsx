import { useEffect, useState } from "react";
import { CampaignView } from "./CampaignView";
import { isBlankDraft } from "./data/model";
import { shortDate } from "./data/when";
import { StoreProvider, useStore } from "./data/store";
import { LockGate } from "./lock/LockGate";
import { lockApi } from "./lock/lockApi";
import { SettingsView } from "./settings/SettingsView";
import { renderAppIcon } from "./theme/appIcon";
import { applyBrand } from "./theme/brand";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { Empty } from "./ui/kit";

type View = { kind: "home" } | { kind: "campaign"; id: string } | { kind: "settings" };

function Shell() {
  const { brand, campaigns, newCampaign, dryRun, saveError } = useStore();
  const [view, setView] = useState<View>({ kind: "home" });

  useEffect(() => applyBrand(brand), [brand]);

  // In the desktop app, the Dock icon follows the active client's saved brand.
  useEffect(() => {
    if (!window.ckDesktop) return;
    let live = true;
    renderAppIcon(brand)
      .then((png) => {
        if (live) void window.ckDesktop?.setAppIcon(png);
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, [brand]);

  const mine = campaigns.filter((c) => c.brandId === brand.id && !c.deletedAt);
  const current = view.kind === "campaign" ? mine.find((c) => c.id === view.id) : undefined;
  // New event: reuse an empty draft if there is one, and always show where to start typing.
  const start = () => {
    const draft = mine.find(isBlankDraft);
    setView({ kind: "campaign", id: draft ? draft.id : newCampaign().id });
    setTimeout(() => {
      const box = document.querySelector<HTMLTextAreaElement>(".intake-text");
      if (!box) return;
      box.focus();
      box.classList.remove("pulse");
      void box.offsetWidth; // restart the animation
      box.classList.add("pulse");
    }, 60);
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand-mark">
          <img src={brand.logoUrl} alt={brand.name} />
        </div>
        <button className="btn primary" onClick={start}>+ New event</button>

        <div className="side-section">Events</div>
        <div className="side-list">
          {mine.length === 0 && <div className="muted small" style={{ padding: "4px 10px" }}>None yet</div>}
          {mine.map((c) => (
            <button
              key={c.id}
              className={`side-item${view.kind === "campaign" && view.id === c.id ? " active" : ""}`}
              onClick={() => setView({ kind: "campaign", id: c.id })}
            >
              <span className="t">{c.facts.title || "New event"}</span>
              <span className="s">
                {shortDate(c.facts.start)} · {c.step}
              </span>
            </button>
          ))}
        </div>

        <div className="side-foot">
          {dryRun && <div className="pill warn" style={{ margin: "0 6px 6px" }}><span className="dot" />Practice mode</div>}
          <button className={`side-item${view.kind === "settings" ? " active" : ""}`} onClick={() => setView({ kind: "settings" })}>
            <span className="t">Settings</span>
          </button>
          {lockApi() && (
            <button className="side-item" onClick={() => void lockApi()!.lock()}>
              <span className="t">🔒 Lock now</span>
            </button>
          )}
        </div>
      </aside>

      <main className="main">
        {saveError && <div className="save-error">{saveError} Keep the app open and try again; if it continues, restart the app.</div>}
        {view.kind === "settings" ? (
          <SettingsView />
        ) : current ? (
          <CampaignView key={current.id} campaign={current} />
        ) : (
          <div className="page">
            <Empty title={`Welcome to ${brand.name}`} action={<button className="btn primary" onClick={start}>Start an event</button>}>
              Paste the event details, check the facts, get posts and a poster, approve, publish.
            </Empty>
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <StoreProvider>
        <LockGate>
          <Shell />
        </LockGate>
      </StoreProvider>
    </ErrorBoundary>
  );
}
