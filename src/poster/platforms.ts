// Image size for each place a flyer gets posted. Checked 2026-11-06:
// - Eventbrite: at least 2160 × 1080 (Eventbrite Help Center, "Add an image to your event")
// - Meetup: 1200 × 675 (Meetup Help Center, image-size guidance)
// - Instagram: 1080 × 1350 (4:5, the tallest feed shape)
// - Facebook group post / LinkedIn post: 1200 × 630 / 1200 × 627 (1.91:1; third-party guides,
//   no single official figure). Revisit these in the monthly maintenance check.

export type PlatformId = "eventbrite" | "meetup" | "instagram" | "facebook" | "linkedin";

export type PlatformSize = { id: PlatformId; label: string; w: number; h: number };

export const PLATFORMS: PlatformSize[] = [
  { id: "eventbrite", label: "Eventbrite", w: 2160, h: 1080 },
  { id: "meetup", label: "Meetup", w: 1200, h: 675 },
  { id: "facebook", label: "Facebook group", w: 1200, h: 630 },
  { id: "linkedin", label: "LinkedIn", w: 1200, h: 627 },
  { id: "instagram", label: "Instagram", w: 1080, h: 1350 },
];

export type Orientation = "wide" | "tall" | "square";

export function orientationOf(w: number, h: number): Orientation {
  const r = w / h;
  return r > 1.15 ? "wide" : r < 0.87 ? "tall" : "square";
}

/** Which of a poster's images to use for a size: the matching wide/tall version if there is one. */
export function pickSource(
  poster: { src: string; shape?: Orientation; wideSrc?: string; tallSrc?: string },
  w: number,
  h: number,
): string {
  const want = orientationOf(w, h);
  if (want === "wide") return poster.wideSrc || poster.src;
  if (want === "tall") return poster.tallSrc || poster.src;
  return poster.src;
}

/** Does this poster need a re-laid-out version to fill the wide (or tall) sizes properly? */
export function missingVersion(poster: { shape?: Orientation; wideSrc?: string; tallSrc?: string }): "wide" | "tall" | null {
  const shape = poster.shape ?? "tall";
  if (shape !== "wide" && !poster.wideSrc) return "wide";
  if (shape === "wide" && !poster.tallSrc) return "tall";
  return null;
}
