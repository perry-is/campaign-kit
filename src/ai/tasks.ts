// The AI jobs the screens use. Each builds a structured request, sends it through the
// transport, and validates/normalizes the answer before it touches app data.

import type { EventFacts } from "../data/model";
import { parseWhen } from "../data/parseWhen";
import type { BrandProfile } from "../theme/brand";
import { type AITransport, type ContentPart, unwrap } from "./bridge";
import {
  COPY_SCHEMA, CREATIVE_SCHEMA, EXTRACTION_INSTRUCTIONS, EXTRACTION_SCHEMA, FONT_MATCH_INSTRUCTIONS, ICON_IMAGE_MODEL,
  REVISE_SCHEMA, TEXT_MODEL, TITLES_SCHEMA, copyInstructions, fontMatchSchema, iconArtPrompt,
  ART_CHECK_INSTRUCTIONS, ART_CHECK_SCHEMA, FACT_CHECK_INSTRUCTIONS, FACT_CHECK_SCHEMA, POSTER_MODELS,
  posterArtPrompt, posterRefinePrompt, type PosterArtInput, type PosterLayout, type PosterQuality,
  STYLE_SUMMARY_INSTRUCTIONS, STYLE_SUMMARY_SCHEMA, TWEAK_RULE_INSTRUCTIONS, TWEAK_RULE_SCHEMA,
  SHAPE_SIZE, designedFlyerPrompt, relayoutPrompt, remixFlyerPrompt, type FlyerShape, creativeInstructions, reviseInstructions, titleInstructions, voiceBlock,
  type CopyOutput, type CreativeOutput, type ExtractionOutput,
} from "./prompts";

export type Attachment = { name: string; mime: string; dataUrl: string };

const FACT_KEYS = ["title", "start", "end", "timezone", "venue", "address", "delivery", "price", "host"] as const;

const voiceOf = (b: BrandProfile) => voiceBlock(b.name, b.voice);

function factsPayload(f: EventFacts, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ event_facts: f, ...extra });
}

const text = (t: string): ContentPart => ({ type: "input_text", text: t });

export function attachmentPart(a: Attachment): ContentPart | null {
  if (a.mime.startsWith("image/")) return { type: "input_image", image_url: a.dataUrl };
  if (a.mime === "application/pdf") return { type: "input_file", filename: a.name || "flyer.pdf", file_data: a.dataUrl };
  return null;
}

/** "2026-12-04" from anything that starts with a date; "" otherwise. */
export function normDate(v: string | null): string {
  return /^(\d{4}-\d{2}-\d{2})/.exec(v?.trim() ?? "")?.[1] ?? "";
}

/** "HH:mm" from "18:00", "6:30", "18:00:00"; "" if it isn't a clock time. */
export function normTime(v: string | null): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(v?.trim() ?? "");
  if (!m || +m[1] > 23 || +m[2] > 59) return "";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** Normalize "2026-12-04T17:30:00" or similar to the form input's "YYYY-MM-DDTHH:mm". */
export function toLocalInput(v: string | null): string {
  if (!v) return "";
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(v.trim());
  return m ? `${m[1]}T${m[2]}` : "";
}

export type ExtractedFacts = {
  patch: Partial<EventFacts>;
  checkFields: (keyof EventFacts)[];
  topic: string | null;
  notes: string[];
};

