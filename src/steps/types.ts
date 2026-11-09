import type { Campaign } from "../data/model";

export type StepProps = {
  campaign: Campaign;
  update: (patch: (c: Campaign) => Campaign) => void;
  next: () => void;
  back: () => void;
};
