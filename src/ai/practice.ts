// Practice AI: answers like the real one, without a key or network, so the flow can be
// tried in a browser during development. Output is clearly canned.

import type { AIRequest, AIResult, AITransport } from "./bridge";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sourceText(req: AIRequest): string {
  const first = req.content.find((p) => p.type === "input_text");
  if (!first || first.type !== "input_text") return "";
  try {
    const j = JSON.parse(first.text);
    return String(j.source_material ?? j.current_text ?? j.change_request ?? "");
  } catch {
    return first.text;
  }
}

function fakeExtraction(src: string) {
  const title = /^(.{6,60}?)[,.\n]/.exec(src)?.[1]?.trim() ?? null;
  const times = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(src);
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const md = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})/i.exec(src);
  let start: string | null = null, end: string | null = null;
  if (md) {
    const now = new Date();
    const m = months.indexOf(md[1].toLowerCase());
    let y = now.getFullYear();
    if (new Date(y, m, +md[2]) < new Date(now.getFullYear(), now.getMonth(), now.getDate())) y++;
    const date = `${y}-${String(m + 1).padStart(2, "0")}-${md[2].padStart(2, "0")}`;
    if (times) {
      const h = (hh: string, ap?: string) => (+hh % 12) + ((ap ?? times[6]).toLowerCase() === "pm" ? 12 : 0);
      start = `${date}T${String(h(times[1], times[3])).padStart(2, "0")}:${times[2] ?? "00"}`;
      end = `${date}T${String(h(times[4], times[6])).padStart(2, "0")}:${times[5] ?? "00"}`;
    } else start = `${date}T18:00`;
  }
  const venue = /\bat\s+([A-Z][\w' ]{2,40}?)(?:[.,\n]|$)/.exec(src)?.[1] ?? null;
  return {
    title, date: start?.slice(0, 10) ?? null, start_time: times ? start!.slice(11, 16) : null, end_time: end ? end.slice(11, 16) : null, end_date: null,
    timezone: null, venue, address: null, delivery: null,
    price: /\bfree\b/i.test(src) ? "Free" : null, host: null, topic: "business networking",
    notes: ["Practice AI: connect OpenAI in Settings for real results."],
    needs_check: md && !/\b20\d\d\b/.test(src) ? ["date"] : [],
  };
}

async function respond<T>(req: AIRequest): Promise<AIResult<T>> {
  await wait(700);
  const src = sourceText(req);
  let data: unknown;
  switch (req.schemaName) {
    case "event_facts":
      data = fakeExtraction(src);
      break;
    case "title_and_description":
      data = {
        recommended_title: "Connect, Celebrate & Grow: Holiday Mixer",
        alternative_titles: ["The Holiday Northlight Mixer", "Toast the Year With Local Business Owners", "Year-End Networking Night", "Holiday Handshakes"],
        description: "(Practice AI) The end of the year is when the best introductions happen: people have time to talk and room in next year's plans. Come meet local business owners, swap what worked in 2026, and leave with a few new people to call in January. Bring a friend and a stack of cards.",
      };
      break;
    case "titles":
      data = { titles: ["Holiday Networking Social", "Year-End Business Mixer", "Cheers to Local Business", "The December Connect"] };
      break;
    case "campaign_copy":
      data = {
        listing: "(Practice AI) Event listing text for Eventbrite and Meetup.",
        facebook: "(Practice AI) Friendly Facebook group post.",
        instagram: "(Practice AI) Short Instagram caption. #networking #smallbusiness",
        linkedin: "(Practice AI) Professional LinkedIn post.",
        creative_direction: "Warm evening rooftop lounge, glowing city lights forming a network, calm navy sky at top for the title.",
      };
      break;
    case "style_summary":
      data = {
        summary: "(Practice AI) Bright, light backgrounds with bold orange and navy headlines; real local photography; icon rows and badges; busy, information-rich flyer layout.",
        phrases: ["Meet · Learn · Shine", "Good people. Bright ideas."],
      };
      break;
    case "tweak_rule": {
      const lasting = /always|brighter|lighter|darker|more like|less|style|colors?|real people/i.test(src);
      data = { lasting, rule: lasting ? `Prefer: ${src}` : "" };
      break;
    }
    case "art_check":
      data = { has_text: false, has_logo: false, note: "" };
      break;
    case "fact_check":
      data = { passed: true, problems: [] };
      break;
    case "revision":
      data = { text: `${src}\n\n(Practice AI revised this.)` };
      break;
    default:
      return { ok: false, error: { code: "BAD_REQUEST", message: "Unknown practice request." } };
  }
  return { ok: true, data: data as T };
}

/** Abstract placeholder art in the colors named in the prompt, so posters can be tried without a key. */
function practiceArt(prompt: string, size: string): string {
  const [w, h] = size.split("x").map(Number);
  const colors = prompt.match(/#[0-9a-f]{6}/gi) ?? ["#031140", "#1380ff", "#fa6429", "#ffd87f"];
  const [bg, a, b, hi] = [colors[0], colors[1] ?? "#1380ff", colors[2] ?? "#fa6429", colors[3] ?? "#ffd87f"];
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  let seed = prompt.length * 7 + (prompt.includes("close, intimate") ? 3 : prompt.includes("graphic") ? 11 : 1);
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 14; i++) {
    const g = ctx.createRadialGradient(rand() * w, rand() * h, 0, rand() * w, rand() * h, 120 + rand() * 520);
    g.addColorStop(0, `${[a, b, hi][i % 3]}${i % 3 === 2 ? "66" : "aa"}`);
    g.addColorStop(1, `${bg}00`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.strokeStyle = `${hi}55`;
  for (let i = 0; i < 22; i++) {
    ctx.beginPath();
    ctx.moveTo(rand() * w, rand() * h);
    ctx.lineTo(rand() * w, rand() * h);
    ctx.stroke();
  }
  return c.toDataURL("image/jpeg", 0.85);
}

export const practiceAI: AITransport = {
  kind: "practice",
  hasKey: async () => ({ ok: true, data: false }),
  setKey: async () => ({ ok: false, error: { code: "PRACTICE", message: "Keys can only be saved in the desktop app." } }),
  clearKey: async () => ({ ok: true, data: undefined }),
  test: async () => ({ ok: false, error: { code: "PRACTICE", message: "Open the desktop app to connect OpenAI." } }),
  respond,
  image: async (req) => {
    await wait(900);
    return { ok: true, data: practiceArt(req.prompt, req.size ?? "1024x1024") };
  },
};
