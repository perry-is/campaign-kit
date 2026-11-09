// Draws the 1024×1024 app icon: macOS rounded-square tile in the brand colors, the emblem
import { waitForImage } from "../ui/loadImage";
// (or AI icon art) on top, and the short word set underneath in the brand's font.

import { type BrandProfile, DEFAULT_ICON } from "./brand";
import { withAlpha } from "./color";
import { cssFont, ensureFont, fontById } from "./fonts";
import { extractEmblem } from "./emblem";

const SIZE = 1024;
// Apple's macOS icon grid: the tile is 824×824 inside the 1024 canvas, corner radius ≈ 185.
const TILE = { x: 100, y: 100, s: 824, r: 185 };

function tilePath(ctx: CanvasRenderingContext2D) {
  const { x, y, s, r } = TILE;
  ctx.beginPath();
  ctx.roundRect(x, y, s, s, r);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return waitForImage(new Image(), src);
}

export async function renderAppIcon(brand: BrandProfile): Promise<string> {
  const icon = brand.icon ?? DEFAULT_ICON;
  const p = brand.palette;
  const font = fontById(icon.fontId);
  await ensureFont(font);

  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d")!;

  // Drop shadow under the tile, like system icons.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 12;
  tilePath(ctx);
  ctx.fillStyle = p.background;
  ctx.fill();
  ctx.restore();

  ctx.save();
  tilePath(ctx);
  ctx.clip();

  const hasText = icon.word.trim().length > 0;
  if (icon.style === "ai" && icon.aiArtUrl) {
    // AI art fills the tile; it was drawn with calm space at the bottom for the word.
    const art = await loadImage(icon.aiArtUrl);
    ctx.drawImage(art, TILE.x, TILE.y, TILE.s, TILE.s);
  } else {
    // Background: deep brand tone with soft glows of both accents.
    ctx.fillStyle = p.background;
    ctx.fillRect(0, 0, SIZE, SIZE);
    const g1 = ctx.createRadialGradient(260, 260, 0, 260, 260, 620);
    g1.addColorStop(0, withAlpha(p.accentFrom, 0.38));
    g1.addColorStop(1, withAlpha(p.accentFrom, 0));
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, SIZE, SIZE);
    const g2 = ctx.createRadialGradient(800, 760, 0, 800, 760, 620);
    g2.addColorStop(0, withAlpha(p.accentTo, 0.3));
    g2.addColorStop(1, withAlpha(p.accentTo, 0));
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, SIZE, SIZE);

    const emblem = await extractEmblem(brand.logoUrl);
    const img = await loadImage(emblem.dataUrl);
    // Emblem box: upper part of the tile when there's a word, centered otherwise.
    const box = hasText ? { x: 170, y: 175, w: 684, h: 470 } : { x: 190, y: 190, w: 644, h: 644 };
    const scale = Math.min(box.w / img.naturalWidth, box.h / img.naturalHeight);
    const ew = img.naturalWidth * scale, eh = img.naturalHeight * scale;
    ctx.save();
    ctx.shadowColor = withAlpha(p.accentFrom, 0.55);
    ctx.shadowBlur = 40;
    ctx.drawImage(img, box.x + (box.w - ew) / 2, box.y + (box.h - eh) / 2, ew, eh);
    ctx.restore();
  }

  if (hasText) {
    const word = icon.uppercase ? icon.word.toUpperCase() : icon.word;
    const maxW = 640, maxH = 132;
    let px = maxH;
    const measure = () => {
      ctx.font = cssFont(font, px);
      ctx.letterSpacing = `${icon.letterSpacing * px}px`;
      return ctx.measureText(word).width;
    };
    while (measure() > maxW && px > 40) px -= 2;

    const y = icon.style === "ai" && icon.aiArtUrl ? 820 : 800;
    const width = measure();
    const x = SIZE / 2 - width / 2;
    ctx.textBaseline = "alphabetic";
    let fill: string | CanvasGradient;
    switch (icon.wordFill) {
      case "gradient": {
        const g = ctx.createLinearGradient(x, 0, x + width, 0);
        g.addColorStop(0, p.accentFrom);
        g.addColorStop(1, p.accentTo);
        fill = g;
        break;
      }
      case "highlight": fill = p.highlight; break;
      case "text": fill = p.text; break;
      default: fill = p.accentTo;
    }
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = fill;
    ctx.fillText(word, x, y);
    ctx.restore();
  }

  // Subtle inner rim of light, as on system icons.
  ctx.restore();
  tilePath(ctx);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.stroke();

  return c.toDataURL("image/png");
}
