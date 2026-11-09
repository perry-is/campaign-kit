// Bundled display fonts (all SIL Open Font License, via @fontsource) that brand text can use.
// The AI picks the closest match to a client's logo lettering from this list.

import "@fontsource/krona-one/400.css";
import "@fontsource/unbounded/700.css";
import "@fontsource/unbounded/900.css";
import "@fontsource/michroma/400.css";
import "@fontsource/montserrat/800.css";
import "@fontsource/poppins/700.css";
import "@fontsource/oswald/600.css";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/lora/700.css";
import "@fontsource/raleway/700.css";
import "@fontsource/orbitron/800.css";
import "@fontsource/archivo-black/400.css";
import "@fontsource/pacifico/400.css";

export type BrandFont = { id: string; family: string; weight: number; look: string };

export const FONTS: BrandFont[] = [
  { id: "krona-one", family: "Krona One", weight: 400, look: "wide extended heavy geometric sans, all-caps friendly" },
  { id: "unbounded", family: "Unbounded", weight: 900, look: "rounded extra-wide black geometric sans, playful-modern" },
  { id: "michroma", family: "Michroma", weight: 400, look: "wide squared techno sans, light-medium weight" },
  { id: "montserrat", family: "Montserrat", weight: 800, look: "classic geometric sans, extra bold, neutral" },
  { id: "poppins", family: "Poppins", weight: 700, look: "friendly round geometric sans, bold" },
  { id: "oswald", family: "Oswald", weight: 600, look: "condensed tall grotesque sans" },
  { id: "bebas-neue", family: "Bebas Neue", weight: 400, look: "tall condensed all-caps display sans" },
  { id: "archivo-black", family: "Archivo Black", weight: 400, look: "heavy grotesque sans, sturdy" },
  { id: "orbitron", family: "Orbitron", weight: 800, look: "futuristic squared sci-fi display" },
  { id: "raleway", family: "Raleway", weight: 700, look: "elegant thin-stroke sans, refined" },
  { id: "playfair-display", family: "Playfair Display", weight: 700, look: "high-contrast didone serif, luxury/editorial" },
  { id: "lora", family: "Lora", weight: 700, look: "warm bookish serif" },
  { id: "pacifico", family: "Pacifico", weight: 400, look: "casual brush script" },
];

export const fontById = (id: string) => FONTS.find((f) => f.id === id) ?? FONTS[0];

export const cssFont = (f: BrandFont, px: number) => `${f.weight} ${px}px "${f.family}"`;

/** Make sure a font is downloaded before drawing it on a canvas. */
export async function ensureFont(f: BrandFont) {
  await document.fonts.load(cssFont(f, 100), "ABCxyz");
}
