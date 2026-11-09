import { STEPS, type Campaign, type Step } from "./data/model";
import { useStore } from "./data/store";
import { ApproveStep } from "./steps/ApproveStep";
import { CopyStep } from "./steps/CopyStep";
import { FactsStep } from "./steps/FactsStep";
import { IntakeStep } from "./steps/IntakeStep";
import { PosterStep } from "./steps/PosterStep";
import { PublishStep } from "./steps/PublishStep";
import type { StepProps } from "./steps/types";

const LABELS: Record<Step, string> = {
  intake: "Event",
  facts: "Facts",
  copy: "Posts",
  poster: "Poster",
  approve: "Approve",
  publish: "Publish",
};

const VIEWS: Record<Step, (p: StepProps) => React.JSX.Element> = {
  intake: IntakeStep,
  facts: FactsStep,
  copy: CopyStep,
  poster: PosterStep,
  approve: ApproveStep,
  publish: PublishStep,
};

export function CampaignView({ campaign }: { campaign: Campaign }) {
  const { updateCampaign, deleteCampaign } = useStore();
  const idx = STEPS.indexOf(campaign.step);
  const update = (patch: (c: Campaign) => Campaign) => updateCampaign(campaign.id, patch);
  const go = (s: Step) => update((c) => ({ ...c, step: s }));
  const View = VIEWS[campaign.step];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{campaign.facts.title || "New event"}</h1>
          <div className="sub">{campaign.facts.venue}</div>
        </div>
        <button
          className="btn small ghost"
          onClick={() => {
            if (confirm("Delete this event?")) deleteCampaign(campaign.id);
          }}
        >
          Delete
        </button>
      </div>

      <nav className="stepper" aria-label="Steps">
        {STEPS.map((s, i) => (
          <button
            key={s}
            className={`step${i < idx ? " done" : ""}${i === idx ? " current" : ""}`}
            onClick={() => go(s)}
            aria-current={i === idx ? "step" : undefined}
          >
            <span className="bar" />
            {LABELS[s]}
          </button>
        ))}
      </nav>

      <View
        campaign={campaign}
        update={update}
        next={() => idx < STEPS.length - 1 && go(STEPS[idx + 1])}
        back={() => idx > 0 && go(STEPS[idx - 1])}
      />
    </div>
  );
}
