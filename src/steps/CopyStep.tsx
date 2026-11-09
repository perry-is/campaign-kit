import { useEffect, useRef, useState } from "react";
import { reviseText, writeCopy } from "../ai/tasks";
import { useAI, useAIJob } from "../ai/useAI";
import type { SocialChannel } from "../data/model";
import { useStore } from "../data/store";
import { AIBadge, AINotice, aiReady } from "../ui/ai";
import type { StepProps } from "./types";

type TabId = "listing" | SocialChannel;

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: "listing", label: "Event listing", hint: "Eventbrite and Meetup" },
  { id: "facebook", label: "Facebook", hint: "Group posts" },
  { id: "instagram", label: "Instagram", hint: "Caption" },
  { id: "linkedin", label: "LinkedIn", hint: "Company page" },
];

export function CopyStep({ campaign, update, next, back }: StepProps) {
  const { brand } = useStore();
  const ai = useAI();
  const job = useAIJob();
  const [tab, setTab] = useState<TabId>("listing");
  const [instruction, setInstruction] = useState("");
  const [undo, setUndo] = useState<{ tab: TabId; text: string } | null>(null);
  const autoRan = useRef(false);

  const valueOf = (t: TabId) => (t === "listing" ? campaign.copy.listing : campaign.copy.posts[t]);
  const value = valueOf(tab);
  const isEmpty = !campaign.copy.listing && Object.values(campaign.copy.posts).every((p) => !p);

  const setTabValue = (t: TabId, v: string) =>
    update((c) =>
      t === "listing"
        ? { ...c, copy: { ...c.copy, listing: v } }
        : { ...c, copy: { ...c.copy, posts: { ...c.copy.posts, [t]: v } } },
    );

  function writeAll() {
    if (!aiReady(ai)) return;
    void job.run("Writing the listing and posts…", async () => {
      const out = await writeCopy(ai.ai, brand, campaign.facts);
      update((c) => ({
        ...c,
        copy: { listing: out.listing, posts: { facebook: out.facebook, instagram: out.instagram, linkedin: out.linkedin } },
        creativeDirection: out.creative_direction,
      }));
    });
  }

  // First visit with AI ready: write everything without an extra click.
  useEffect(() => {
    if (aiReady(ai) && isEmpty && !autoRan.current) {
      autoRan.current = true;
      writeAll();
    }
  }, [ai.state]);

  function revise() {
    if (!aiReady(ai) || !instruction.trim() || !value.trim()) return;
    const t = tab;
    const before = value;
    void job.run("Revising…", async () => {
      const label = TABS.find((x) => x.id === t)!.label;
      const revised = await reviseText(ai.ai, brand, { facts: campaign.facts, kind: `${label} text`, current: before, request: instruction });
      setTabValue(t, revised);
      setUndo({ tab: t, text: before });
      setInstruction("");
    });
  }

  return (
    <div className="card">
      <div className="row spread">
        <div>
          <h2>Posts and listing</h2>
          <p className="muted small">Edit directly, or tell the AI what to change.</p>
        </div>
        <div className="row">
          <AIBadge status={ai} />
          {aiReady(ai) && !isEmpty && (
            <button className="btn small ghost" disabled={!!job.busy} onClick={() => confirm("Rewrite all four from scratch?") && writeAll()}>
              Rewrite all
            </button>
          )}
        </div>
      </div>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <textarea
        rows={12}
        value={value}
        onChange={(e) => setTabValue(tab, e.target.value)}
        placeholder={job.busy ? "Writing…" : `${TABS.find((t) => t.id === tab)?.hint} text appears here.`}
      />
      <div className="row spread small muted">
        <span>{value.trim() ? `${value.trim().split(/\s+/).length} words` : ""}</span>
        {undo?.tab === tab && (
          <button className="btn small ghost" onClick={() => { setTabValue(tab, undo.text); setUndo(null); }}>Undo revision</button>
        )}
      </div>
      {aiReady(ai) && (
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. warmer, shorter, mention free parking" onKeyDown={(e) => e.key === "Enter" && revise()} />
          <button className="btn" disabled={!instruction.trim() || !value.trim() || !!job.busy} onClick={revise}>Revise</button>
        </div>
      )}
      {job.busy && <div className="notice"><span className="spinner" /> {job.busy}</div>}
      {job.error && (
        <div className="notice error">
          {job.error}
          {isEmpty && <button className="btn small" onClick={writeAll}>Try again</button>}
        </div>
      )}
      <AINotice status={ai} />
      <div className="row spread">
        <button className="btn ghost" onClick={back}>← Back</button>
        <button className="btn primary" onClick={next} disabled={!!job.busy}>Make the poster →</button>
      </div>
    </div>
  );
}
