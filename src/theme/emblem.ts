// Logo -> emblem, locally and free. Removes a flat background (white box, navy square…),
import { waitForImage } from "../ui/loadImage";
// then finds the separate horizontal bands of the logo (symbol, wordmark, tagline) and keeps
// the biggest one, which is normally the symbol. Logos that are one piece are kept whole.

export type Band = { top: number; bottom: number; mass: number };

/** Split a per-row "ink" profile into bands separated by empty gaps. Pure, for testing. */
export function findBands(rowInk: number[], minInk: number, minGap: number): Band[] {
  const bands: Band[] = [];
  let cur: Band | null = null;
  let gap = 0;
  rowInk.forEach((ink, y) => {
    if (ink > minInk) {
      if (cur && gap < minGap) {
        cur.bottom = y;
        cur.mass += ink;
      } else {
        cur = { top: y, bottom: y, mass: ink };
        bands.push(cur);
      }
      gap = 0;
    } else {
      gap++;
    }
  });
  return bands;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return waitForImage(new Image(), src);
}

export type EmblemResult = { dataUrl: string; aspect: number; wholeLogo: boolean };

/** keepWhole: remove the flat background but keep every part (symbol + wordmark), for posters. */
export async function extractEmblem(logoSrc: string, opts: { keepWhole?: boolean } = {}): Promise<EmblemResult> {
  const img = await loadImage(logoSrc);
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const im = ctx.getImageData(0, 0, w, h);
  const d = im.data;

  // Background = average of the four corners (if they are opaque).
  const corners = [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]].map(([x, y]) => (y * w + x) * 4);
  const opaqueCorners = corners.filter((i) => d[i + 3] > 200);
  const flatBg =
    opaqueCorners.length >= 3
      ? [0, 1, 2].map((k) => opaqueCorners.reduce((s, i) => s + d[i + k], 0) / opaqueCorners.length)
      : null;

  // Make background pixels transparent, with a soft edge.
  if (flatBg) {
    for (let i = 0; i < d.length; i += 4) {
      const dist = Math.hypot(d[i] - flatBg[0], d[i + 1] - flatBg[1], d[i + 2] - flatBg[2]);
      const a = Math.max(0, Math.min(1, (dist - 28) / 40));
      d[i + 3] = Math.round(d[i + 3] * a);
    }
    ctx.putImageData(im, 0, 0);
  }

  const rowInk: number[] = [];
  const colInk = new Array<number>(w).fill(0);
  for (let y = 0; y < h; y++) {
    let ink = 0;
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 60) {
        ink++;
        colInk[x]++;
      }
    }
    rowInk.push(ink);
  }

  const bands = findBands(rowInk, w * 0.004, Math.max(3, Math.round(h * 0.018)));
  const best = [...bands].sort((a, b) => b.mass - a.mass)[0];
  const wholeLogo = opts.keepWhole || bands.length <= 1 || !best;
  const top = wholeLogo ? bands[0]?.top ?? 0 : best.top;
  const bottom = wholeLogo ? bands[bands.length - 1]?.bottom ?? h - 1 : best.bottom;

  // Horizontal extent inside the chosen band.
  let left = w, right = 0;
  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 60) {
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (right <= left) { left = 0; right = w - 1; }

  const pad = Math.round(Math.max(right - left, bottom - top) * 0.04);
  const sx = Math.max(0, left - pad), sy = Math.max(0, top - pad);
  const sw = Math.min(w, right + pad) - sx, sh = Math.min(h, bottom + pad) - sy;
  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  out.getContext("2d")!.drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh);
  return { dataUrl: out.toDataURL("image/png"), aspect: sw / sh, wholeLogo };
}