export async function extractFacts(
  ai: AITransport,
  input: { text: string; attachments: Attachment[]; today: string; defaultTimezone: string },
): Promise<ExtractedFacts> {
  const parts: ContentPart[] = [
    text(JSON.stringify({ today: input.today, default_timezone_if_unstated: input.defaultTimezone, source_material: input.text })),
    ...input.attachments.map(attachmentPart).filter((p): p is ContentPart => p !== null),
  ];
  const out = unwrap(
    await ai.respond<ExtractionOutput>({
      model: TEXT_MODEL,
      instructions: EXTRACTION_INSTRUCTIONS,
      content: parts,
      schema: EXTRACTION_SCHEMA,
      schemaName: "event_facts",
      maxOutputTokens: 2000,
    }),
  );

  // Only fill fields the AI actually found; keep the user's defaults for the rest.
  const patch: Partial<EventFacts> = {};
  if (out.title?.trim()) patch.title = out.title.trim();
  // If the AI missed the date or times, the local reader fills the gaps from the pasted text.
  const backup = parseWhen(input.text, input.today);
  const aiDate = normDate(out.date), aiStart = normTime(out.start_time), aiEnd = normTime(out.end_time);
  const date = aiDate || backup.date || "";
  const start = aiStart || (aiDate && aiDate !== backup.date ? "" : backup.start) || "";
  const end = aiEnd || (start && start === backup.start ? backup.end : "") || "";
  const usedBackup = (!aiDate && !!date) || (!aiStart && !!start);
  if (date) {
    // A found date is kept even when the time isn't ("YYYY-MM-DDT" = date, time still to pick).
    patch.start = `${date}T${start}`;
    if (end) patch.end = `${normDate(out.end_date) || date}T${end}`;
  }
  for (const k of ["timezone", "venue", "address", "price", "host"] as const) {
    const v = out[k]?.trim();
    if (v) patch[k] = v;
  }
  if (out.delivery) patch.delivery = out.delivery;

  const map: Record<string, keyof EventFacts> = { date: "start", start_time: "start", end_time: "end" };
  const checkFields = out.needs_check
    .map((k) => map[k] ?? k)
    .filter((k): k is (typeof FACT_KEYS)[number] => (FACT_KEYS as readonly string[]).includes(k));
  if (!date || !start || usedBackup) checkFields.push("start");
  return { patch, checkFields: [...new Set(checkFields)], topic: out.topic, notes: out.notes.slice(0, 3) };
}

export async function proposeTitleAndDescription(
  ai: AITransport,
  brand: BrandProfile,
  input: { facts: EventFacts; sourceText: string; topic?: string | null; notes?: string[]; direction?: string },
): Promise<{ titles: string[]; description: string }> {
  const out = unwrap(
    await ai.respond<CreativeOutput>({
      model: TEXT_MODEL,
      instructions: creativeInstructions(voiceOf(brand)),
      content: [
        text(
          factsPayload(input.facts, {
            topic: input.topic ?? null,
            source_notes: input.notes ?? [],
            source_excerpt: input.sourceText.slice(0, 4000),
            direction: input.direction || null,
          }),
        ),
      ],
      schema: CREATIVE_SCHEMA,
      schemaName: "title_and_description",
      maxOutputTokens: 2500,
    }),
  );
  const titles = cleanList([out.recommended_title, ...out.alternative_titles]);
  return { titles, description: out.description.trim() };
}

export async function suggestTitles(ai: AITransport, brand: BrandProfile, facts: EventFacts, direction: string): Promise<string[]> {
  const out = unwrap(
    await ai.respond<{ titles: string[] }>({
      model: TEXT_MODEL,
      instructions: titleInstructions(voiceOf(brand)),
      content: [text(factsPayload(facts, { current_title: facts.title, title_direction: direction }))],
      schema: TITLES_SCHEMA,
      schemaName: "titles",
      maxOutputTokens: 800,
    }),
  );
  return cleanList(out.titles);
}

export async function writeCopy(ai: AITransport, brand: BrandProfile, facts: EventFacts): Promise<CopyOutput> {
  const out = unwrap(
    await ai.respond<CopyOutput>({
      model: TEXT_MODEL,
      instructions: copyInstructions(voiceOf(brand)),
      content: [text(factsPayload(facts, { accepted_description: facts.description || null }))],
      schema: COPY_SCHEMA,
      schemaName: "campaign_copy",
      maxOutputTokens: 5000,
    }),
  );
  return {
    listing: out.listing.trim(),
    facebook: out.facebook.trim(),
    instagram: out.instagram.trim(),
    linkedin: out.linkedin.trim(),
    creative_direction: out.creative_direction.trim(),
  };
}

export async function reviseText(
  ai: AITransport,
  brand: BrandProfile,
  input: { facts: EventFacts; kind: string; current: string; request: string },
): Promise<string> {
  const out = unwrap(
    await ai.respond<{ text: string }>({
      model: TEXT_MODEL,
      instructions: reviseInstructions(voiceOf(brand)),
      content: [text(factsPayload(input.facts, { text_kind: input.kind, current_text: input.current, revision_request: input.request }))],
      schema: REVISE_SCHEMA,
      schemaName: "revision",
      maxOutputTokens: 2500,
    }),
  );
  return out.text.trim();
}

