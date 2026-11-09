// Logo -> brand palette. Runs locally (no AI call): sample pixels, cluster them,
// then assign roles (background, gradient ends, highlight, text) by lightness,
// saturation and hue spread.

import { type RGB, contrast, hexToHsl, hexToRgb, hslToHex, hueDistance, rgbToHex, shade } from "./color";
import type { BrandPalette } from "./brand";
import { waitForImage } from "../ui/loadImage";

export type Swatch = { hex: string; share: number };

/** k-means over RGB pixels. Deterministic seeding (spread across the sample) so results are stable. */
export function clusterColors(pixels: RGB[], k = 8, iterations = 12): Swatch[] {
  if (pixels.length === 0) return [];
  const step = Math.max(1, Math.floor(pixels.length / k));
  let centers = Array.from({ length: Math.min(k, pixels.length) }, (_, i) => ({ ...pixels[i * step] }));
  let assign = new Array<number>(pixels.length).fill(0);

  for (let it = 0; it < iterations; it++) {
    assign = pixels.map((p) => {
      let best = 0, bestD = Infinity;
      centers.forEach((c, i) => {
        const d = (p.r - c.r) ** 2 + (p.g - c.g) ** 2 + (p.b - c.b) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      });
      return best;
    });
    const sums = centers.map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
    pixels.forEach((p, i) => {
      const s = sums[assign[i]];
      s.r += p.r; s.g += p.g; s.b += p.b; s.n++;
    });
    centers = sums.map((s, i) => (s.n ? { r: s.r / s.n, g: s.g / s.n, b: s.b / s.n } : centers[i]));
  }

  const counts = centers.map(() => 0);
  assign.forEach((a) => counts[a]++);
  return centers
    .map((c, i) => ({ hex: rgbToHex(c), share: counts[i] / pixels.length }))
    .filter((s) => s.share > 0.004)
    .sort((a, b) => b.share - a.share);
}

/** How "colorful" a swatch is: saturation weighted away from near-black/near-white. */
function vividness(hex: string): number {
  const { s, l } = hexToHsl(hex);
  return s * (1 - Math.abs(l - 0.5) * 1.6);
}

/** Merge near-identical swatches (k-means often splits one big area into several shades). */
export function mergeSimilar(swatches: Swatch[], threshold = 28): Swatch[] {
  const out: { rgb: RGB; share: number }[] = [];
  for (const s of [...swatches].sort((a, b) => b.share - a.share)) {
    const rgb = hexToRgb(s.hex);
    const hit = out.find((o) => Math.hypot(o.rgb.r - rgb.r, o.rgb.g - rgb.g, o.rgb.b - rgb.b) < threshold);
    if (hit) {
      const t = hit.share + s.share;
      hit.rgb = {
        r: (hit.rgb.r * hit.share + rgb.r * s.share) / t,
        g: (hit.rgb.g * hit.share + rgb.g * s.share) / t,
        b: (hit.rgb.b * hit.share + rgb.b * s.share) / t,
      };
      hit.share = t;
    } else out.push({ rgb, share: s.share });
  }
  return out.map((o) => ({ hex: rgbToHex(o.rgb), share: o.share })).sort((a, b) => b.share - a.share);
}

/** Warm hues (reds, oranges, yellows) go at the end of the gradient, cool ones at the start. */
const isWarm = (h: number) => h < 70 || h > 330;

export function paletteFromSwatches(input: Swatch[]): BrandPalette {
  const swatches = mergeSimilar(input);
  const vivid = swatches
    .filter((s) => vividness(s.hex) > 0.18)
    .sort((a, b) => vividness(b.hex) * Math.sqrt(b.share) - vividness(a.hex) * Math.sqrt(a.share));

  // Gradient: the most prominent vivid color, then the vivid color furthest from it in hue.
  const fallbackHue = vivid[0] ? hexToHsl(vivid[0].hex).h : 215;
  const from = vivid[0]?.hex ?? hslToHex({ h: 215, s: 0.85, l: 0.55 });
  const fromHue = hexToHsl(from).h;
  const partner = vivid
    .slice(1)
    .map((s) => ({ s, d: hueDistance(fromHue, hexToHsl(s.hex).h) }))
    .filter((x) => x.d > 25)
    .sort((a, b) => b.d * Math.sqrt(b.s.share) - a.d * Math.sqrt(a.s.share))[0]?.s.hex;
  const second = partner ?? hslToHex({ h: fromHue + 40, s: 0.8, l: 0.55 });
  // Order cool -> warm so it reads like a sunrise.
  const [gradFrom, gradTo] =
    isWarm(fromHue) && !isWarm(hexToHsl(second).h) ? [second, from] : [from, second];

  // Background: the dark tone covering the most area, else a deep version of the main hue.
  const dark = swatches.filter((s) => hexToHsl(s.hex).l < 0.22 && s.share > 0.05).sort((a, b) => b.share - a.share)[0];
  const bg = dark
    ? shade(dark.hex, Math.min(0, 0.11 - hexToHsl(dark.hex).l))
    : hslToHex({ h: fallbackHue, s: 0.7, l: 0.1 });

  // Highlight: a light vivid tone not already used; else a light tint of the warm end.
  const lightVivid = vivid.find((s) => s.hex !== from && s.hex !== second && hexToHsl(s.hex).l > 0.6)?.hex;
  const warmEnd = hexToHsl(gradTo);
  const highlight = lightVivid ?? hslToHex({ h: warmEnd.h + 15, s: 0.9, l: 0.75 });

  // Text: a very light tint of the background hue, guaranteed readable.
  const bgHsl = hexToHsl(bg);
  let text = hslToHex({ h: bgHsl.h, s: 0.25, l: 0.93 });
  if (contrast(text, bg) < 7) text = "#ffffff";

  return { background: bg, accentFrom: normalizeAccent(gradFrom), accentTo: normalizeAccent(gradTo), highlight, text };
}

/** Keep accents bright enough to glow on a dark surface. */
function normalizeAccent(hex: string): string {
  const hsl = hexToHsl(hex);
  return hslToHex({ h: hsl.h, s: Math.max(hsl.s, 0.6), l: Math.min(Math.max(hsl.l, 0.5), 0.62) });
}

/** Read an image file/URL in the browser and return its swatches and suggested palette. */
export async function extractBrandFromImage(src: string): Promise<{ swatches: Swatch[]; palette: BrandPalette }> {
  const img = new Image();
  // Only images from another site need CORS mode (so the canvas stays readable).
  const url = new URL(src, location.href);
  if (/^https?:$/.test(url.protocol) && url.origin !== location.origin) img.crossOrigin = "anonymous";
  await waitForImage(img, src);

  const max = 160;
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available");
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  const pixels: RGB[] = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue; // skip transparent pixels in cut-outs
    pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
  }
  const swatches = clusterColors(pixels, 10);
  return { swatches, palette: paletteFromSwatches(swatches) };
}

