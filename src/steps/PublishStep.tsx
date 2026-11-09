import { useState } from "react";
import { approvalFingerprint, newId, now, type Destination, type PublishState } from "../data/model";
import { useStore } from "../data/store";
import { Pill, Toggle } from "../ui/kit";
import type { StepProps } from "./types";

const DESTS: { id: Destination; name: string; mark: string; note?: string }[] = [
  { id: "eventbrite", name: "Eventbrite", mark: "Eb" },
  { id: "instagram", name: "Instagram", mark: "Ig", note: "Uses the 4:5 poster crop" },
  { id: "linkedin", name: "LinkedIn page", mark: "in" },
  { id: "meetup", name: "Meetup", mark: "Mu", note: "Practice mode only for now" },
];

function statusPill(s: PublishState) {
  switch (s.status) {
    case "published": return <Pill tone="ok">Published</Pill>;
    case "simulated": return <Pill tone="warn">Practice run OK</Pill>;
    case "failed": return <Pill tone="bad">Failed</Pill>;
    case "publishing": case "queued": return <Pill>Publishing…</Pill>;
    default: return null;
  }
}

export function PublishStep({ campaign, update, back }: StepProps) {
  const { dryRun, facebookGroups, brand, setFacebookGroups } = useStore();
  const approved = campaign.approval?.fingerprint === approvalFingerprint(campaign);
  const groups = facebookGroups[brand.id] ?? [];
  const [newGroup, setNewGroup] = useState({ name: "", url: "" });
  const [copied, setCopied] = useState(false);

  function publishAll() {
    // Live connectors are ported next; until then every run is a practice run.
    update((c) => {
      const publish = { ...c.publish };
      for (const d of DESTS) {
        if (publish[d.id].enabled) publish[d.id] = { ...publish[d.id], status: "simulated", at: now() };
      }
      return { ...c, publish };
    });
  }

  async function copyPost() {
    await navigator.clipboard.writeText(campaign.copy.posts.facebook || campaign.copy.listing);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <div className="card">
        <div className="row spread">
          <div>
            <h2>Publish</h2>
            <p className="muted small">{dryRun ? "Practice mode is on: nothing goes live." : "Live mode: this posts for real."}</p>
          </div>
          {!approved && <Pill tone="warn">Approve first</Pill>}
        </div>
        <div className="checklist">
          {DESTS.map((d) => {
            const s = campaign.publish[d.id];
            return (
              <div className="dest" key={d.id}>
                <div className="logo">{d.mark}</div>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{d.name}</div>
                  {d.note && <div className="muted small">{d.note}</div>}
                </div>
                {statusPill(s)}
                <Toggle
                  checked={s.enabled}
                  onChange={(v) => update((c) => ({ ...c, publish: { ...c.publish, [d.id]: { ...c.publish[d.id], enabled: v } } }))}
                  label=""
                />
              </div>
            );
          })}
        </div>
        <div className="row spread">
          <button className="btn ghost" onClick={back}>← Back</button>
          <button className="btn primary" disabled={!approved} onClick={publishAll}>
            {dryRun ? "Run practice publish" : "Publish now"}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="row spread">
          <div>
            <h2>Facebook groups</h2>
            <p className="muted small">Copy the post, open the group, paste, then tick it off.</p>
          </div>
          <button className="btn small" onClick={copyPost} disabled={!approved}>{copied ? "Copied ✓" : "Copy post"}</button>
        </div>
        <div className="checklist">
          {groups.length === 0 && <p className="muted small">No groups yet. Add the ones you post to.</p>}
          {groups.map((g) => {
            const posted = campaign.facebookPosted[g.id];
            return (
              <div className={`check-row${posted ? " done" : ""}`} key={g.id}>
                <input
                  type="checkbox"
                  checked={!!posted}
                  onChange={(e) =>
                    update((c) => {
                      const fp = { ...c.facebookPosted };
                      if (e.target.checked) fp[g.id] = now();
                      else delete fp[g.id];
                      return { ...c, facebookPosted: fp };
                    })
                  }
                />
                <div className="grow">
                  <div style={{ fontWeight: 550 }}>{g.name}</div>
                  {posted && <div className="muted small">Posted {new Date(posted).toLocaleString()}</div>}
                </div>
                <a className="btn small" href={g.url} target="_blank" rel="noreferrer">Open group</a>
                <button className="btn small ghost" onClick={() => setFacebookGroups(groups.filter((x) => x.id !== g.id))} title="Remove group">✕</button>
              </div>
            );
          })}
        </div>
        <div className="row">
          <input style={{ flex: 1 }} placeholder="Group name" value={newGroup.name} onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })} />
          <input style={{ flex: 1.4 }} placeholder="https://facebook.com/groups/…" value={newGroup.url} onChange={(e) => setNewGroup({ ...newGroup, url: e.target.value })} />
          <button
            className="btn small"
            disabled={!newGroup.name.trim() || !/^https:\/\/(www\.)?facebook\.com\//.test(newGroup.url)}
            onClick={() => {
              setFacebookGroups([...groups, { id: newId(), name: newGroup.name.trim(), url: newGroup.url.trim() }]);
              setNewGroup({ name: "", url: "" });
            }}
          >
            Add
          </button>
        </div>
      </div>
    </>
  );
}
