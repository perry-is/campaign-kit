// Tests the main-process OpenAI caller against a fake fetch (no network, no real key).
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { respond, testKey } = require("./openai.cjs");

const KEY = "sk-test-0000000000000000000000";
const req = { model: "gpt-6-luna", instructions: "do it", content: [{ type: "input_text", text: "hi" }], schema: { type: "object" }, schemaName: "x" };

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("respond", () => {
  it("sends a strict structured Responses request with store=false and parses output_text", async () => {
    const f = mockFetch(200, { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '{"a":1}' }] }] });
    expect(await respond(req, KEY)).toEqual({ a: 1 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gpt-6-luna");
    expect(body.store).toBe(false);
    expect(body.text.format).toMatchObject({ type: "json_schema", strict: true, name: "x" });
    expect(body.input[0]).toEqual({ role: "user", content: req.content });
  });

  it("maps refusals, truncation and bad JSON to friendly errors", async () => {
    mockFetch(200, { status: "completed", output: [{ content: [{ type: "refusal", refusal: "no" }] }] });
    await expect(respond(req, KEY)).rejects.toMatchObject({ code: "REFUSED" });
    mockFetch(200, { status: "incomplete", output: [{ content: [{ type: "output_text", text: "{" }] }] });
    await expect(respond(req, KEY)).rejects.toMatchObject({ code: "INCOMPLETE", retryable: true });
    mockFetch(200, { status: "completed", output: [{ content: [{ type: "output_text", text: "not json" }] }] });
    await expect(respond(req, KEY)).rejects.toMatchObject({ code: "BAD_OUTPUT" });
  });

  it("maps HTTP errors to plain-English messages", async () => {
    mockFetch(401, {});
    await expect(respond(req, KEY)).rejects.toMatchObject({ code: "KEY_REJECTED" });
    mockFetch(429, { error: { message: "You exceeded your current quota" } });
    await expect(respond(req, KEY)).rejects.toMatchObject({ code: "QUOTA" });
    mockFetch(429, { error: { message: "slow down" } });
    await expect(respond(req, KEY)).rejects.toMatchObject({ code: "RATE_LIMITED", retryable: true });
    mockFetch(404, {});
    await expect(testKey("gpt-6-luna", KEY)).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
  });

  it("checks the key against the exact model", async () => {
    const f = mockFetch(200, { id: "gpt-6-luna" });
    await testKey("gpt-6-luna", KEY);
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("https://api.openai.com/v1/models/gpt-6-luna");
  });
});

describe("image", () => {
  it("posts reference images as multipart to the edits endpoint and returns a PNG data URL", async () => {
    const f = mockFetch(200, { data: [{ b64_json: "QUJD" }] });
    const out = await (require("./openai.cjs").image)(
      { model: "gpt-image-2.5-sunburst", prompt: "p", images: ["data:image/png;base64,AAAA"], size: "1024x1024", quality: "high" },
      KEY,
    );
    expect(out).toBe("data:image/png;base64,QUJD");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/images/edits");
    const form = init.body as FormData;
    expect(form.get("model")).toBe("gpt-image-2.5-sunburst");
    expect(form.get("size")).toBe("1024x1024");
    expect(form.get("image")).toBeInstanceOf(Blob);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("rejects non-image references", async () => {
    await expect(require("./openai.cjs").image({ model: "m", prompt: "p", images: ["data:text/html;base64,AA"] }, KEY)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