function cleanList(items: string[]): string[] {
  const seen = new Set<string>();
  return items
    .map((t) => t.trim().replace(/^["“]|["”]$/g, ""))
    .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
}

// ---------- Brand font + icon art ----------

export type FontMatch = { fontId: string; uppercase: boolean; letterSpacing: number; reason: string };

export async function matchBrandFont(ai: AITransport, logoDataUrl: string, catalog: { id: string; family: string; look: string }[]): Promise<FontMatch> {
  const out = unwrap(
    await ai.respond<{ font_id: string; uppercase: boolean; letter_spacing: number; reason: string }>({
      model: TEXT_MODEL,
      instructions: FONT_MATCH_INSTRUCTIONS,
      content: [
        text(JSON.stringify({ catalog: catalog.map((f) => ({ id: f.id, name: f.family, look: f.look })) })),
        { type: "input_image", image_url: logoDataUrl },
      ],
      schema: fontMatchSchema(catalog.map((f) => f.id)),
      schemaName: "font_match",
      maxOutputTokens: 600,
    }),
  );
  return {
    fontId: catalog.some((f) => f.id === out.font_id) ? out.font_id : catalog[0].id,
    uppercase: out.uppercase,
    letterSpacing: Math.max(0, Math.min(0.2, out.letter_spacing)),
    reason: out.reason.trim(),
  };
}

export async function makeIconArt(ai: AITransport, logoDataUrl: string, background: string): Promise<string> {
  return unwrap(
    await ai.image({ model: ICON_IMAGE_MODEL, prompt: iconArtPrompt(background), images: [logoDataUrl], size: "1024x1024", quality: "high" }),
  );
}

// ---------- Posters ----------

/** The image API takes up to 4 reference images: the logo plus up to 3 style examples. */
export const MAX_STYLE_REFS = 3;

export async function makePosterArt(
  ai: AITransport,
  input: Omit<PosterArtInput, "styleRefCount"> & { quality: PosterQuality; logoDataUrl: string; styleRefs?: string[]; saveAs: string },
): Promise<{ url: string; prompt: string; model: string }> {
  const refs = (input.styleRefs ?? []).slice(0, MAX_STYLE_REFS);
  const prompt = posterArtPrompt({ ...input, styleRefCount: refs.length });
  const model = POSTER_MODELS[input.quality];
  const url = unwrap(
    await ai.image({ model, prompt, images: [input.logoDataUrl, ...refs], size: "1024x1536", quality: "high", saveAs: input.saveAs }),
  );
  return { url, prompt, model };
}

export async function refinePosterArt(
  ai: AITransport,
  input: { sourceDataUrl: string; instruction: string; layout: PosterLayout; hasText: boolean; quality: PosterQuality; saveAs: string; shape?: FlyerShape },
): Promise<{ url: string; prompt: string; model: string }> {
  const prompt = posterRefinePrompt(input.instruction, input.layout, input.hasText);
  const model = POSTER_MODELS[input.quality];
  const url = unwrap(
    await ai.image({ model, prompt, images: [input.sourceDataUrl], size: SHAPE_SIZE[input.shape ?? "tall"], quality: "high", saveAs: input.saveAs }),
  );
  return { url, prompt, model };
}

/** Art-only posters: make sure the AI didn't sneak in text or a fake logo. */
export async function checkPosterArt(ai: AITransport, imageDataUrl: string): Promise<{ ok: boolean; note: string }> {
  const out = unwrap(
    await ai.respond<{ has_text: boolean; has_logo: boolean; note: string }>({
      model: TEXT_MODEL,
      instructions: ART_CHECK_INSTRUCTIONS,
      content: [{ type: "input_image", image_url: imageDataUrl }],
      schema: ART_CHECK_SCHEMA,
      schemaName: "art_check",
      maxOutputTokens: 400,
    }),
  );
  const ok = !out.has_text && !out.has_logo;
  return { ok, note: ok ? "" : out.note.trim() || "The artwork contains stray text or a logo-like mark." };
}

