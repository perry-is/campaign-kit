import type { AIStatus } from "../ai/useAI";
import { Pill } from "./kit";

export function AIBadge({ status }: { status: AIStatus }) {
  if (status.state === "ready") return status.practice ? <Pill tone="warn">Practice AI</Pill> : <Pill tone="ok">AI ready</Pill>;
  if (status.state === "no-key") return <Pill>AI not connected</Pill>;
  return null;
}

/** One-line hint shown only when AI can't run. */
export function AINotice({ status }: { status: AIStatus }) {
  if (status.state === "no-key") return <div className="notice">Add your OpenAI key in Settings to have the AI do this for you.</div>;
  if (status.state === "unavailable") return <div className="notice">AI works in the desktop app.</div>;
  return null;
}

export const aiReady = (s: AIStatus): s is Extract<AIStatus, { state: "ready" }> => s.state === "ready";
