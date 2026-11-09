// OpenAI calls run here, in the main process, so the API key never enters the UI.
// The UI may only ask for a structured Responses call or a key check.
const { getSecret } = require("./secrets.cjs");

const BASE = "https://api.openai.com/v1";
const KEY_NAME = "openai_api_key";

class AIError extends Error {
  constructor(code, message, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

function friendlyStatus(status, body) {
  const msg = body?.error?.message ?? "";
  if (status === 401) return new AIError("KEY_REJECTED", "OpenAI rejected the API key.");
  if (status === 403) return new AIError("FORBIDDEN", "This API key isn't allowed to use that model.");
  if (status === 404) return new AIError("MODEL_UNAVAILABLE", "That model isn't available on this API key.");
  if (status === 429)
    return /quota|billing/i.test(msg)
      ? new AIError("QUOTA", "The OpenAI account is out of credit. Add billing at platform.openai.com.")
      : new AIError("RATE_LIMITED", "OpenAI is busy. Try again in a moment.", true);
  if (status >= 500) return new AIError("PROVIDER_DOWN", "OpenAI had a problem. Try again shortly.", true);
  return new AIError("BAD_REQUEST", "OpenAI couldn't process that request.");
}

async function call(pathname, init, key, timeoutMs) {
  let res;
  try {
    res = await fetch(`${BASE}${pathname}`, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e && e.name === "TimeoutError") throw new AIError("TIMEOUT", "OpenAI took too long to answer.", true);
    throw new AIError("OFFLINE", "Couldn't reach OpenAI. Check the internet connection.", true);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw friendlyStatus(res.status, body);
  return body;
}

function requireKey(override) {
  const key = override || getSecret(KEY_NAME);
  if (!key) throw new AIError("NO_KEY", "Add your OpenAI API key in Settings.");
  return key;
}

/** Check the key works and can see the model. Optionally tests a key before it is saved. */
async function testKey(model, candidateKey) {
  const key = requireKey(candidateKey);
  await call(`/models/${encodeURIComponent(model)}`, { method: "GET" }, key, 15000);
  return { ok: true };
}

/**
 * Structured Responses call. The request shape is fixed here; the UI supplies only the
 * model, instructions, user content and JSON schema.
 */
async function respond(req, keyForTests) {
  const key = requireKey(keyForTests);
  if (!req || typeof req.model !== "string" || typeof req.instructions !== "string" || !req.schema) {
    throw new AIError("BAD_REQUEST", "Invalid AI request.");
  }
  const body = {
    model: req.model,
    instructions: req.instructions,
    input: [{ role: "user", content: req.content }],
    text: {
      format: { type: "json_schema", name: req.schemaName || "result", strict: true, schema: req.schema },
      verbosity: "low",
    },
    reasoning: { effort: req.effort || "low" },
    max_output_tokens: Math.min(req.maxOutputTokens || 4000, 8000),
    store: false,
  };
  const out = await call("/responses", { method: "POST", body: JSON.stringify(body) }, key, 90000);

  const parts = (out.output || []).flatMap((item) => item.content || []);
  if (parts.some((p) => p.type === "refusal")) throw new AIError("REFUSED", "The AI declined this request.");
  const text = parts.filter((p) => p.type === "output_text").map((p) => p.text).join("");
  if (out.status !== "completed" || !text) throw new AIError("INCOMPLETE", "The AI answer was cut off. Try again.", true);
  try {
    return JSON.parse(text);
  } catch {
    throw new AIError("BAD_OUTPUT", "The AI answer wasn't in the expected format. Try again.", true);
  }
}

function dataUrlToBlob(dataUrl) {
  const m = /^data:(image\/(png|jpeg|webp));base64,(.+)$/.exec(dataUrl || "");
  if (!m) throw new AIError("BAD_REQUEST", "Reference images must be PNG, JPEG or WebP.");
  return { blob: new Blob([Buffer.from(m[3], "base64")], { type: m[1] }), ext: m[2] === "jpeg" ? "jpg" : m[2] };
}

/**
 * Image generation from reference images (Images API "edits"), as gen 1 did.
 * Returns a PNG data URL.
 */
async function image(req, keyForTests) {
  const key = requireKey(keyForTests);
  if (!req || typeof req.model !== "string" || typeof req.prompt !== "string") {
    throw new AIError("BAD_REQUEST", "Invalid image request.");
  }
  const refs = (req.images || []).slice(0, 4);
  const size = ["1024x1024", "1024x1536", "1536x1024"].includes(req.size) ? req.size : "1024x1024";
  const quality = ["low", "medium", "high"].includes(req.quality) ? req.quality : "high";

  let out;
  if (refs.length) {
    const form = new FormData();
    form.append("model", req.model);
    form.append("prompt", req.prompt);
    form.append("size", size);
    form.append("quality", quality);
    form.append("output_format", "png");
    form.append("n", "1");
    refs.forEach((r, i) => {
      const { blob, ext } = dataUrlToBlob(r);
      form.append(refs.length > 1 ? "image[]" : "image", blob, `reference-${i + 1}.${ext}`);
    });
    // multipart: let fetch set the boundary, so no JSON content-type here
    out = await callRaw("/images/edits", { method: "POST", body: form }, key, 180000);
  } else {
    out = await call(
      "/images/generations",
      { method: "POST", body: JSON.stringify({ model: req.model, prompt: req.prompt, size, quality, output_format: "png", n: 1 }) },
      key,
      180000,
    );
  }
  const b64 = out && out.data && out.data[0] && out.data[0].b64_json;
  if (!b64) throw new AIError("INCOMPLETE", "The image didn't come back. Try again.", true);
  return `data:image/png;base64,${b64}`;
}

async function callRaw(pathname, init, key, timeoutMs) {
  let res;
  try {
    res = await fetch(`${BASE}${pathname}`, {
      ...init,
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e && e.name === "TimeoutError") throw new AIError("TIMEOUT", "The image took too long. Try again.", true);
    throw new AIError("OFFLINE", "Couldn't reach OpenAI. Check the internet connection.", true);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw friendlyStatus(res.status, body);
  return body;
}

module.exports = { respond, image, testKey, KEY_NAME, AIError };
