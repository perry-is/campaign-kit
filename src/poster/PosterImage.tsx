import { useEffect, useState } from "react";
import type { EventFacts, Poster } from "../data/model";
import type { BrandProfile } from "../theme/brand";
import { NetworkArt } from "../ui/kit";
import { composePoster, loadImage, type PosterFormat } from "./compose";
import { pickSource } from "./platforms";
import { posterText } from "./text";

/** Renders a poster from its art + the current facts, so fixing a fact updates every poster. */
export function PosterImage(props: {
  poster: Poster;
  facts: EventFacts;
  brand: BrandProfile;
  format?: PosterFormat;
  /** Exact platform size; picks the poster's matching wide/tall version when it has one. */
  size?: { w: number; h: number };
  partners?: string[];
  onRendered?: (png: string) => void;
}) {
  const { poster, facts, brand, format = "portrait", size, partners = [], onRendered } = props;
  const src = size ? pickSource(poster, size.w, size.h) : poster.src;
  const [png, setPng] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const key = JSON.stringify([src, size, poster.style, poster.layout, facts.title, facts.start, facts.end, facts.timezone, facts.venue, facts.address, facts.price, facts.delivery, brand.palette, brand.icon, brand.logoUrl, format, partners]);

  useEffect(() => {
    if (poster.status !== "ready" || !poster.src) return;
    let live = true;
    setFailed(false);
    composePoster({ src, style: poster.style, layout: poster.layout, brand, text: posterText(facts), format, size, partners })
      .then((out) => {
        if (!live) return;
        setPng(out);
        onRendered?.(out);
      })
      .catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (poster.status === "generating") {
    return (
      <div className="poster-loading">
        <NetworkArt seed={poster.id.charCodeAt(0)} />
        <span className="small muted"><span className="spinner" /> Painting…</span>
      </div>
    );
  }
  if (poster.status === "failed" || failed) return <div className="poster-loading small muted">Couldn't draw this one.</div>;
  return png ? <img src={png} alt="Poster" /> : <div className="poster-loading"><span className="spinner" /></div>;
}

/** Any image (ck-media://, data URL) as a data URL, optionally scaled down, for sending to the AI. */
export async function imageToDataUrl(src: string, maxSide = 1536, type: "image/png" | "image/jpeg" = "image/jpeg"): Promise<string> {
  const img = await loadImage(src);
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL(type, 0.9);
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "poster";
