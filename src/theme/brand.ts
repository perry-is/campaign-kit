// Brand profiles: each client's look and voice is configuration, not code.
// Northlight Events is the built-in demo profile; new clients get one generated from their logo.

import { contrast, shade, withAlpha } from "./color";

export type BrandPalette = {
  /** Main app surface (usually the darkest logo tone). */
  background: string;
  /** Signature gradient start (headers, primary buttons, progress). */
  accentFrom: string;
  /** Signature gradient end. */
  accentTo: string;
  /** Small highlights: active dots, focus glow, badges. */
  highlight: string;
  /** Body text on the background. */
  text: string;
};

/** The app icon: the brand's emblem with a short word set underneath in the brand's font. */
export type BrandIcon = {
  word: string;
  fontId: string;
  uppercase: boolean;
  /** Extra letter spacing as a fraction of the font size. */
  letterSpacing: number;
  wordFill: "gradient" | "accent" | "highlight" | "text";
  /** "emblem": the symbol cut from the logo (free). "ai": AI-redrawn icon art (one image). */
  style: "emblem" | "ai";
  aiArtUrl?: string;
};

export const DEFAULT_ICON: BrandIcon = {
  word: "Promo",
  fontId: "krona-one",
  uppercase: true,
  letterSpacing: 0.06,
  wordFill: "accent",
  style: "emblem",
};

/** An example image (past poster, screenshot, photo) that shows the look the brand wants. */
export type StyleExample = { id: string; src: string; name: string; addedAt: string };

/** A preference the AI follows on every poster for this brand, e.g. "bright, light backgrounds". */
export type StyleRule = { id: string; text: string; createdAt: string };

export type BrandStyle = {
  examples: StyleExample[];
  /** AI-written description of the examples' look; editable. */
  summary: string;
  rules: StyleRule[];
  /** The brand's own taglines (e.g. "Meet · Learn · Shine"); AI-designed flyers may use these. */
  phrases?: string[];
};

export const EMPTY_STYLE: BrandStyle = { examples: [], summary: "", rules: [] };

export type BrandProfile = {
  id: string;
  name: string;
  /** Logo shown in the app header; a transparent cut-out works best. */
  logoUrl: string;
  palette: BrandPalette;
  /** Writing voice handed to the AI for listings and posts. */
  voice: string;
  defaultVenue: { name: string; address: string };
  timezone: string;
  icon?: BrandIcon;
  style?: BrandStyle;
  updatedAt: string;
};

export const DEMO_BRAND: BrandProfile = {
  id: "brand-northlight",
  name: "Northlight Events",
  logoUrl: "./brand/northlight/logo.png",
  palette: {
    background: "#1a0b2e",
    accentFrom: "#7b6cf6",
    accentTo: "#ff5d8f",
    highlight: "#ffd166",
    text: "#f3eefc",
  },
  voice:
    "Warm, upbeat and plain-spoken; curious about people and ideas; inviting without hype. Lead with why the event is worth an evening, then make the next step easy.",
  defaultVenue: { name: "The Lantern Room", address: "Boulder, CO" },
  timezone: "America/Denver",
  icon: DEFAULT_ICON,
  updatedAt: "2026-11-05T00:00:00.000Z",
};

/** Text color for a filled accent: white unless the accent is too light for it to read (e.g. yellow). */
export function readableOn(bg: string): string {
  return contrast(bg, "#ffffff") >= 2.6 ? "#ffffff" : "#0b0d12";
}

/** Turn a palette into the CSS variables every component uses. */
export function brandCssVars(p: BrandPalette): Record<string, string> {
  return {
    "--bg": p.background,
    "--bg-deep": shade(p.background, -0.04),
    "--surface": shade(p.background, 0.05),
    "--surface-2": shade(p.background, 0.1),
    "--line": withAlpha(p.text, 0.12),
    "--text": p.text,
    "--muted": withAlpha(p.text, 0.62),
    "--accent-from": p.accentFrom,
    "--accent-to": p.accentTo,
    "--accent-gradient": `linear-gradient(100deg, ${p.accentFrom}, ${p.accentTo})`,
    "--on-accent": readableOn(p.accentFrom),
    "--highlight": p.highlight,
    "--glow": withAlpha(p.accentFrom, 0.35),
    "--glow-warm": withAlpha(p.accentTo, 0.3),
  };
}

export function applyBrand(brand: BrandProfile, el: HTMLElement = document.documentElement) {
  for (const [k, v] of Object.entries(brandCssVars(brand.palette))) el.style.setProperty(k, v);
  document.title = brand.name;
}
