import { useState } from "react";
import { POSTER_LAYOUTS, POSTER_MODELS, type FlyerShape, type PosterQuality } from "../ai/prompts";
import { MAX_STYLE_REFS, checkPosterArt, factCheckPoster, makeDesignedFlyer, makePosterArt, makeRemixFlyer, refinePosterArt, relayoutFlyer, ruleFromTweak, shapeFor } from "../ai/tasks";
import { useAI } from "../ai/useAI";
import { newId, now, type Poster } from "../data/model";
import { hasStart, splitWhen, whenNotice } from "../data/when";
import { useStore } from "../data/store";
import { composePoster, loadImage, type PosterFormat } from "../poster/compose";
import { PosterImage, downloadDataUrl, imageToDataUrl, slug } from "../poster/PosterImage";
import { PLATFORMS, missingVersion, pickSource } from "../poster/platforms";
import { posterText, requiredLines } from "../poster/text";
import { BrandStyleEditor, ExampleGrid, removeExampleFile } from "../style/StyleExamples";
import { EMPTY_STYLE } from "../theme/brand";
import { AIBadge, AINotice, aiReady } from "../ui/ai";
import { Empty, Pill } from "../ui/kit";
import type { StepProps } from "./types";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

const MODES: { id: Poster["style"]; label: string; hint: string }[] = [
  { id: "designed", label: "AI designs the flyer", hint: "The AI designs the whole flyer in your brand's style, text included. Each one is fact-checked." },
  { id: "typeset", label: "Exact text", hint: "The AI paints the scene; the app sets every word, so the facts are always right." },
  { id: "remix", label: "Remix a past flyer", hint: "The AI redesigns one of your example flyers for this event. Each one is fact-checked." },
];
/** One-click starting points for changes; ones ending in a space wait for you to finish the sentence. */
const QUICK_CHANGES = [
  { label: "Brand colors as accents only", text: "Use the brand colors only as accents; let the photo's natural colors lead." },
  { label: "Different colors…", text: "Use these colors instead of the brand colors: " },
  { label: "Lighter background", text: "Switch to a bright, light background with dark text." },
  { label: "Less text, bigger photo", text: "Make the photo bigger and the layout less busy; keep every fact." },
  { label: "Different photo…", text: "Replace the photo with " },
];

const modeLabel = (s: Poster["style"]) => MODES.find((m) => m.id === s)?.label ?? "AI text";

function CheckBadge({ p }: { p: Poster }) {
  if (p.status !== "ready") return null;
  const textMode = p.style !== "typeset";
  if (p.factCheck === "passed") return <Pill tone="ok">{textMode ? "Facts checked" : "Clean art"}</Pill>;
  if (p.factCheck === "failed") return <Pill tone="bad">{textMode ? "Fact problem" : "Stray text"}</Pill>;
  if (p.factCheck === "pending") return <Pill>Checking…</Pill>;
  return <Pill tone="warn">Not checked</Pill>;
}

