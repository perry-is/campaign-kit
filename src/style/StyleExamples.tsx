import { useRef, useState } from "react";
import { summarizeStyle } from "../ai/tasks";
import { useAI, useAIJob } from "../ai/useAI";
import { newId, now } from "../data/model";
import { imageToDataUrl } from "../poster/PosterImage";
import { type BrandStyle, EMPTY_STYLE, type StyleExample } from "../theme/brand";
import { aiReady } from "../ui/ai";

const MAX_FILE_MB = 20;

function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

/** Save an uploaded image as a style example (a private file in the desktop app). */
export async function saveExample(file: File): Promise<StyleExample> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} isn't an image.`);
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`${file.name} is over ${MAX_FILE_MB} MB.`);
  const id = newId();
  const scaled = await imageToDataUrl(await readFile(file), 1280, "image/jpeg");
  let src = scaled;
  if (window.ckDesktop) {
    const r = await window.ckDesktop.media.save(scaled, `style-${id}`);
    if (!r.ok) throw new Error(r.error.message);
    src = r.data;
  }
  return { id, src, name: file.name, addedAt: now() };
}

export function removeExampleFile(ex: StyleExample) {
  if (ex.src.startsWith("ck-media://")) void window.ckDesktop?.media.remove(ex.src);
}

/** Thumbnails + a drop zone. Screenshots, past posters, photos: anything that shows the look. */
export function ExampleGrid(props: {
  items: StyleExample[];
  onAdd: (items: StyleExample[]) => void;
  onRemove: (ex: StyleExample) => void;
  hint?: string;
  max?: number;
  /** "contain" shows the whole image (logos); "cover" fills the tile (photos, flyers). */
  fit?: "cover" | "contain";
}) {
  const { items, onAdd, onRemove, hint, max = 12, fit = "cover" } = props;
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function add(files: File[]) {
    setError(null);
    const room = Math.max(0, max - items.length);
    if (!room) return setError(`Up to ${max} examples here. Remove one to add another.`);
    setBusy(true);
    const added: StyleExample[] = [];
    for (const f of files.slice(0, room)) {
      try {
        added.push(await saveExample(f));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add that image.");
      }
    }
    setBusy(false);
    if (added.length) onAdd(added);
  }

  return (
    <div className={`examples fit-${fit}`}>
      <div className="example-grid">
        {items.map((ex) => (
          <div className="example" key={ex.id} title={ex.name}>
            <img src={ex.src} alt={ex.name} />
            <button className="example-x" onClick={() => onRemove(ex)} aria-label={`Remove ${ex.name}`}>✕</button>
          </div>
        ))}
        <div
          className={`example add${over ? " over" : ""}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void add(Array.from(e.dataTransfer.files));
          }}
        >
          <input ref={input} type="file" hidden multiple accept="image/*" onChange={(e) => { void add(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          <span>{busy ? "Adding…" : "+ Add examples"}</span>
        </div>
      </div>
      {hint && <p className="muted small">{hint}</p>}
      {error && <div className="notice error">{error}</div>}
    </div>
  );
}

/** Brand style: example images, an AI-written summary of the look, and lasting rules. */
export function BrandStyleEditor({ style = EMPTY_STYLE, onChange, brandName }: { style?: BrandStyle; onChange: (s: BrandStyle) => void; brandName: string }) {
  const ai = useAI();
  const job = useAIJob();
  const [newRule, setNewRule] = useState("");

  function describe(examples = style.examples) {
    if (!aiReady(ai) || examples.length === 0) return;
    void job.run("Studying the examples…", async () => {
      const imgs = await Promise.all(examples.slice(0, 6).map((e) => imageToDataUrl(e.src, 1024)));
      const r = await summarizeStyle(ai.ai, imgs);
      // Keep taglines the user already has; add any new ones found.
      const known = new Set((style.phrases ?? []).map((x) => x.toLowerCase()));
      const phrases = [...(style.phrases ?? []), ...r.phrases.filter((x) => !known.has(x.toLowerCase()))];
      onChange({ ...style, examples, summary: r.summary, phrases });
    });
  }

  return (
    <div className="style-editor">
      <ExampleGrid
        items={style.examples}
        onAdd={(added) => {
          const examples = [...style.examples, ...added];
          onChange({ ...style, examples });
          if (aiReady(ai) && !style.summary) describe(examples); // first examples: describe them right away
        }}
        onRemove={(ex) => {
          removeExampleFile(ex);
          onChange({ ...style, examples: style.examples.filter((x) => x.id !== ex.id) });
        }}
        hint={`Past posters, flyers, screenshots or photos that show the look ${brandName} wants. Every poster uses up to 3 of them as references.`}
      />

      <div className="field">
        <div className="row spread">
          <span className="small muted">The look, in words (the AI writes this from the examples; edit freely)</span>
          <button className="btn small ghost" onClick={() => describe()} disabled={!aiReady(ai) || !style.examples.length || !!job.busy}>
            {style.summary ? "Describe again" : "Describe the style"}
          </button>
        </div>
        <textarea rows={3} value={style.summary} onChange={(e) => onChange({ ...style, summary: e.target.value })} placeholder="e.g. Bright, light backgrounds with bold orange and navy headlines; real local photos; icon rows and badges." />
      </div>
      {job.busy && <div className="notice"><span className="spinner" /> {job.busy}</div>}
      {job.error && <div className="notice error">{job.error}</div>}

      <div className="field">
        <span className="small muted">Taglines the AI may use on designed flyers (found in your examples; edit freely)</span>
        <div className="chips">
          {(style.phrases ?? []).map((ph, i) => (
            <span className="chip-tag" key={i}>
              {ph}
              <button onClick={() => onChange({ ...style, phrases: (style.phrases ?? []).filter((_, j) => j !== i) })} aria-label={`Remove ${ph}`}>✕</button>
            </span>
          ))}
          <input
            className="chip-input"
            placeholder="+ add a tagline, press Enter"
            onKeyDown={(e) => {
              const v = e.currentTarget.value.trim();
              if (e.key === "Enter" && v) {
                onChange({ ...style, phrases: [...(style.phrases ?? []), v] });
                e.currentTarget.value = "";
              }
            }}
          />
        </div>
      </div>

      <div className="field">
        <span className="small muted">Rules every poster follows</span>
        {style.rules.length === 0 && <span className="small muted">None yet. When you ask for a change that sounds like a general preference, the app offers to save it here.</span>}
        <div className="checklist">
          {style.rules.map((r) => (
            <div className="check-row" key={r.id}>
              <div className="grow">{r.text}</div>
              <button className="btn small ghost" onClick={() => onChange({ ...style, rules: style.rules.filter((x) => x.id !== r.id) })} aria-label="Remove rule">✕</button>
            </div>
          ))}
        </div>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input value={newRule} onChange={(e) => setNewRule(e.target.value)} placeholder="Add a rule, e.g. Always show real people networking" onKeyDown={(e) => {
            if (e.key === "Enter" && newRule.trim()) {
              onChange({ ...style, rules: [...style.rules, { id: newId(), text: newRule.trim(), createdAt: now() }] });
              setNewRule("");
            }
          }} />
          <button className="btn small" disabled={!newRule.trim()} onClick={() => {
            onChange({ ...style, rules: [...style.rules, { id: newId(), text: newRule.trim(), createdAt: now() }] });
            setNewRule("");
          }}>Add</button>
        </div>
      </div>
    </div>
  );
}
