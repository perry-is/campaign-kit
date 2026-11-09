// Data model. Every record is sync-ready from day one (for the phone app later):
// a random id, the brand (client) it belongs to, timestamps, a soft-delete marker
// and a revision counter for conflict checks.

export type SyncMeta = {
  id: string;
  brandId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  rev: number;
};

export type EventFacts = {
  title: string;
  start: string; // local "YYYY-MM-DDTHH:mm"
  end: string;
  timezone: string;
  venue: string;
  address: string;
  delivery: "in_person" | "online" | "hybrid";
  price: string;
  host: string;
  description: string;
};

export type SocialChannel = "instagram" | "linkedin" | "facebook";

export type CampaignCopy = {
  listing: string;
  posts: Record<SocialChannel, string>;
};

export type Poster = {
  id: string;
  /**
   * "typeset": AI art, the app sets the text (exact).
   * "full": AI draws the text on a poster layout.
   * "designed": AI designs the whole flyer in the brand's style, text included.
   * "remix": AI redesigns one of the brand's past flyers for this event.
   */
  style: "typeset" | "full" | "designed" | "remix";
  /** Image shape. Typeset posters are always tall. */
  shape?: "tall" | "wide" | "square";
  /** Re-laid-out versions of the same design for other shapes (AI-designed flyers). */
  wideSrc?: string;
  tallSrc?: string;
  /** Fact-check of those versions. */
  versionCheck?: { wide?: "pending" | "passed" | "failed"; tall?: "pending" | "passed" | "failed"; note?: string };
  /** What was sent to the AI besides the prompt: logo / style examples / the flyer being remixed. */
  refs?: { kind: "logo" | "example" | "base"; name: string; src: string }[];
  layout: "top" | "bottom" | "band";
  /** Art (typeset) or the finished image (full): ck-media:// file in the desktop app, data URL in a browser. */
  src: string;
  prompt: string;
  model: string;
  createdAt: string;
  status: "generating" | "ready" | "failed";
  error?: string;
  /** Typeset: art has no stray text. Full: every fact is spelled right. */
  factCheck: "pending" | "passed" | "failed" | "skipped";
  checkNote?: string;
  /** Set when this poster is a refinement of another. */
  parentId?: string;
};

export type Destination = "eventbrite" | "instagram" | "linkedin" | "meetup";

export type PublishState = {
  enabled: boolean;
  status: "idle" | "queued" | "publishing" | "published" | "failed" | "simulated";
  url?: string;
  error?: string;
  at?: string;
};

export type FacebookGroup = { id: string; name: string; url: string };

export const STEPS = ["intake", "facts", "copy", "poster", "approve", "publish"] as const;
export type Step = (typeof STEPS)[number];

export type Campaign = SyncMeta & {
  step: Step;
  intakeText: string;
  facts: EventFacts;
  copy: CampaignCopy;
  posters: Poster[];
  selectedPosterId: string | null;
  /** Hash of the exact copy + poster that was approved; editing anything clears it. */
  approval: { fingerprint: string; approvedAt: string } | null;
  publish: Record<Destination, PublishState>;
  facebookPosted: Record<string, string>; // groupId -> postedAt
  /** AI title options for the dice button: [recommended, ...alternatives]. */
  titleOptions?: string[];
  /** Fact fields the AI was unsure about; highlighted until the user edits them. */
  checkFields?: (keyof EventFacts)[];
  /** AI visual brief for the poster step. */
  creativeDirection?: string;
  /** Old: per-event style examples (no longer used; the brand's style applies). */
  styleExamples?: { id: string; src: string; name: string; addedAt: string }[];
  /** Partner, sponsor and ad logos for this event, placed exactly on the poster. */
  partners?: { id: string; src: string; name: string; addedAt: string }[];
};

/** A draft the user hasn't started: nothing typed, no title, still on the first step. */
export function isBlankDraft(c: Campaign): boolean {
  return c.step === "intake" && !c.intakeText.trim() && !c.facts.title.trim() && c.posters.length === 0;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

export function blankCampaign(brandId: string, defaults: { venue: string; address: string; timezone: string; host: string }): Campaign {
  const t = now();
  const idle = (enabled: boolean): PublishState => ({ enabled, status: "idle" });
  return {
    id: newId(),
    brandId,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
    rev: 1,
    step: "intake",
    intakeText: "",
    facts: {
      title: "",
      start: "",
      end: "",
      timezone: defaults.timezone,
      venue: defaults.venue,
      address: defaults.address,
      delivery: "in_person",
      price: "Free",
      host: defaults.host,
      description: "",
    },
    copy: { listing: "", posts: { instagram: "", linkedin: "", facebook: "" } },
    posters: [],
    selectedPosterId: null,
    approval: null,
    publish: { eventbrite: idle(true), instagram: idle(true), linkedin: idle(true), meetup: idle(false) },
    facebookPosted: {},
  };
}

/** What gets approved: the exact text and poster. Any change produces a new fingerprint. */
export function approvalFingerprint(c: Campaign): string {
  const s = JSON.stringify([c.facts, c.copy, c.selectedPosterId]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}