export function PosterStep({ campaign, update, next, back }: StepProps) {
  const { brand, saveBrand, campaigns } = useStore();
  const [shape, setShape] = useState<FlyerShape>("wide");
  const [remixPick, setRemixPick] = useState<string>("mix"); // "mix" = a different flyer for each of the 3
  const ai = useAI();
  const [pendingRule, setPendingRule] = useState<string | null>(null);
  const [style, setStyle] = useState<Poster["style"]>("designed");
  const [quality, setQuality] = useState<PosterQuality>("best");
  const [instruction, setInstruction] = useState("");
  const [format, setFormat] = useState<PosterFormat>("portrait");
  const [error, setError] = useState<string | null>(null);

  const facts = campaign.facts;
  const posters = campaign.posters;
  const selected = posters.find((p) => p.id === campaign.selectedPosterId) ?? null;
  const factsReady = !!facts.title.trim() && hasStart(facts.start);
  const working = posters.some((p) => p.status === "generating");

  const patchPoster = (id: string, patch: Partial<Poster>) =>
    update((c) => ({ ...c, posters: c.posters.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));

  async function runCheck(id: string, src: string, s: Poster["style"]) {
    if (!aiReady(ai)) return;
    try {
      const img = await imageToDataUrl(src, s === "typeset" ? 1024 : 1536);
      if (s !== "typeset") {
        const r = await factCheckPoster(ai.ai, img, requiredLines(posterText(facts)), s === "full" ? [] : brandStyle.phrases ?? [], facts.description);
        patchPoster(id, { factCheck: r.ok ? "passed" : "failed", checkNote: r.problems.join(" ") });
      } else {
        const r = await checkPosterArt(ai.ai, img);
        patchPoster(id, { factCheck: r.ok ? "passed" : "failed", checkNote: r.note });
      }
    } catch {
      patchPoster(id, { factCheck: "skipped", checkNote: "Couldn't run the check." });
    }
  }

  const brandStyle = brand.style ?? EMPTY_STYLE;

  // Experiment scorecard: text-check results per mode, across this brand's events.
  const allPosters = campaigns.filter((c) => c.brandId === brand.id && !c.deletedAt).flatMap((c) => c.posters);
  const score = (["designed", "remix", "full"] as const)
    .map((m) => {
      const done = allPosters.filter((x) => x.style === m && (x.factCheck === "passed" || x.factCheck === "failed"));
      return { m, passed: done.filter((x) => x.factCheck === "passed").length, total: done.length };
    })
    .filter((x) => x.total > 0);
  const styleCount = brandStyle.examples.length;
  const partners = campaign.partners ?? [];
  const partnerSrcs = partners.map((x) => x.src);

  let lastPicks: { name: string; src: string }[] = [];
  /** A different mix of the brand's examples each set (up to 3), as data URLs for the image API. */
  async function styleRefs(): Promise<string[]> {
    const all = [...brandStyle.examples];
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    const picks = all.slice(0, MAX_STYLE_REFS);
    lastPicks = picks;
    const out: string[] = [];
    for (const ex of picks) {
      try { out.push(await imageToDataUrl(ex.src, 1024)); } catch { /* skip unreadable example */ }
    }
    return out;
  }

  const topic = () => [facts.title, facts.description.split(/(?<=[.!?])\s/)[0]].filter(Boolean).join(": ").slice(0, 300);

  /** B: the AI designs the whole flyer, with the brand's examples as references. */
  async function design(p: Poster, variant: number, examples: { name: string; src: string; data: string }[]) {
    if (!aiReady(ai)) return;
    try {
      const r = await makeDesignedFlyer(ai.ai, {
        brandName: brand.name, palette: brand.palette, topic: topic(), direction: campaign.creativeDirection ?? "",
        summary: brandStyle.summary, rules: brandStyle.rules.map((x) => x.text), phrases: brandStyle.phrases ?? [],
        lines: requiredLines(posterText(facts)), description: facts.description, hasPartners: partners.length > 0, refCount: examples.length, variant,
        quality, shape: p.shape ?? "wide", examples: examples.map((e) => e.data), saveAs: `poster-${p.id}`,
      });
      patchPoster(p.id, { src: r.url, prompt: r.prompt, model: r.model, status: "ready", refs: examples.map((e) => ({ kind: "example", name: e.name, src: e.src })) });
      await runCheck(p.id, r.url, p.style);
    } catch (e) {
      patchPoster(p.id, { status: "failed", error: errMsg(e) });
    }
  }

  /** C: the AI redesigns one past flyer for this event. */
  async function remix(p: Poster, base: { name: string; src: string; data: string; shape: FlyerShape }) {
    if (!aiReady(ai)) return;
    try {
      const r = await makeRemixFlyer(ai.ai, {
        topic: topic(), direction: campaign.creativeDirection ?? "", rules: brandStyle.rules.map((x) => x.text),
        phrases: brandStyle.phrases ?? [], lines: requiredLines(posterText(facts)), description: facts.description, hasPartners: partners.length > 0,
        quality, shape: base.shape, base: base.data, saveAs: `poster-${p.id}`,
      });
      patchPoster(p.id, { src: r.url, prompt: r.prompt, model: r.model, status: "ready", refs: [{ kind: "base", name: base.name, src: base.src }] });
      await runCheck(p.id, r.url, p.style);
    } catch (e) {
      patchPoster(p.id, { status: "failed", error: errMsg(e) });
    }
  }

  async function exampleData(ex: { name: string; src: string }) {
    const img = await loadImage(ex.src);
    return { ...ex, data: await imageToDataUrl(ex.src, 1536), shape: shapeFor(img.naturalWidth, img.naturalHeight) };
  }

  function shuffled<T>(xs: T[]): T[] {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  async function paint(p: Poster, variant: number, logoDataUrl: string, refs: string[]) {
    if (!aiReady(ai)) return;
    try {
      const r = await makePosterArt(ai.ai, {
        brandName: brand.name,
        palette: brand.palette,
        direction: campaign.creativeDirection ?? "",
        topic: [facts.title, facts.description.split(/(?<=[.!?])\s/)[0]].filter(Boolean).join(": ").slice(0, 300),
        layout: p.layout,
        variant,
        textLines: p.style === "full" ? requiredLines(posterText(facts)) : undefined,
        quality,
        logoDataUrl,
        styleRefs: refs,
        styleSummary: brandStyle.summary,
        styleRules: brandStyle.rules.map((r) => r.text),
        saveAs: `poster-${p.id}`,
      });
      patchPoster(p.id, {
        src: r.url, prompt: r.prompt, model: r.model, status: "ready",
        refs: [{ kind: "logo", name: `${brand.name} logo`, src: brand.logoUrl }, ...lastPicks.map((e) => ({ kind: "example" as const, name: e.name, src: e.src }))],
      });
      await runCheck(p.id, r.url, p.style);
    } catch (e) {
      patchPoster(p.id, { status: "failed", error: errMsg(e) });
    }
  }

  async function createThree() {
    if (!aiReady(ai) || !factsReady) return;
    setError(null);
    let logoDataUrl: string;
    try {
      logoDataUrl = await imageToDataUrl(brand.logoUrl, 1024, "image/png");
    } catch {
      return setError("Couldn't read the brand logo. Check it in Settings → Brand.");
    }
    if (style !== "typeset" && brandStyle.examples.length === 0) {
      return setError(`Add some of ${brand.name}'s past flyers to the style examples first; this mode learns from them.`);
    }

    // Remix: which past flyers to redesign (a different one for each poster, or the one picked).
    let bases: Awaited<ReturnType<typeof exampleData>>[] = [];
    if (style === "remix") {
      const pool = remixPick === "mix" ? shuffled(brandStyle.examples) : brandStyle.examples.filter((e) => e.id === remixPick);
      const chosen = [0, 1, 2].map((i) => pool[i % pool.length]);
      bases = await Promise.all(chosen.map(exampleData));
    }

    const batch: Poster[] = POSTER_LAYOUTS.map((layout, i) => ({
      id: newId(), style, layout, src: "", prompt: "", model: POSTER_MODELS[quality],
      createdAt: now(), status: "generating", factCheck: "pending",
      shape: style === "typeset" ? "tall" : style === "remix" ? bases[i].shape : shape,
    }));
    update((c) => ({ ...c, posters: [...batch, ...c.posters] }));

    if (style === "designed") {
      const examples = await Promise.all(shuffled(brandStyle.examples).slice(0, 4).map(exampleData));
      await Promise.all(batch.map((p, i) => design(p, i, examples)));
    } else if (style === "remix") {
      await Promise.all(batch.map((p, i) => remix(p, bases[i])));
    } else {
      const refs = await styleRefs();
      await Promise.all(batch.map((p, i) => paint(p, i, logoDataUrl, refs)));
    }
  }

  async function retry(p: Poster) {
    if (!aiReady(ai)) return;
    patchPoster(p.id, { status: "generating", error: undefined, factCheck: "pending" });
    try {
      if (p.style === "designed") {
        await design(p, POSTER_LAYOUTS.indexOf(p.layout), await Promise.all(shuffled(brandStyle.examples).slice(0, 4).map(exampleData)));
      } else if (p.style === "remix") {
        const base = brandStyle.examples.find((e) => e.src === p.refs?.[0]?.src) ?? shuffled(brandStyle.examples)[0];
        await remix(p, await exampleData(base));
      } else {
        await paint(p, POSTER_LAYOUTS.indexOf(p.layout), await imageToDataUrl(brand.logoUrl, 1024, "image/png"), await styleRefs());
      }
    } catch (e) {
      patchPoster(p.id, { status: "failed", error: errMsg(e) });
    }
  }

  async function refine() {
    if (!aiReady(ai) || !selected || !instruction.trim()) return;
    setError(null);
    const child: Poster = {
      ...selected, id: newId(), src: "", prompt: "", status: "generating", factCheck: "pending",
      checkNote: undefined, error: undefined, createdAt: now(), parentId: selected.id, model: POSTER_MODELS[quality],
    };
    update((c) => ({ ...c, posters: [child, ...c.posters], selectedPosterId: child.id }));
    const said = instruction;
    setInstruction("");
    try {
      const r = await refinePosterArt(ai.ai, {
        sourceDataUrl: await imageToDataUrl(selected.src, 1536),
        instruction: said,
        layout: selected.layout,
        hasText: selected.style !== "typeset",
        quality,
        shape: selected.shape ?? "tall",
        saveAs: `poster-${child.id}`,
      });
      patchPoster(child.id, { src: r.url, prompt: r.prompt, model: r.model, status: "ready" });
      // Does this tweak sound like a lasting preference? Offer to remember it.
      void ruleFromTweak(ai.ai, said)
        .then((rule) => {
          if (rule && !brandStyle.rules.some((x) => x.text.toLowerCase() === rule.toLowerCase())) setPendingRule(rule);
        })
        .catch(() => undefined);
      await runCheck(child.id, r.url, child.style);
    } catch (e) {
      patchPoster(child.id, { status: "failed", error: errMsg(e) });
    }
  }

  function remove(p: Poster) {
    update((c) => ({
      ...c,
      posters: c.posters.filter((x) => x.id !== p.id),
      selectedPosterId: c.selectedPosterId === p.id ? null : c.selectedPosterId,
    }));
    if (p.src.startsWith("ck-media://")) void window.ckDesktop?.media.remove(p.src);
  }

  /** The selected poster, minus any re-laid-out version that failed its fact-check. */
  const usable = selected && {
    ...selected,
    wideSrc: selected.versionCheck?.wide === "failed" ? undefined : selected.wideSrc,
    tallSrc: selected.versionCheck?.tall === "failed" ? undefined : selected.tallSrc,
  };
  const aiTextPoster = !!selected && selected.style !== "typeset";
  const needVersion = usable && aiTextPoster ? missingVersion(usable) : null;
  const [versionBusy, setVersionBusy] = useState(false);

  /** One image: the same AI-designed flyer re-laid out for the other shape, then fact-checked. */
  async function makeVersion(to: "wide" | "tall") {
    if (!aiReady(ai) || !selected) return;
    const id = selected.id;
    setVersionBusy(true);
    setError(null);
    patchPoster(id, { versionCheck: { ...selected.versionCheck, [to]: "pending" } });
    try {
      const r = await relayoutFlyer(ai.ai, {
        sourceDataUrl: await imageToDataUrl(selected.src, 1536),
        to, hasPartners: partners.length > 0, quality, saveAs: `poster-${newId()}`,
      });
      patchPoster(id, to === "wide" ? { wideSrc: r.url } : { tallSrc: r.url });
      const check = await factCheckPoster(ai.ai, await imageToDataUrl(r.url, 1536), requiredLines(posterText(facts)), brandStyle.phrases ?? [], facts.description);
      update((c) => ({
        ...c,
        posters: c.posters.map((p) =>
          p.id === id ? { ...p, versionCheck: { ...p.versionCheck, [to]: check.ok ? "passed" : "failed", note: check.problems.join(" ") } } : p,
        ),
      }));
    } catch (e) {
      setError(errMsg(e));
      update((c) => ({ ...c, posters: c.posters.map((p) => (p.id === id ? { ...p, versionCheck: { ...p.versionCheck, [to]: undefined } } : p)) }));
    } finally {
      setVersionBusy(false);
    }
  }

  async function renderFor(pf: (typeof PLATFORMS)[number]) {
    return composePoster({
      src: pickSource(usable!, pf.w, pf.h), style: usable!.style, layout: usable!.layout, brand,
      text: posterText(facts), format: "portrait", size: { w: pf.w, h: pf.h }, partners: partnerSrcs,
    });
  }
  const fileName = (pf: (typeof PLATFORMS)[number]) => `${slug(facts.title)}-${pf.id}-${pf.w}x${pf.h}.png`;

  /** Desktop: saves into ~/Downloads/<event>/ and opens it in Finder. Browser: normal downloads. */
  async function save(list: (typeof PLATFORMS)[number][]) {
    if (!usable) return;
    const files = [];
    for (const pf of list) files.push({ name: fileName(pf), dataUrl: await renderFor(pf) });
    if (window.ckDesktop) {
      const r = await window.ckDesktop.saveDownloads(facts.title || "CampaignKit event", files);
      if (!r.ok) setError(r.error.message);
    } else {
      for (const f of files) downloadDataUrl(f.dataUrl, f.name);
    }
  }
  const downloadOne = (pf: (typeof PLATFORMS)[number]) => save([pf]);
  const downloadAll = () => save(PLATFORMS);

  return (
    <div className="card">
      <div className="row spread">
        <div>
          <h2>Poster</h2>
          <p className="muted small">Three different takes at once. Pick the one you like.</p>
        </div>
        <AIBadge status={ai} />
      </div>

      <div className="poster-controls">
        <div className="mode-picker" role="radiogroup" aria-label="Poster mode">
          {MODES.map((m) => (
            <button key={m.id} role="radio" aria-checked={style === m.id} className={`mode${style === m.id ? " on" : ""}`} onClick={() => setStyle(m.id)}>
              <strong>{m.label}</strong>
              <span>{m.hint}</span>
            </button>
          ))}
        </div>
        <div className="row spread small">
          <div className="row" style={{ gap: 14 }}>
            {style === "designed" && (
              <label className="row" style={{ gap: 8 }}>
                Shape
                <select value={shape} onChange={(e) => setShape(e.target.value as FlyerShape)} style={{ width: "auto" }}>
                  <option value="wide">Wide (landscape)</option>
                  <option value="tall">Tall</option>
                  <option value="square">Square</option>
                </select>
              </label>
            )}
            {style === "remix" && (
              <label className="row" style={{ gap: 8 }}>
                Flyer to remix
                <select value={remixPick} onChange={(e) => setRemixPick(e.target.value)} style={{ width: "auto" }}>
                  <option value="mix">A different one for each</option>
                  {brandStyle.examples.map((e, i) => (
                    <option key={e.id} value={e.id}>{`#${i + 1} ${e.name}`.slice(0, 40)}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <label className="row" style={{ gap: 8 }}>
            Quality
            <select value={quality} onChange={(e) => setQuality(e.target.value as PosterQuality)} style={{ width: "auto" }}>
              <option value="best">Best (about 30 s)</option>
              <option value="fast">Fast (about 20 s)</option>
            </select>
          </label>
        </div>
        {score.length > 0 && (
          <div className="scorecard small">
            <strong>Text check so far</strong>
            {score.map((x) => (
              <span key={x.m}>
                {modeLabel(x.m)}: <b>{x.passed} of {x.total}</b> passed
              </span>
            ))}
          </div>
        )}
      </div>

      <details className="style-drop">
        <summary>
          {brand.name} style · {styleCount ? `${styleCount} example${styleCount === 1 ? "" : "s"}` : "no examples yet"}
          {brandStyle.rules.length ? ` · ${brandStyle.rules.length} rule${brandStyle.rules.length === 1 ? "" : "s"}` : ""}
          <span className="muted small"> (shows the AI the look you want, for every event)</span>
        </summary>
        <BrandStyleEditor style={brandStyle} brandName={brand.name} onChange={(next) => saveBrand({ ...brand, style: next })} />
      </details>

      <details className="style-drop" open={partners.length > 0}>
        <summary>
          Partner, sponsor &amp; ad materials · {partners.length ? `${partners.length} added` : "none"}
          <span className="muted small"> (this event)</span>
        </summary>
        <ExampleGrid
          items={partners}
          max={6}
          fit="contain"
          onAdd={(added) => update((c) => ({ ...c, partners: [...(c.partners ?? []), ...added] }))}
          onRemove={(ex) => {
            removeExampleFile(ex);
            update((c) => ({ ...c, partners: (c.partners ?? []).filter((x) => x.id !== ex.id) }));
          }}
          hint="Partner and sponsor logos for this event. The app places the exact files in a strip along the bottom of every poster; the AI never redraws them."
        />
      </details>

      {!factsReady && <div className="notice">Add a title and start date in Facts first; the poster is built from them.</div>}
      {factsReady && whenNotice(splitWhen(facts.start, facts.end)) && (
        <div className="notice warn-notice">{whenNotice(splitWhen(facts.start, facts.end))} (Fix it in Facts; posters update by themselves.)</div>
      )}
      <AINotice status={ai} />

      {posters.length === 0 ? (
        <Empty
          title="No posters yet"
          action={
            <button className="btn primary" disabled={!aiReady(ai) || !factsReady} onClick={() => void createThree()}>
              Create 3 posters
            </button>
          }
        >
          {MODES.find((m) => m.id === style)?.hint}
        </Empty>
      ) : (
        <>
          <div className="grid-3">
            {posters.slice(0, 9).map((p) => (
              <div key={p.id} className="poster-cell">
                <div
                  className={`poster-tile shape-${p.shape ?? "tall"}${campaign.selectedPosterId === p.id ? " selected" : ""}`}
                  onClick={() => p.status === "ready" && update((c) => ({ ...c, selectedPosterId: p.id }))}
                >
                  <PosterImage poster={p} facts={facts} brand={brand} partners={partnerSrcs} />
                </div>
                <div className="row spread small">
                  <div className="row" style={{ gap: 6 }}>
                    <CheckBadge p={p} />
                    <span className="muted">{modeLabel(p.style)}</span>
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    {p.status === "failed" && <button className="btn small" onClick={() => void retry(p)} disabled={!aiReady(ai)}>Retry</button>}
                    {p.status === "ready" && (p.factCheck === "failed" || p.factCheck === "skipped") && (
                      <button
                        className="btn small"
                        disabled={!aiReady(ai)}
                        title="Run the fact-check again (no new image)"
                        onClick={() => {
                          patchPoster(p.id, { factCheck: "pending", checkNote: undefined });
                          void runCheck(p.id, p.src, p.style);
                        }}
                      >
                        Check again
                      </button>
                    )}
                    {p.status !== "generating" && <button className="btn small ghost" onClick={() => remove(p)} aria-label="Delete poster">✕</button>}
                  </div>
                </div>
                {p.status === "failed" && p.error && <div className="small error-text">{p.error}</div>}
                {p.factCheck === "failed" && p.checkNote && <div className="small muted">{p.checkNote}</div>}
              </div>
            ))}
          </div>
          <div className="row spread">
            <span className="muted small">3 images · about 6¢ each · {quality === "best" ? "about 30 s" : "about 20 s"}</span>
            <button className="btn" disabled={!aiReady(ai) || !factsReady || working} onClick={() => void createThree()}>
              {working ? "Painting…" : "Create 3 more"}
            </button>
          </div>
        </>
      )}

      {selected && selected.status === "ready" && (
        <div className="poster-detail">
          <div className="poster-detail-image">
            <div className="tabs" style={{ marginBottom: 12 }}>
              <button className={`tab${format === "portrait" ? " active" : ""}`} onClick={() => setFormat("portrait")}>{selected.shape === "wide" ? "Flyer (wide)" : "Poster"}</button>
              <button className={`tab${format === "insta" ? " active" : ""}`} onClick={() => setFormat("insta")}>Instagram 4:5</button>
            </div>
            <div className={`poster-tile big ${format} shape-${format === "portrait" ? selected.shape ?? "tall" : "tall"}`}>
              <PosterImage poster={selected} facts={facts} brand={brand} format={format} partners={partnerSrcs} />
            </div>
          </div>
          <div className="poster-detail-side">
            <h2 style={{ fontSize: 16 }}>Change the selected poster</h2>
            <div className="chips">
              {QUICK_CHANGES.map((q) => (
                <button
                  key={q.label}
                  className="chip-tag chip-btn"
                  onClick={() => {
                    setInstruction(q.text);
                    if (q.text.endsWith(" ")) setTimeout(() => (document.querySelector(".poster-detail-side textarea") as HTMLTextAreaElement | null)?.focus(), 0);
                  }}
                >
                  {q.label}
                </button>
              ))}
            </div>
            <textarea rows={3} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. warmer light, more people, less busy background" />
            <button className="btn" disabled={!aiReady(ai) || !instruction.trim()} onClick={() => void refine()}>Make a new version</button>
            <p className="muted small">Your words are applied to the artwork; the title, date and venue always come from the Facts step.</p>
            {pendingRule && (
              <div className="rule-offer">
                <div className="small">Keep this for future {brand.name} posters?</div>
                <strong>“{pendingRule}”</strong>
                <div className="row">
                  <button className="btn small ghost" onClick={() => setPendingRule(null)}>Just this poster</button>
                  <button
                    className="btn small primary"
                    onClick={() => {
                      saveBrand({ ...brand, style: { ...brandStyle, rules: [...brandStyle.rules, { id: newId(), text: pendingRule, createdAt: now() }] } });
                      setPendingRule(null);
                    }}
                  >
                    From now on
                  </button>
                </div>
              </div>
            )}
            <hr className="sep" />
            <button className="btn" onClick={() => void downloadAll()}>Download all platform sizes</button>
            <details className="sent">
              <summary className="small">What was sent to the AI</summary>
              <div className="small muted">{modeLabel(selected.style)} · {selected.model} · {selected.shape ?? "tall"}</div>
              {(selected.refs?.length ?? 0) > 0 ? (
                <div className="sent-refs">
                  {selected.refs!.map((r, i) => (
                    <figure key={i}>
                      <img src={r.src} alt={r.name} />
                      <figcaption>{r.kind === "base" ? "Remixed" : r.kind === "logo" ? "Logo" : "Example"}</figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <div className="small muted">No reference images.</div>
              )}
              <pre className="sent-prompt">{selected.prompt || "(not recorded for this poster)"}</pre>
              {selected.checkNote && <div className="small">Check notes: {selected.checkNote}</div>}
            </details>
            {selected.factCheck === "failed" && (
              <div className="notice error">
                {selected.style !== "typeset" ? "This poster has a text problem and can't be approved." : "The AI put stray text in this art; it can't be approved."}
              </div>
            )}
          </div>
        </div>
      )}

      {usable && usable.status === "ready" && (
        <div className="platforms">
          <div className="row spread">
            <div>
              <h2 style={{ fontSize: 16 }}>Every platform</h2>
              <p className="muted small">The selected design at each site's recommended size.</p>
            </div>
            <div className="row">
              {needVersion && (
                <button className="btn small" disabled={!aiReady(ai) || versionBusy} onClick={() => void makeVersion(needVersion)}>
                  {versionBusy ? "Re-laying out…" : `Make a ${needVersion} version · 1 image`}
                </button>
              )}
              <button className="btn small primary" onClick={() => void downloadAll()}>Download all</button>
            </div>
          </div>
          {needVersion === "wide" && !versionBusy && (
            <div className="notice small">
              This design is tall, so wide sizes show it on a blurred background for now. "Make a wide version" re-lays out the same flyer for Eventbrite, Meetup, Facebook and LinkedIn, then fact-checks it.
            </div>
          )}
          {!aiTextPoster && (
            <div className="muted small">Exact-text posters are designed tall; wide sizes center them on a blurred background.</div>
          )}
          {selected?.versionCheck && (["wide", "tall"] as const).map((k) =>
            selected.versionCheck?.[k] ? (
              <div key={k} className="small">
                {selected.versionCheck[k] === "pending" && <Pill>Checking the {k} version…</Pill>}
                {selected.versionCheck[k] === "passed" && <Pill tone="ok">{k[0].toUpperCase() + k.slice(1)} version: facts checked</Pill>}
                {selected.versionCheck[k] === "failed" && (
                  <span className="row" style={{ gap: 8 }}>
                    <Pill tone="bad">{k[0].toUpperCase() + k.slice(1)} version: fact problem (not used)</Pill>
                    <span className="muted">{selected.versionCheck.note}</span>
                    <button className="btn small" disabled={!aiReady(ai) || versionBusy} onClick={() => void makeVersion(k)}>Try again</button>
                  </span>
                )}
              </div>
            ) : null,
          )}
          <div className="platform-grid">
            {PLATFORMS.map((pf) => (
              <div key={pf.id} className="platform">
                <div className="platform-img" style={{ aspectRatio: `${pf.w} / ${pf.h}` }}>
                  <PosterImage poster={usable} facts={facts} brand={brand} size={{ w: pf.w, h: pf.h }} partners={partnerSrcs} />
                </div>
                <div className="row spread small">
                  <span><strong>{pf.label}</strong> <span className="muted">{pf.w}×{pf.h}</span></span>
                  <button className="btn small ghost" onClick={() => void downloadOne(pf)} aria-label={`Download ${pf.label} size`}>⤓</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <div className="notice error">{error}</div>}

      <div className="row spread">
        <button className="btn ghost" onClick={back}>← Back</button>
        <button className="btn primary" onClick={next}>Review and approve →</button>
      </div>
    </div>
  );
}
