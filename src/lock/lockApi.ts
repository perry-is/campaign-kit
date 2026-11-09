import type { AIResult } from "../ai/bridge";

export type LockStatus = { hasPassword: boolean; unlocked: boolean };

export type LockApi = {
  status(): Promise<AIResult<LockStatus>>;
  setup(pw: string): Promise<AIResult<boolean>>;
  unlock(pw: string): Promise<AIResult<boolean>>;
  recheck(pw: string): Promise<AIResult<boolean>>;
  change(oldPw: string, newPw: string): Promise<AIResult<boolean>>;
  lock(): Promise<AIResult<boolean>>;
  reset(confirmWord: string): Promise<AIResult<boolean>>;
  onChange(cb: (s: LockStatus) => void): () => void;
};

/** The desktop app's lock, or null in a plain browser (development preview has no lock). */
export const lockApi = (): LockApi | null =>
  (typeof window !== "undefined" && (window.ckDesktop as unknown as { lock?: LockApi } | undefined)?.lock) || null;

export const MIN_PASSWORD = 8;
