import { describe, expect, it } from "vitest";
import type { AIRequest, AITransport, ImageRequest } from "./bridge";
import { ART_CHECK_INSTRUCTIONS, designedFlyerPrompt, posterArtPrompt, remixFlyerPrompt } from "./prompts";
import { MAX_STYLE_REFS, factCheckPoster, makePosterArt, makeRemixFlyer, ruleFromTweak, shapeFor } from "./tasks";

const base = {
  brandName: "Northlight Events",
  palette: { background: "#031140", accentFrom: "#1380ff", accentTo: "#fa6429", highlight: "#ffd87f" },
  direction: "",
  topic: "Holiday Mixer",
  layout: "top" as const,
  variant: 0,
};

describe("poster prompts with brand style", () => {
  it("adds style examples, summary and rules only when there are some", () => {
    const plain = posterArtPrompt(base);
    expect(plain).not.toMatch(/STYLE EXAMPLES|Brand style rules|style, in words/);
    const styled = posterArtPrompt({ ...base, styleRefCount: 2, styleSummary: "Bright, light backgrounds.", styleRules: ["Show real people", "Use bold orange headlines"] });
    expect(styled).toContain("The other 2 attached image(s) are STYLE EXAMPLES");
    expect(styled).toContain("The brand's style, in words: Bright, light backgrounds.");
    expect(styled).toContain("- Show real people\n- Use bold orange headlines");
    expect(styled).toContain("no text, letters, numbers");
  });

  it("sends the logo first, then at most 3 style examples", async () => {
    let sent: ImageRequest | null = null;
    const ai = {
      image: async (req: ImageRequest) => { sent = req; return { ok: true as const, data: "ck-media://x.png" }; },
    } as unknown as AITransport;
    await makePosterArt(ai, { ...base, quality: "best", logoDataUrl: "LOGO", styleRefs: ["A", "B", "C", "D", "E"], saveAs: "poster-abc12345" });
    expect(sent!.images).toEqual(["LOGO", "A", "B", "C"]);
    expect(MAX_STYLE_REFS).toBe(3);
    expect(sent!.prompt).toContain("The other 3 attached image(s)");
  });

  it("the stray-text check ignores scribbles and only flags readable text", () => {
    expect(ART_CHECK_INSTRUCTIONS).toMatch(/READABLE/);
    expect(ART_CHECK_INSTRUCTIONS).toMatch(/scribbles.*do NOT count/s);
  });

  it("turns a lasting tweak into a rule and ignores one-offs", async () => {
    const make = (answer: unknown) =>
      ({ respond: async (_r: AIRequest) => ({ ok: true as const, data: answer }) }) as unknown as AITransport;
    expect(await ruleFromTweak(make({ lasting: true, rule: " Use bright, light backgrounds " }), "brighter please")).toBe("Use bright, light backgrounds");
    expect(await ruleFromTweak(make({ lasting: false, rule: "" }), "make her jacket red")).toBeNull();
  });
});


describe("experiment: AI-designed and remixed flyers", () => {
  const text = { lines: ["Gift Wrapping Class", "Thursday, December 10 · 2–4 PM MST"], phrases: ["Meet · Learn · Shine"], hasPartners: true };

  it("designed: uses her examples, exact lines, her taglines, and leaves room for logos", () => {
    expect(designedFlyerPrompt({ ...text, description: "Spooky stories.", brandName: "B", palette: base.palette, topic: "t", direction: "", summary: "", rules: [], refCount: 0, variant: 0 })).toContain('approved event description as a subtitle, exactly or shortened (do not add to it): "Spooky stories."');
    const p = designedFlyerPrompt({ ...text, brandName: "Northlight Events", palette: base.palette, topic: "gift wrapping", direction: "", summary: "Bold flyers.", rules: ["Show real people"], refCount: 3, variant: 2 });
    expect(p).toContain("The 3 attached image(s) are Northlight Events's own past flyers");
    expect(p).toContain('"Gift Wrapping Class"');
    expect(p).toContain('"Meet · Learn · Shine"');
    expect(p).toMatch(/Do not draw any logos/);
    expect(p).toMatch(/TOP-LEFT corner/);
    expect(p).toMatch(/bottom 9%/); // partner strip
    expect(p).toContain("- Show real people");
    expect(p).toContain("icon row");
  });

  it("remix: replaces every old word and logo", () => {
    const p = remixFlyerPrompt({ ...text, hasPartners: false, topic: "gift wrapping", direction: "", rules: [] });
    expect(p).toMatch(/Replace ALL of its text/);
    expect(p).toMatch(/Remove every logo/);
    expect(p).not.toMatch(/bottom 9%/);
  });

  it("remix keeps the past flyer's shape and sends only that flyer", async () => {
    let sent: ImageRequest | null = null;
    const ai = { image: async (r: ImageRequest) => { sent = r; return { ok: true as const, data: "ck-media://x.png" }; } } as unknown as AITransport;
    await makeRemixFlyer(ai, { ...text, topic: "t", direction: "", rules: [], quality: "fast", shape: "wide", base: "OLDFLYER", saveAs: "poster-abc12345" });
    expect(sent!.images).toEqual(["OLDFLYER"]);
    expect(sent!.size).toBe("1536x1024");
    expect(shapeFor(526, 275)).toBe("wide");
    expect(shapeFor(526, 789)).toBe("tall");
    expect(shapeFor(600, 600)).toBe("square");
  });

  it("the fact-check allows her taglines but still blocks invented facts", async () => {
    let req: AIRequest | null = null;
    const ai = { respond: async (r: AIRequest) => { req = r; return { ok: true as const, data: { passed: true, problems: [] } }; } } as unknown as AITransport;
    await factCheckPoster(ai, "IMG", ["A"], ["Meet · Learn · Shine"], "A story night for owners.");
    const sent = JSON.parse((req!.content[0] as { text: string }).text);
    expect(sent.allowed_brand_phrases).toEqual(["Meet · Learn · Shine"]);
    expect(sent.event_description).toBe("A story night for owners.");
  });
});
