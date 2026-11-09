import { useId, type ReactNode } from "react";

export function Field(props: { label: string; full?: boolean; children: ReactNode }) {
  return (
    <label className={`field${props.full ? " full" : ""}`}>
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span className="track" />
      <span>{props.label}</span>
    </label>
  );
}

export function Pill(props: { tone?: "ok" | "warn" | "bad"; children: ReactNode }) {
  return (
    <span className={`pill ${props.tone ?? ""}`}>
      <span className="dot" />
      {props.children}
    </span>
  );
}

/** The glowing network motif from the logo, used for empty states and loading. */
export function NetworkArt(props: { seed?: number; className?: string }) {
  const gid = useId().replace(/:/g, "");
  let s = props.seed ?? 7;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const nodes = Array.from({ length: 16 }, () => ({ x: 10 + rand() * 280, y: 10 + rand() * 130 }));
  const links: [number, number][] = [];
  nodes.forEach((a, i) => {
    nodes
      .map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.y - b.y) }))
      .filter((x) => x.j > i)
      .sort((x, y) => x.d - y.d)
      .slice(0, 2)
      .forEach((x) => links.push([i, x.j]));
  });
  return (
    <div className={`nodes ${props.className ?? ""}`}>
      <svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid meet" aria-hidden>
        <defs>
          <linearGradient id={`l${gid}`} x1="0" x2="1">
            <stop offset="0" stopColor="var(--accent-from)" />
            <stop offset="1" stopColor="var(--accent-to)" />
          </linearGradient>
        </defs>
        {links.map(([a, b], i) => (
          <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} stroke={`url(#l${gid})`} strokeWidth={1} opacity={0.55} />
        ))}
        {nodes.map((n, i) => (
          <circle key={i} className="node" cx={n.x} cy={n.y} r={2.2} style={{ animationDelay: `${(i % 8) * 0.3}s` }} />
        ))}
      </svg>
    </div>
  );
}

export function Empty(props: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <NetworkArt className="art" />
      <h2>{props.title}</h2>
      {props.children && <p className="muted">{props.children}</p>}
      {props.action}
    </div>
  );
}