/** AI-drawn text: every required line must be there, exactly, and nothing invented. */
export async function factCheckPoster(
  ai: AITransport,
  imageDataUrl: string,
  lines: string[],
  allowedPhrases: string[] = [],
  description = "",
): Promise<{ ok: boolean; problems: string[] }> {
  const out = unwrap(
    await ai.respond<{ passed: boolean; problems: string[] }>({
      model: TEXT_MODEL,
      instructions: FACT_CHECK_INSTRUCTIONS,
      content: [
        text(JSON.stringify({ required_lines: lines, event_description: description, allowed_brand_phrases: allowedPhrases })),
        { type: "input_image", image_url: imageDataUrl },
      ],
      schema: FACT_CHECK_SCHEMA,
      schemaName: "fact_check",
      maxOutputTokens: 600,
    }),
  );
  const problems = out.problems.map((p) => p.trim()).filter(Boolean);
  return { ok: out.passed && problems.length === 0, problems };
}

// ---------- Brand style memory ----------

export async function summarizeStyle(ai: AITransport, exampleDataUrls: string[]): Promise<{ summary: string; phrases: string[] }> {
  const out = unwrap(
    await ai.respond<{ summary: string; phrases: string[] }>({
      model: TEXT_MODEL,
      instructions: STYLE_SUMMARY_INSTRUCTIONS,
      content: exampleDataUrls.slice(0, 6).map((u) => ({ type: "input_image" as const, image_url: u })),
      schema: STYLE_SUMMARY_SCHEMA,
      schemaName: "style_summary",
      maxOutputTokens: 900,
    }),
  );
  return { summary: out.summary.trim(), phrases: cleanList(out.phrases ?? []).slice(0, 8) };
}

/** Is this tweak a lasting brand preference? If so, the general rule to remember. */
export async function ruleFromTweak(ai: AITransport, instruction: string): Promise<string | null> {
  const out = unwrap(
    await ai.respond<{ lasting: boolean; rule: string }>({
      model: TEXT_MODEL,
      instructions: TWEAK_RULE_INSTRUCTIONS,
      content: [text(JSON.stringify({ change_request: instruction }))],
      schema: TWEAK_RULE_SCHEMA,
      schemaName: "tweak_rule",
      maxOutputTokens: 200,
    }),
  );
  const rule = out.rule.trim();
  return out.lasting && rule ? rule : null;
}

// ---------- Experiment: AI-designed and remixed flyers ----------

export async function makeDesignedFlyer(
  ai: AITransport,
  input: Parameters<typeof designedFlyerPrompt>[0] & { quality: PosterQuality; shape: FlyerShape; examples: string[]; saveAs: string },
): Promise<{ url: string; prompt: string; model: string }> {
  const refs = input.examples.slice(0, 4);
  const prompt = designedFlyerPrompt({ ...input, refCount: refs.length });
  const model = POSTER_MODELS[input.quality];
  const url = unwrap(await ai.image({ model, prompt, images: refs, size: SHAPE_SIZE[input.shape], quality: "high", saveAs: input.saveAs }));
  return { url, prompt, model };
}

export async function makeRemixFlyer(
  ai: AITransport,
  input: Parameters<typeof remixFlyerPrompt>[0] & { quality: PosterQuality; shape: FlyerShape; base: string; saveAs: string },
): Promise<{ url: string; prompt: string; model: string }> {
  const prompt = remixFlyerPrompt(input);
  const model = POSTER_MODELS[input.quality];
  const url = unwrap(await ai.image({ model, prompt, images: [input.base], size: SHAPE_SIZE[input.shape], quality: "high", saveAs: input.saveAs }));
  return { url, prompt, model };
}

/** Closest image shape the API offers for a picture of this width/height. */
export function shapeFor(w: number, h: number): FlyerShape {
  const r = w / h;
  return r > 1.2 ? "wide" : r < 0.83 ? "tall" : "square";
}

/** The same AI-designed flyer, re-laid out for another shape (one image). */
export async function relayoutFlyer(
  ai: AITransport,
  input: { sourceDataUrl: string; to: FlyerShape; hasPartners: boolean; quality: PosterQuality; saveAs: string },
): Promise<{ url: string; prompt: string; model: string }> {
  const prompt = relayoutPrompt(input.to, input.hasPartners);
  const model = POSTER_MODELS[input.quality];
  const url = unwrap(await ai.image({ model, prompt, images: [input.sourceDataUrl], size: SHAPE_SIZE[input.to], quality: "high", saveAs: input.saveAs }));
  return { url, prompt, model };
}
