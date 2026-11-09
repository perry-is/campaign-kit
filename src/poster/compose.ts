// Poster composer. The AI paints; this sets the words. Title, date, time, venue and price come
// straight from the confirmed facts, so they are always exactly right, and the real logo is
// placed (never redrawn). Renders portrait (1024×1536) or Instagram 4:5 (1080×1350).

import { type BrandProfile, DEFAULT_ICON, readableOn } from "../theme/brand";
import { withAlpha } from "../theme/color";
import { extractEmblem } from "../theme/emblem";
import { cssFont, ensureFont, fontById, FONTS } from "../theme/fonts";
import type { PosterText } from "./text";
import { waitForImage } from "../ui/loadImage";

export type PosterFormat = "portrait" | "insta";
export const FORMAT_SIZE: Record<PosterFormat, { w: number; h: number }> = {
  portrait: { w: 1024, h: 1536 },
  insta: { w: 1080, h: 1350 },
};

export type ComposeInput = {
  src: string;
  style: "typeset" | "full" | "designed" | "remix";
  layout: "top" | "bottom" | "band";
  brand: BrandProfile;
  text: PosterText;
  format: PosterFormat;
  /** Partner / sponsor logos (exact files), shown in a strip along the bottom with the brand logo. */
  partners?: string[];
  /** Exact output size for a platform (overrides format). */
  size?: { w: number; h: number };
};

/** Center an image on a canvas of another shape, over a blurred, darkened copy of itself. */
async function letterbox(src: string, W: number, H: number, bg: string): Promise<string> {
  const img = await loadImage(src);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.filter = "blur(32px) brightness(0.55)";
  drawCover(ctx, img, -60, -60, W + 120, H + 120);
  ctx.restore();
  const k = Math.min(W / img.naturalWidth, H / img.naturalHeight);
  ctx.drawImage(img, (W - img.naturalWidth * k) / 2, (H - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
  return c.toDataURL("image/png");
}

const BODY = "Figtree";

export function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  if (!src.startsWith("data:")) img.crossOrigin = "anonymous"; // keeps the canvas exportable
  return waitForImage(img, src);
}

const logoCache = new Map<string, Promise<HTMLImageElement>>();
function cleanLogo(url: string) {
  if (!logoCache.has(url)) logoCache.set(url, extractEmblem(url, { keepWhole: true }).then((e) => loadImage(e.dataUrl)));
  return logoCache.get(url)!;
}

type PreparedLogo = { img: HTMLImageElement; card: boolean };
const partnerCache = new Map<string, Promise<PreparedLogo>>();

/**
 * Partner logos come in every style. A logo on a light background (dark text on white) keeps
 * its background and sits on a small white card; transparent or dark-background logos are
 * cleaned and placed straight on the strip.
 */
function preparePartner(url: string): Promise<PreparedLogo> {
  if (!partnerCache.has(url)) {
    partnerCache.set(url, (async () => {
      const img = await loadImage(url);
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const pts = [[1, 1], [c.width - 2, 1], [1, c.height - 2], [c.width - 2, c.height - 2]];
      const light = pts.filter(([x, y]) => {
        const d = ctx.getImageData(x, y, 1, 1).data;
        return d[3] > 200 && (0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]) / 255 > 0.8;
      }).length >= 3;
      if (light) return { img, card: true };
      return { img: await cleanLogo(url), card: false };
    })());
  }
  return partnerCache.get(url)!;
}

