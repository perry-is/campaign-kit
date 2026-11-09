import { useState } from "react";
import { type Attachment, extractFacts, proposeTitleAndDescription } from "../ai/tasks";
import { useAI, useAIJob } from "../ai/useAI";
import { useStore } from "../data/store";
import { AIBadge, AINotice } from "../ui/ai";
import type { StepProps } from "./types";

const MAX_FILE_MB = 15;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

export function IntakeStep({ campaign, update, next }: StepProps) {
  const { brand } = useStore();
  const ai = useAI();
  const job = useAIJob();
  const [over, setOver] = useState(false);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [fileNote, setFileNote] = useState<string | null>(null);

  async function addFile(file: File) {
    setFileNote(null);
    if (file.size > MAX_FILE_MB * 1024 * 1024) return setFileNote(`${file.name} is over ${MAX_FILE_MB} MB.`);
    if (file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name)) {
      const text = await file.text();
      update((c) => ({ ...c, intakeText: c.intakeText ? `${c.intakeText}\n\n${text}` : text }));
      return;
    }
    if (file.type.startsWith("image/") || file.type === "application/pdf") {
      const dataUrl = await readAsDataUrl(file);
      setFiles((f) => [...f, { name: file.name, mime: file.type, dataUrl }]);
      return;
    }
    setFileNote("Use an image, PDF or text file. For Word files, paste the text instead.");
  }

  const hasInput = campaign.intakeText.trim().length > 0 || files.length > 0;

  function pullFacts() {
    if (ai.state !== "ready") return next();
    void job.run("Reading the details…", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const found = await extractFacts(ai.ai, {
        text: campaign.intakeText,
        attachments: files,
        today,
        defaultTimezone: brand.timezone,
      });
      const facts = { ...campaign.facts, ...found.patch };
      update((c) => ({ ...c, facts, checkFields: found.checkFields }));

      job.setLabel("Writing a title and description…");
      const creative = await proposeTitleAndDescription(ai.ai, brand, {
        facts,
        sourceText: campaign.intakeText,
        topic: found.topic,
        notes: found.notes,
      });
      // The source's own name stays available as a dice option.
      const options = found.patch.title && !creative.titles.includes(found.patch.title)
        ? [...creative.titles, found.patch.title]
        : creative.titles;
      update((c) => ({
        ...c,
        facts: { ...c.facts, title: options[0] ?? c.facts.title, description: creative.description },
        titleOptions: options,
        step: "facts",
      }));
    });
  }

  return (
    <div className="card">
      <div className="row spread">
        <div>
          <h2>What's the event?</h2>
          <p className="muted small">Paste anything: an email, notes, last year's listing. Or drop a flyer.</p>
        </div>
        <AIBadge status={ai} />
      </div>
      <textarea
        className="intake-text"
        rows={9}
        placeholder="Northlight mixer, Thursday Dec 4, 5:30–7:30pm at The Lantern Room…"
        value={campaign.intakeText}
        onChange={(e) => update((c) => ({ ...c, intakeText: e.target.value }))}
      />
      <label
        className={`dropzone${over ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          for (const f of Array.from(e.dataTransfer.files)) void addFile(f);
        }}
      >
        <input type="file" hidden multiple accept="image/*,.pdf,.txt,.md" onChange={(e) => { for (const f of Array.from(e.target.files ?? [])) void addFile(f); e.target.value = ""; }} />
        Drop a flyer (image or PDF), or click to choose
      </label>
      {files.length > 0 && (
        <div className="row small">
          {files.map((f, i) => (
            <span key={i} className="pill">
              {f.name}
              <button className="btn small ghost" style={{ padding: "0 4px" }} onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>✕</button>
            </span>
          ))}
        </div>
      )}
      {fileNote && <div className="notice">{fileNote}</div>}
      {job.error && <div className="notice error">{job.error}</div>}
      <AINotice status={ai} />
      <div className="row spread">
        <span className="muted small">{ai.state === "ready" ? "The AI pulls out the date, time, venue and price for you to check." : ""}</span>
        <button className="btn primary" disabled={!hasInput || !!job.busy} onClick={pullFacts}>
          {job.busy ?? (ai.state === "ready" ? "Pull out the facts →" : "Fill in the facts myself →")}
        </button>
      </div>
    </div>
  );
}
