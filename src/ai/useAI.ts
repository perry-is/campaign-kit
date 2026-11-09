import { useCallback, useEffect, useState } from "react";
import { type AITransport, getAI } from "./bridge";

export type AIStatus =
  | { state: "loading" }
  | { state: "ready"; ai: AITransport; practice: boolean }
  | { state: "no-key"; ai: AITransport }
  | { state: "unavailable" };

const listeners = new Set<() => void>();
/** Call after the key is saved or removed so every screen refreshes its status. */
export const notifyKeyChanged = () => listeners.forEach((l) => l());

export function useAI(): AIStatus {
  const [status, setStatus] = useState<AIStatus>({ state: "loading" });

  const refresh = useCallback(async () => {
    const ai = await getAI();
    if (!ai) return setStatus({ state: "unavailable" });
    if (ai.kind === "practice") return setStatus({ state: "ready", ai, practice: true });
    const r = await ai.hasKey();
    setStatus(r.ok && r.data ? { state: "ready", ai, practice: false } : { state: "no-key", ai });
  }, []);

  useEffect(() => {
    void refresh();
    listeners.add(refresh);
    return () => void listeners.delete(refresh);
  }, [refresh]);

  return status;
}

/** Runs one AI job at a time with busy/error state for a button. */
export function useAIJob() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (label: string, job: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await job();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, error, run, setLabel: setBusy, clearError: () => setError(null) };
}