/** Split text into lines that fit maxWidth with the current ctx.font. */
export function wrapLines(measure: (s: string) => number, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (line && measure(test) > maxWidth) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

type Block = { lines: string[]; font: string; size: number; color: string | CanvasGradient; gap: number; spacing?: number };

export async function composePoster(input: ComposeInput): Promise<string> {
  const { brand, text, layout } = input;
  /** The AI drew the text itself (whole-poster modes): show its image, don't typeset over it. */
  const aiText = input.style !== "typeset";

  // Exact-text posters are designed tall. For a wide or square size, center the finished tall
  // poster on a blurred backdrop rather than squeezing its layout.
  if (!aiText && input.size && input.size.w / input.size.h > 0.87) {
    const tall = await composePoster({ ...input, size: undefined, format: "portrait" });
    return letterbox(tall, input.size.w, input.size.h, brand.palette.background);
  }
  const p = brand.palette;
  const icon = brand.icon ?? DEFAULT_ICON;
  const titleFont = fontById(icon.fontId) ?? FONTS[0];
  await Promise.all([ensureFont(titleFont), document.fonts.load(`600 40px "${BODY}"`)]);

  const [art, logo, partners] = await Promise.all([
    loadImage(input.src),
    cleanLogo(brand.logoUrl).catch(() => null),
    Promise.all((input.partners ?? []).map((u) => preparePartner(u).catch(() => null))).then((xs) => xs.filter((x): x is PreparedLogo => !!x)),
  ]);
  // Canvas size: AI-designed flyers keep their own shape (wide, tall or square) as "the poster".
  let { w: W, h: H } = input.size ?? FORMAT_SIZE[input.format];
  if (!input.size && aiText && input.format === "portrait") {
    const k = Math.min(1, 1536 / Math.max(art.naturalWidth, art.naturalHeight));
    W = Math.round(art.naturalWidth * k);
    H = Math.round(art.naturalHeight * k);
  }
  // Where the AI's image sits on the canvas (letterboxed for Instagram 4:5).
  const fit = Math.min(W / art.naturalWidth, H / art.naturalHeight);
  const imgRect = aiText
    ? { x: (W - art.naturalWidth * fit) / 2, y: (H - art.naturalHeight * fit) / 2, w: art.naturalWidth * fit, h: art.naturalHeight * fit }
    : { x: 0, y: 0, w: W, h: H };
  // With partners, the brand logo joins them in a strip along the bottom.
  const stripH = partners.length ? H * 0.085 : 0;
  const inset = stripH ? stripH + H * 0.015 : 0;

  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = p.background;
  ctx.fillRect(0, 0, W, H);

  if (aiText) {
    // The AI already drew the text: show the whole image. When the shape differs (e.g. a wide flyer
    // in Instagram 4:5), fit it on a blurred copy of itself so no text is cut off.
    if (imgRect.w < W - 1 || imgRect.h < H - 1) {
      ctx.save();
      ctx.filter = "blur(28px) brightness(0.6)";
      drawCover(ctx, art, -40, -40, W + 80, H + 80);
      ctx.restore();
    }
    ctx.drawImage(art, imgRect.x, imgRect.y, imgRect.w, imgRect.h);
  } else {
    drawCover(ctx, art, 0, 0, W, H);
  }

  const pad = W * 0.07;
  const maxW = W - pad * 2;

  if (input.style === "typeset") {
    // ---- Text blocks, sized to fit ----
    const measureWith = (font: string, spacing = 0) => (s: string) => {
      ctx.font = font;
      ctx.letterSpacing = `${spacing}px`;
      return ctx.measureText(s).width;
    };
    const title = icon.uppercase ? text.title.toUpperCase() : text.title;
    let tSize = Math.round(W * 0.088);
    let tLines: string[] = [];
    const titleSpacing = () => icon.letterSpacing * tSize * 0.6;
    for (; tSize >= W * 0.045; tSize -= 2) {
      tLines = wrapLines(measureWith(cssFont(titleFont, tSize), titleSpacing()), title, layout === "band" ? maxW * 0.9 : maxW);
      if (tLines.length <= 3) break;
    }
    const accentGrad = ctx.createLinearGradient(0, 0, W, 0);
    accentGrad.addColorStop(0, p.accentFrom);
    accentGrad.addColorStop(1, p.accentTo);

    const blocks: Block[] = [
      { lines: tLines, font: cssFont(titleFont, tSize), size: tSize, color: p.text, gap: W * 0.03, spacing: titleSpacing() },
      { lines: [text.date].filter(Boolean), font: `700 ${Math.round(W * 0.042)}px "${BODY}"`, size: Math.round(W * 0.042), color: p.highlight, gap: W * 0.008 },
      { lines: [text.time].filter(Boolean), font: `600 ${Math.round(W * 0.036)}px "${BODY}"`, size: Math.round(W * 0.036), color: p.text, gap: W * 0.02 },
      { lines: [text.venue].filter(Boolean), font: `700 ${Math.round(W * 0.033)}px "${BODY}"`, size: Math.round(W * 0.033), color: p.text, gap: W * 0.006 },
      { lines: [text.address].filter(Boolean), font: `500 ${Math.round(W * 0.028)}px "${BODY}"`, size: Math.round(W * 0.028), color: withAlpha(p.text, 0.82), gap: 0 },
    ].filter((b) => b.lines.length);

    const lineH = (b: Block) => b.size * 1.18;
    const priceH = text.price ? W * 0.07 : 0;
    const contentH = blocks.reduce((s, b) => s + b.lines.length * lineH(b) + b.gap, 0) + (priceH ? priceH + W * 0.03 : 0);

    // ---- Shade behind the text, by layout ----
    let startY: number;
    let align: CanvasTextAlign = "center";
    let x = W / 2;
    if (layout === "top") {
      const g = ctx.createLinearGradient(0, 0, 0, Math.max(H * 0.5, contentH + H * 0.16));
      g.addColorStop(0, withAlpha(p.background, 0.92));
      g.addColorStop(0.65, withAlpha(p.background, 0.6));
      g.addColorStop(1, withAlpha(p.background, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      startY = H * 0.065;
    } else if (layout === "bottom") {
      const top = H - inset - Math.max(H * 0.52, contentH + H * 0.2);
      const g = ctx.createLinearGradient(0, top, 0, H);
      g.addColorStop(0, withAlpha(p.background, 0));
      g.addColorStop(0.35, withAlpha(p.background, 0.72));
      g.addColorStop(1, withAlpha(p.background, 0.95));
      ctx.fillStyle = g;
      ctx.fillRect(0, top, W, H - top);
      startY = H - inset - H * 0.06 - contentH;
      align = "left";
      x = pad;
    } else {
      // Frosted glass panel across the lower middle.
      const panelPad = W * 0.05;
      const ph = contentH + panelPad * 2;
      const py = Math.min(H * 0.69 - ph / 2, H - inset - ph - H * 0.04);
      const px = pad * 0.7, pw = W - pad * 1.4;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, W * 0.035);
      ctx.clip();
      ctx.filter = "blur(22px)";
      drawCover(ctx, art, 0, 0, W, H);
      ctx.filter = "none";
      ctx.fillStyle = withAlpha(p.background, 0.62);
      ctx.fillRect(px, py, pw, ph);
      ctx.restore();
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, W * 0.035);
      ctx.strokeStyle = withAlpha(p.text, 0.16);
      ctx.lineWidth = 2;
      ctx.stroke();
      startY = py + panelPad;
    }

    // ---- Draw the text ----
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    let y = startY;
    blocks.forEach((b, i) => {
      ctx.font = b.font;
      ctx.letterSpacing = `${b.spacing ?? 0}px`;
      ctx.fillStyle = b.color;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = i === 0 ? 18 : 10;
      ctx.shadowOffsetY = 2;
      for (const line of b.lines) {
        ctx.fillText(line, x, y);
        y += lineH(b);
      }
      ctx.restore();
      y += b.gap;
    });
    ctx.letterSpacing = "0px";

    // ---- Price badge ----
    if (text.price) {
      y += W * 0.02;
      const size = Math.round(W * 0.03);
      ctx.font = `800 ${size}px "${BODY}"`;
      const label = text.price.toUpperCase();
      const tw = ctx.measureText(label).width;
      const bw = tw + size * 1.8, bh = priceH * 0.78;
      const bx = align === "center" ? W / 2 - bw / 2 : x;
      const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, p.accentFrom);
      g.addColorStop(1, p.accentTo);
      ctx.beginPath();
      ctx.roundRect(bx, y, bw, bh, bh / 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.fillStyle = readableOn(p.accentFrom);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, bx + bw / 2, y + bh / 2 + 1);
    }
  }

  // ---- Partner strip: brand logo + partner logos, exact files, never AI-drawn ----
  if (partners.length) {
    const y0 = H - stripH;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y0, W, stripH);
    ctx.clip();
    ctx.filter = "blur(18px)";
    drawCover(ctx, art, 0, 0, W, H);
    ctx.filter = "none";
    ctx.fillStyle = withAlpha(p.background, 0.82);
    ctx.fillRect(0, y0, W, stripH);
    ctx.restore();
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, p.accentFrom);
    g.addColorStop(1, p.accentTo);
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, W, 3);

    const items: { img: HTMLImageElement; card: boolean }[] = [...(logo ? [{ img: logo, card: false }] : []), ...partners];
    const maxH = stripH * 0.6;
    const gap = W * 0.045;
    const sizes = items.map(({ img, card }) => {
      const pad = card ? maxH * 0.14 : 0;
      const h = maxH - pad * 2;
      const w = Math.min(W * 0.26, h * (img.naturalWidth / img.naturalHeight));
      return { w: w + pad * 2, h: maxH, iw: w, ih: Math.min(h, w * (img.naturalHeight / img.naturalWidth)), pad };
    });
    let total = sizes.reduce((s2, z) => s2 + z.w, 0) + gap * (items.length - 1);
    const scale = total > W * 0.9 ? (W * 0.9) / total : 1;
    total *= scale;
    let x = (W - total) / 2;
    const cy = y0 + 3 + (stripH - 3) / 2;
    items.forEach((it, i) => {
      const z = sizes[i];
      const w = z.w * scale, h = z.h * scale;
      if (it.card) {
        ctx.beginPath();
        ctx.roundRect(x, cy - h / 2, w, h, h * 0.18);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }
      const iw = z.iw * scale, ih = z.ih * scale;
      ctx.drawImage(it.img, x + (w - iw) / 2, cy - ih / 2, iw, ih);
      if (i < items.length - 1) {
        ctx.fillStyle = withAlpha(p.text, 0.18);
        ctx.fillRect(x + w + (gap * scale) / 2 - 1, cy - h * 0.35, 2, h * 0.7);
      }
      x += w + gap * scale;
    });
  }

  // ---- The real logo (never AI-drawn), on its own frosted badge so it never fights the art ----
  if (logo && !partners.length) {
    let lw = W * (input.style === "full" ? 0.17 : 0.19);
    if (input.style === "designed" || input.style === "remix") {
      // The AI left the top-left corner (about 20% × 15%) empty for the logo.
      lw = Math.min(imgRect.w * 0.15, (imgRect.h * 0.11) * (logo.naturalWidth / logo.naturalHeight));
    }
    const lh = lw * (logo.naturalHeight / logo.naturalWidth);
    const bp = W * 0.022; // badge padding
    let lx = W / 2 - lw / 2, ly = H - lh - H * 0.04 - bp;
    if (layout === "bottom") { lx = W * 0.05 + bp; ly = H * 0.035 + bp; }
    if (layout === "band") { ly = H * 0.035 + bp; }
    if (input.style === "full") { lx = W - lw - W * 0.045 - bp; ly = H - lh - H * 0.03 - bp; }
    if (input.style === "designed" || input.style === "remix") { lx = imgRect.x + imgRect.w * 0.03 + bp; ly = imgRect.y + imgRect.h * 0.03 + bp; }
    const bx = lx - bp, by = ly - bp, bw = lw + bp * 2, bh = lh + bp * 2, br = W * 0.03;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, br);
    ctx.clip();
    ctx.filter = "blur(18px)";
    drawCover(ctx, art, 0, 0, W, H); // blurred art behind the badge
    ctx.filter = "none";
    ctx.fillStyle = withAlpha(p.background, 0.6);
    ctx.fillRect(bx, by, bw, bh);
    ctx.restore();
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, br);
    ctx.strokeStyle = withAlpha(p.text, 0.14);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = withAlpha(p.accentFrom, 0.5);
    ctx.shadowBlur = 18;
    ctx.drawImage(logo, lx, ly, lw, lh);
    ctx.restore();
  }

  return c.toDataURL("image/png");
}
