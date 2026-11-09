// How the UI reaches the AI. In the desktop app, requests go to the main process (which
// holds the key). In a plain browser during development, a practice AI answers instead.

export type ContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string }
  | { type: "input_file"; filename: string; file_data: string };

export type AIRequest = {
  model: string;
  instructions: string;
  content: ContentPart[];
  schema: object;
  schemaName: string;
  effort?: "low" | "medium" | "high";
  maxOutputTokens?: number;
};

export type AIError = { code: string; message: string; retryable?: boolean };
export type AIResult<T> = { ok: true; data: T } | { ok: false; error: AIError };

export type AITransport = {
  kind: "desktop" | "practice";
  hasKey(): Promise<AIResult<boolean>>;
  setKey(key: string, model: string): Promise<AIResult<boolean>>;
  clearKey(): Promise<AIResult<void>>;
  test(model: string): Promise<AIResult<{ ok: true }>>;
  respond<T>(req: AIRequest): Promise<AIResult<T>>;
  image(req: ImageRequest): Promise<AIResult<string>>;
};

export type ImageRequest = {
  model: string;
  prompt: string;
  /** Reference images as PNG/JPEG/WebP data URLs. */
  images?: string[];
  size?: "1024x1024" | "1024x1536" | "1536x1024";
  quality?: "low" | "medium" | "high";
  /** Desktop: save the result as a file with this name and return its ck-media:// address. */
  saveAs?: string;
};

declare global {
  interface Window {
    ckDesktop?: {
      isDesktop: true;
      platform: string;
      ai: AITransport;
      setAppIcon(pngDataUrl: string): Promise<AIResult<boolean>>;
      readClipboard(): Promise<AIResult<string>>;
      saveDownloads(folder: string, files: { name: string; dataUrl: string }[]): Promise<AIResult<string>>;
      state: { load(): Promise<AIResult<string | null>>; save(json: string): Promise<AIResult<boolean>> };
      logError(msg: string): Promise<AIResult<boolean>>;
      media: {
        save(dataUrl: string, name: string): Promise<AIResult<string>>;
        remove(url: string): Promise<AIResult<boolean>>;
      };
    };
  }
}

let practice: AITransport | null = null;

export async function getAI(): Promise<AITransport | null> {
  if (typeof window !== "undefined" && window.ckDesktop?.ai) return { ...window.ckDesktop.ai, kind: "desktop" };
  if (import.meta.env.DEV) {
    practice ??= (await import("./practice")).practiceAI;
    return practice;
  }
  return null;
}

/** Unwrap a result or throw an Error whose message is safe to show the user. */
export function unwrap<T>(r: AIResult<T>): T {
  if (r.ok) return r.data;
  const e = new Error(r.error.message) as Error & { code?: string };
  e.code = r.error.code;
  throw e;
}
