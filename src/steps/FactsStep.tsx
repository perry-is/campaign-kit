import { useState } from "react";
import { proposeTitleAndDescription, reviseText, suggestTitles } from "../ai/tasks";
import { useAI, useAIJob } from "../ai/useAI";
import type { EventFacts } from "../data/model";
import { hasStart, joinWhen, splitWhen, whenNotice, whenProblem, type WhenParts } from "../data/when";
import { useStore } from "../data/store";
import { aiReady } from "../ui/ai";
import { Field } from "../ui/kit";
import { TimePicker } from "../ui/TimePicker";
import type { StepProps } from "./types";

export function FactsStep({ campaign, update, next, back }: StepProps) {
  const { brand } = useStore();
  const ai = useAI();
  const job = useAIJob();
  const [titleDirection, setTitleDirection] = useState("");
  const [showTitleBox, setShowTitleBox] = useState(false);
  const [descRequest, setDescRequest] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const f = campaign.facts;
  const check = new Set(campaign.checkFields ?? []);
  const options = campaign.titleOptions ?? [];

  const set = <K extends keyof EventFacts>(k: K, v: EventFacts[K]) =>
    update((c) => ({
      ...c,
      facts: { ...c.facts, [k]: v },
      checkFields: (c.checkFields ?? []).filter((x) => x !== k), // editing a field confirms it
    }));

  const label = (k: keyof EventFacts, text: string) => (check.has(k) ? `${text} · please check` : text);
  const cls = (k: keyof EventFacts) => (check.has(k) ? "needs-check" : undefined);

  function rollTitle() {
    if (options.length < 2) return;
    const i = options.indexOf(f.title);
    set("title", options[(i + 1) % options.length]);
  }

  function newTitles() {
    if (!aiReady(ai)) return;
    void job.run("Thinking up titles…", async () => {
      const titles = await suggestTitles(ai.ai, brand, f, titleDirection);
      update((c) => ({ ...c, titleOptions: titles, facts: { ...c.facts, title: titles[0] ?? c.facts.title } }));
      setShowTitleBox(false);
    });
  }

  function writeDescription() {
    if (!aiReady(ai)) return;
    void job.run("Writing the description…", async () => {
      const r = await proposeTitleAndDescription(ai.ai, brand, { facts: f, sourceText: campaign.intakeText });
      setPreview(r.description);
    });
  }

  function reviseDescription() {
    if (!aiReady(ai) || !descRequest.trim()) return;
    void job.run("Revising…", async () => {
      setPreview(await reviseText(ai.ai, brand, { facts: f, kind: "event description", current: f.description, request: descRequest }));
    });
  }

  const when = splitWhen(f.start, f.end);
  const setWhen = (patch: Partial<WhenParts>) => {
    const next = joinWhen({ ...when, ...patch });
    update((c) => ({
      ...c,
      facts: { ...c.facts, start: next.start, end: next.end },
      checkFields: (c.checkFields ?? []).filter((x) => x !== "start" && x !== "end"),
    }));
  };

  const ready = f.title.trim() && hasStart(f.start) && f.venue.trim() && !whenProblem(when);

  return (
    <div className="card">
      <div>
        <h2>Check the facts</h2>
        <p className="muted small">Everything else (posts, poster, listings) is built from these.</p>
      </div>

      <div className="grid-2">
        <div className="field full">
          <span>{label("title", "Title")}</span>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input className={cls("title")} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Event title" />
            <button className="btn small ghost" onClick={rollTitle} disabled={options.length < 2} title="Next suggested title">🎲</button>
            <button className="btn small ghost" onClick={() => setShowTitleBox((v) => !v)} disabled={!aiReady(ai)}>New titles</button>
          </div>
          {showTitleBox && (
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input value={titleDirection} onChange={(e) => setTitleDirection(e.target.value)} placeholder="Direction, e.g. more fun, shorter, mention holidays" onKeyDown={(e) => e.key === "Enter" && newTitles()} />
              <button className="btn small" onClick={newTitles} disabled={!!job.busy}>Suggest</button>
            </div>
          )}
          {options.length > 1 && <span className="muted small">{options.indexOf(f.title) + 1 || "—"} of {options.length} suggestions</span>}
        </div>
        <div className="field full">
          <div className="when-row">
            <label className="field">
              <span>{label("start", "Date")}</span>
              <input className={cls("start")} type="date" value={when.date} onChange={(e) => setWhen({ date: e.target.value })} />
            </label>
            <div className="field">
              <span>Starts</span>
              <TimePicker label="Start time" className={cls("start")} value={when.startTime} onChange={(v) => setWhen({ startTime: v })} />
            </div>
            <div className="field">
              <span>{label("end", "Ends")}</span>
              <TimePicker label="End time" className={cls("end")} value={when.endTime} onChange={(v) => setWhen({ endTime: v })} />
            </div>
            {when.multiDay && (
              <label className="field">
                <span>Ends on</span>
                <input type="date" value={when.endDate} min={when.date} onChange={(e) => setWhen({ endDate: e.target.value })} />
              </label>
            )}
          </div>
          <label className="row small muted" style={{ gap: 8 }}>
            <input type="checkbox" checked={when.multiDay} onChange={(e) => setWhen({ multiDay: e.target.checked, endDate: when.endDate || when.date })} />
            Ends on a different day
          </label>
          {whenProblem(when) && <div className="notice">{whenProblem(when)}</div>}
          {!whenProblem(when) && whenNotice(when) && <div className="notice warn-notice">{whenNotice(when)}</div>}
        </div>
        <Field label={label("venue", "Venue")}>
          <input className={cls("venue")} value={f.venue} onChange={(e) => set("venue", e.target.value)} />
        </Field>
        <Field label={label("address", "Address")}>
          <input className={cls("address")} value={f.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
        <Field label={label("delivery", "Format")}>
          <select className={cls("delivery")} value={f.delivery} onChange={(e) => set("delivery", e.target.value as EventFacts["delivery"])}>
            <option value="in_person">In person</option>
            <option value="online">Online</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </Field>
        <Field label={label("price", "Price")}>
          <input className={cls("price")} value={f.price} onChange={(e) => set("price", e.target.value)} />
        </Field>

        <div className="field full">
          <div className="row spread">
            <span>Description</span>
            {aiReady(ai) && !f.description && (
              <button className="btn small ghost" onClick={writeDescription} disabled={!!job.busy}>Write it for me</button>
            )}
          </div>
          <textarea rows={7} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="The invitation, in your voice." />
          {aiReady(ai) && f.description && (
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input value={descRequest} onChange={(e) => setDescRequest(e.target.value)} placeholder="Change it: warmer, shorter, mention free parking…" onKeyDown={(e) => e.key === "Enter" && reviseDescription()} />
              <button className="btn small" onClick={reviseDescription} disabled={!descRequest.trim() || !!job.busy}>Revise</button>
            </div>
          )}
        </div>
      </div>

      {preview !== null && (
        <div className="preview-box">
          <div className="row spread">
            <strong className="small">Suggested description</strong>
            <div className="row">
              <button className="btn small ghost" onClick={() => setPreview(null)}>Discard</button>
              <button className="btn small primary" onClick={() => { set("description", preview); setPreview(null); setDescRequest(""); }}>Use this</button>
            </div>
          </div>
          <p style={{ whiteSpace: "pre-wrap" }}>{preview}</p>
        </div>
      )}

      {job.busy && <div className="notice"><span className="spinner" /> {job.busy}</div>}
      {job.error && <div className="notice error">{job.error}</div>}

      <div className="row spread">
        <button className="btn ghost" onClick={back}>← Back</button>
        <button
          className="btn primary"
          disabled={!ready}
          onClick={() => {
            update((c) => ({ ...c, checkFields: [] })); // moving on confirms the facts
            next();
          }}
        >
          {check.size > 0 ? `Looks right (${check.size} to check) →` : "Write the posts →"}
        </button>
      </div>
    </div>
  );
}
