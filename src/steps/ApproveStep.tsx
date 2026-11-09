import { approvalFingerprint, now } from "../data/model";
import { useStore } from "../data/store";
import { PosterImage } from "../poster/PosterImage";
import { posterText } from "../poster/text";
import { Pill } from "../ui/kit";
import type { StepProps } from "./types";

function formatWhen(f: { start: string; end: string; timezone: string; title: string; venue: string; address: string; price: string; delivery: "in_person" | "online" | "hybrid" }) {
  const t = posterText({ ...f, host: "", description: "" });
  return t.date ? [t.date, t.time].filter(Boolean).join(" · ") : "No date yet";
}

export function ApproveStep({ campaign, update, next, back }: StepProps) {
  const f = campaign.facts;
  const fp = approvalFingerprint(campaign);
  const approved = campaign.approval?.fingerprint === fp;
  const stale = campaign.approval && !approved;
  const { brand } = useStore();
  const poster = campaign.posters.find((p) => p.id === campaign.selectedPosterId);
  const posterBlocked = poster?.factCheck === "failed" || poster?.status === "generating";

  return (
    <div className="card">
      <div className="row spread">
        <div>
          <h2>Approve this version</h2>
          <p className="muted small">Nothing is published until you approve. Any edit after this needs a new approval.</p>
        </div>
        {approved ? <Pill tone="ok">Approved</Pill> : stale ? <Pill tone="warn">Changed since approval</Pill> : <Pill>Not approved</Pill>}
      </div>

      <div className="grid-2">
        <div className="poster-tile" style={{ cursor: "default" }}>
          {poster ? <PosterImage poster={poster} facts={f} brand={brand} partners={(campaign.partners ?? []).map((x) => x.src)} /> : <span className="muted small">No poster selected</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h1 style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 32 }}>{f.title || "Untitled event"}</h1>
          <div className="muted">{formatWhen(f)}</div>
          <div className="muted">{[f.venue, f.address].filter(Boolean).join(" · ")}</div>
          <div className="muted">{f.price}</div>
          <p style={{ whiteSpace: "pre-wrap" }}>{campaign.copy.listing || f.description || <span className="muted">No listing text yet.</span>}</p>
        </div>
      </div>

      <div className="row spread">
        <button className="btn ghost" onClick={back}>← Back</button>
        {approved ? (
          <button className="btn primary" onClick={next}>Publish →</button>
        ) : (
          <button
            className="btn primary"
            disabled={posterBlocked}
            title={posterBlocked ? "Pick a poster that passed its check" : undefined}
            onClick={() => update((c) => ({ ...c, approval: { fingerprint: approvalFingerprint(c), approvedAt: now() } }))}
          >
            Approve this exact version
          </button>
        )}
      </div>
    </div>
  );
}
