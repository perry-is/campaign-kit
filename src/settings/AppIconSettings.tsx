import { useEffect, useState } from "react";
import { makeIconArt, matchBrandFont } from "../ai/tasks";
import { useAI, useAIJob } from "../ai/useAI";
import { aiReady } from "../ui/ai";
import { renderAppIcon } from "../theme/appIcon";
import { type BrandIcon, type BrandProfile, DEFAULT_ICON } from "../theme/brand";
import { FONTS } from "../theme/fonts";
import { Field, Toggle } from "../ui/kit";
import { waitForImage } from "../ui/loadImage";

/** Any image source (relative path, blob, data URL) as a PNG data URL for the AI. */
async function toPngDataUrl(src: string): Promise<string> {
  const img = await waitForImage(new Image(), src);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext("2d")!.drawImage(img, 0, 0);
  return c.toDataURL("image/png");
}

export function AppIconSettings({ draft, setDraft }: { draft: BrandProfile; setDraft: (f: (d: BrandProfile) => BrandProfile) => void }) {
  const icon = draft.icon ?? DEFAULT_ICON;
  const ai = useAI();
  const job = useAIJob();
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const desktop = typeof window !== "undefined" && !!window.ckDesktop;

  const setIcon = (patch: Partial<BrandIcon>) => setDraft((d) => ({ ...d, icon: { ...(d.icon ?? DEFAULT_ICON), ...patch } }));

  // Redraw the preview whenever anything that affects it changes.
  useEffect(() => {
    let live = true;
    renderAppIcon(draft).then((png) => live && setPreview(png)).catch(() => live && setPreview(null));
    return () => { live = false; };
  }, [draft]);

  function matchFont() {
    if (!aiReady(ai)) return;
    void job.run("Studying the logo lettering…", async () => {
      const m = await matchBrandFont(ai.ai, await toPngDataUrl(draft.logoUrl), FONTS);
      setIcon({ fontId: m.fontId, uppercase: m.uppercase, letterSpacing: m.letterSpacing });
      setNote(`Matched ${FONTS.find((f) => f.id === m.fontId)?.family}: ${m.reason}`);
    });
  }

  function makeArt() {
    if (!aiReady(ai)) return;
    void job.run("Drawing the icon art (about 30 seconds)…", async () => {
      const art = await makeIconArt(ai.ai, await toPngDataUrl(draft.logoUrl), draft.palette.background);
      setIcon({ style: "ai", aiArtUrl: art });
      setNote("AI icon art ready. Switch back to the plain emblem any time.");
    });
  }

  function useAsAppIcon() {
    if (!preview || !window.ckDesktop) return;
    void job.run("Setting the app icon…", async () => {
      const r = await window.ckDesktop!.setAppIcon(preview);
      if (!r.ok) throw new Error(r.error.message);
      setNote("Done. The Dock icon is updated and will stay this way on the next launch.");
    });
  }

  return (
    <div className="icon-settings">
      <div className="icon-preview">
        {preview ? <img src={preview} alt="App icon preview" /> : <div className="muted small">Drawing…</div>}
        <div className="row" style={{ gap: 14, justifyContent: "center" }}>
          {preview && [64, 32].map((s) => <img key={s} src={preview} width={s} height={s} alt="" title={`${s}px, Dock size`} />)}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <div className="grid-2">
          <Field label="Word under the logo">
            <input value={icon.word} maxLength={12} onChange={(e) => setIcon({ word: e.target.value })} placeholder="Promo" />
          </Field>
          <Field label="Font">
            <select value={icon.fontId} onChange={(e) => setIcon({ fontId: e.target.value })}>
              {FONTS.map((f) => (
                <option key={f.id} value={f.id}>{f.family}</option>
              ))}
            </select>
          </Field>
          <Field label="Word color">
            <select value={icon.wordFill} onChange={(e) => setIcon({ wordFill: e.target.value as BrandIcon["wordFill"] })}>
              <option value="accent">Accent 2</option>
              <option value="gradient">Gradient</option>
              <option value="highlight">Highlight</option>
              <option value="text">White</option>
            </select>
          </Field>
          <Field label="Artwork">
            <select value={icon.style} onChange={(e) => setIcon({ style: e.target.value as BrandIcon["style"] })}>
              <option value="emblem">Emblem from logo</option>
              <option value="ai" disabled={!icon.aiArtUrl}>AI icon art</option>
            </select>
          </Field>
        </div>
        <Toggle checked={icon.uppercase} onChange={(v) => setIcon({ uppercase: v })} label="All capitals" />

        <div className="row">
          <button className="btn small" onClick={matchFont} disabled={!aiReady(ai) || !!job.busy}>Match the brand font</button>
          <button className="btn small" onClick={makeArt} disabled={!aiReady(ai) || ai.practice || !!job.busy} title="Uses one AI image">
            {icon.aiArtUrl ? "Redraw AI art" : "AI icon art"} · 1 image
          </button>
          {desktop && (
            <button className="btn small primary" onClick={useAsAppIcon} disabled={!preview || !!job.busy}>Use as app icon</button>
          )}
        </div>
        {job.busy && <div className="notice"><span className="spinner" /> {job.busy}</div>}
        {job.error && <div className="notice error">{job.error}</div>}
        {note && !job.busy && !job.error && <div className="notice">{note}</div>}
        {!aiReady(ai) && <div className="muted small">Connect OpenAI in Accounts to match the font or draw AI art.</div>}
      </div>
    </div>
  );
}
