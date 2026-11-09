import { useEffect, useRef, useState } from "react";
import { useStore } from "../data/store";
import { newId, now } from "../data/model";
import { applyBrand, brandCssVars, type BrandPalette, type BrandProfile } from "../theme/brand";
import { extractBrandFromImage, type Swatch } from "../theme/extract";
import { Field } from "../ui/kit";
import { AppIconSettings } from "./AppIconSettings";
import { BrandStyleEditor } from "../style/StyleExamples";

const ROLES: { key: keyof BrandPalette; label: string }[] = [
  { key: "background", label: "Background" },
  { key: "accentFrom", label: "Accent 1" },
  { key: "accentTo", label: "Accent 2" },
  { key: "highlight", label: "Highlight" },
  { key: "text", label: "Text" },
];

/** Edit a brand profile. Dropping a logo suggests a full palette from its colors. */
export function BrandSettings() {
  const { brand, brands, saveBrand, setActiveBrand } = useStore();
  const [draft, setDraft] = useState<BrandProfile>(brand);
  const [swatches, setSwatches] = useState<Swatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset the draft only when switching clients, so instant saves (style examples) don't wipe other edits.
  useEffect(() => setDraft(brand), [brand.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live preview: the whole app takes on the draft colors while editing.
  useEffect(() => {
    applyBrand(draft);
    return () => applyBrand(brand);
  }, [draft, brand]);

  async function onLogo(file: File) {
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = () => rej(r.error);
        r.readAsDataURL(file);
      });
      const { swatches, palette } = await extractBrandFromImage(dataUrl);
      setSwatches(swatches);
      setDraft((d) => ({ ...d, logoUrl: dataUrl, palette }));
    } catch {
      setError("Couldn't read that image. Try a PNG or JPG.");
    } finally {
      setBusy(false);
    }
  }

  async function reExtract() {
    setBusy(true);
    try {
      const { swatches, palette } = await extractBrandFromImage(draft.logoUrl);
      setSwatches(swatches);
      setDraft((d) => ({ ...d, palette }));
    } finally {
      setBusy(false);
    }
  }

  const strip = (b: BrandProfile) => JSON.stringify({ ...b, updatedAt: "" });
  const dirty = strip(draft) !== strip(brand);
  const setPalette = (k: keyof BrandPalette, v: string) => setDraft((d) => ({ ...d, palette: { ...d.palette, [k]: v } }));

  return (
    <div className="card">
      <div className="row spread">
        <div>
          <h2>Brand</h2>
          <p className="muted small">Drop a client's logo and the app picks up their colors.</p>
        </div>
        <div className="row">
          <select value={brand.id} onChange={(e) => setActiveBrand(e.target.value)} style={{ width: "auto" }}>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <button
            className="btn small"
            onClick={() => {
              const b: BrandProfile = { ...brand, id: newId(), name: "New client", updatedAt: now() };
              saveBrand(b);
              setActiveBrand(b.id);
            }}
          >
            + New client
          </button>
        </div>
      </div>

      <div className="grid-2">
        <div
          className="dropzone"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void onLogo(f);
          }}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}
        >
          <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])} />
          <img src={draft.logoUrl} alt="" style={{ maxWidth: 180, maxHeight: 130, objectFit: "contain" }} />
          <span className="small">{busy ? "Reading colors…" : "Drop a logo here, or click"}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Client name">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="Default venue">
            <input value={draft.defaultVenue.name} onChange={(e) => setDraft({ ...draft, defaultVenue: { ...draft.defaultVenue, name: e.target.value } })} />
          </Field>
          <Field label="Venue address">
            <input value={draft.defaultVenue.address} onChange={(e) => setDraft({ ...draft, defaultVenue: { ...draft.defaultVenue, address: e.target.value } })} />
          </Field>
        </div>
      </div>

      {error && <div className="notice">{error}</div>}

      <div className="row spread">
        <div className="swatches">
          {ROLES.map((r) => (
            <div className="swatch" key={r.key}>
              <div className="chip" style={{ background: draft.palette[r.key] }}>
                <input type="color" value={draft.palette[r.key]} onChange={(e) => setPalette(r.key, e.target.value)} aria-label={r.label} />
              </div>
              {r.label}
            </div>
          ))}
        </div>
        <button className="btn small ghost" onClick={reExtract} disabled={busy}>Re-read logo colors</button>
      </div>

      {swatches.length > 0 && (
        <div className="row small muted" style={{ gap: 6 }}>
          Found in logo:
          {swatches.slice(0, 10).map((s) => (
            <span key={s.hex} title={`${s.hex} · ${Math.round(s.share * 100)}%`} style={{ width: 18, height: 18, borderRadius: 5, background: s.hex, border: "1px solid var(--line)" }} />
          ))}
        </div>
      )}

      <ThemePreview palette={draft.palette} />

      <div>
        <h2 style={{ fontSize: 16 }}>Poster style</h2>
        <p className="muted small">Show the AI the look this client wants. It learns from examples and from your tweaks. Saved automatically.</p>
      </div>
      <BrandStyleEditor
        style={draft.style}
        brandName={draft.name}
        onChange={(style) => {
          // Style examples and rules save immediately; no need to press Save brand.
          setDraft((d) => ({ ...d, style }));
          saveBrand({ ...brand, style });
        }}
      />

      <div>
        <h2 style={{ fontSize: 16 }}>App icon</h2>
        <p className="muted small">The logo's emblem with a short word underneath, in the brand's font.</p>
      </div>
      <AppIconSettings draft={draft} setDraft={setDraft} />

      <Field label="Writing voice (given to the AI)">
        <textarea rows={3} value={draft.voice} onChange={(e) => setDraft({ ...draft, voice: e.target.value })} />
      </Field>

      <div className="row spread">
        <button className="btn ghost" disabled={!dirty} onClick={() => setDraft(brand)}>Undo changes</button>
        <button className="btn primary" disabled={!dirty} onClick={() => saveBrand(draft)}>Save brand</button>
      </div>
    </div>
  );
}

function ThemePreview({ palette }: { palette: BrandPalette }) {
  const vars = brandCssVars(palette) as React.CSSProperties;
  return (
    <div className="theme-preview" style={{ ...vars, background: "var(--bg)", color: "var(--text)" }}>
      <div style={{ height: 4, borderRadius: 4, background: "var(--accent-gradient)" }} />
      <div className="row spread">
        <strong>Holiday Mixer · Dec 4</strong>
        <span className="pill" style={{ color: "var(--highlight)" }}><span className="dot" />Approved</span>
      </div>
      <p style={{ color: "var(--muted)" }} className="small">This is how screens and buttons will look for this client.</p>
      <div className="row">
        <span className="btn primary small">Primary action</span>
        <span className="btn small">Secondary</span>
      </div>
    </div>
  );
}
