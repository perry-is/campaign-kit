// App state. In the desktop app it is saved to a JSON file by the main process (atomic writes,
// rolling backups). In a plain browser (development preview) it uses local storage.
// Components only use the hook, so a later move to a database or cloud sync won't touch screens.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEMO_BRAND, type BrandProfile } from "../theme/brand";
import { blankCampaign, isBlankDraft, now, type Campaign, type FacebookGroup } from "./model";

type State = {
  brands: BrandProfile[];
  activeBrandId: string;
  campaigns: Campaign[];
  facebookGroups: Record<string, FacebookGroup[]>; // brandId -> groups
  dryRun: boolean;
};

const KEY = "ck.state.v1";

const initial: State = {
  brands: [DEMO_BRAND],
  activeBrandId: DEMO_BRAND.id,
  campaigns: [],
  facebookGroups: { [DEMO_BRAND.id]: [] },
  dryRun: true,
};

/** Clean up saved data on load (old built-in brand, empty drafts, interrupted posters). */
export function normalize(parsed: Partial<State>): State {
  // A built-in profile nobody has edited (same timestamp as shipped) picks up app improvements.
  const brands = (parsed.brands ?? initial.brands).map((b) =>
    b.id === DEMO_BRAND.id && b.updatedAt <= DEMO_BRAND.updatedAt ? DEMO_BRAND : b,
  );
  // Drop blank drafts that were never touched, so "New event" doesn't leave clutter behind.
  const campaigns = (parsed.campaigns ?? [])
    .filter((c) => !(c.rev === 1 && isBlankDraft(c)))
    // Posters still "painting" when the app closed will never finish: offer a retry instead.
    .map((c) => ({
      ...c,
      posters: (c.posters ?? []).map((p) =>
        p.status === "generating" ? { ...p, status: "failed" as const, error: "Interrupted when the app closed. Click Retry." } : p,
      ),
    }));
  return { ...initial, ...parsed, brands, campaigns };
}

function parse(raw: string | null | undefined): State {
  if (!raw) return initial;
  try {
    return normalize(JSON.parse(raw) as Partial<State>);
  } catch {
    return initial;
  }
}

function readLocal(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

type Store = State & {
  /** Set when the last save failed; shown to the user so nothing is lost silently. */
  saveError: string | null;
  brand: BrandProfile;
  saveBrand: (b: BrandProfile) => void;
  setActiveBrand: (id: string) => void;
  newCampaign: () => Campaign;
  updateCampaign: (id: string, patch: (c: Campaign) => Campaign) => void;
  deleteCampaign: (id: string) => void;
  setFacebookGroups: (groups: FacebookGroup[]) => void;
  setDryRun: (v: boolean) => void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const desktop = typeof window !== "undefined" ? window.ckDesktop : undefined;
  // Desktop: loaded asynchronously from the data file. Browser: straight from local storage.
  const [state, setState] = useState<State | null>(() => (desktop ? null : parse(readLocal())));
  const [saveError, setSaveError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Update state once it has loaded. */
  const upd = useCallback((f: (s: State) => State) => setState((s) => (s ? f(s) : s)), []);

  useEffect(() => {
    if (!desktop || state) return;
    void desktop.state.load().then((r) => {
      // First run on the data file: bring over anything from the old local storage.
      const raw = r.ok && r.data ? r.data : readLocal();
      setState(parse(raw));
    });
  }, [desktop, state]);

  useEffect(() => {
    if (!state) return;
    const json = JSON.stringify(state);
    if (!desktop) {
      try {
        localStorage.setItem(KEY, json);
        setSaveError(null);
      } catch {
        setSaveError("This browser preview couldn't save your changes.");
      }
      return;
    }
    // Save shortly after changes settle (and never lose more than a moment of work).
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void desktop.state.save(json).then((r) => {
        setSaveError(r.ok ? null : `Your changes couldn't be saved: ${r.error.message}`);
        if (!r.ok) void desktop.logError(`save failed: ${r.error.code} ${r.error.message}`);
      });
    }, 250);
  }, [state, desktop]);

  if (!state) return <div className="lock-screen" />; // brief, while the data file loads
  return (
    <StoreReady state={state} upd={upd} saveError={saveError}>
      {children}
    </StoreReady>
  );
}

function StoreReady({ state, upd, saveError, children }: { state: State; upd: (f: (s: State) => State) => void; saveError: string | null; children: ReactNode }) {
  const brand = state.brands.find((b) => b.id === state.activeBrandId) ?? state.brands[0];

  const saveBrand = useCallback((b: BrandProfile) => {
    upd((s) => {
      const next = { ...b, updatedAt: now() };
      const exists = s.brands.some((x) => x.id === b.id);
      return {
        ...s,
        brands: exists ? s.brands.map((x) => (x.id === b.id ? next : x)) : [...s.brands, next],
        facebookGroups: s.facebookGroups[b.id] ? s.facebookGroups : { ...s.facebookGroups, [b.id]: [] },
      };
    });
  }, [upd]);

  const newCampaign = useCallback(() => {
    const c = blankCampaign(brand.id, {
      venue: brand.defaultVenue.name,
      address: brand.defaultVenue.address,
      timezone: brand.timezone,
      host: brand.name,
    });
    upd((s) => ({ ...s, campaigns: [c, ...s.campaigns] }));
    return c;
  }, [brand, upd]);

  const updateCampaign = useCallback((id: string, patch: (c: Campaign) => Campaign) => {
    upd((s) => ({
      ...s,
      campaigns: s.campaigns.map((c) => (c.id === id ? { ...patch(c), updatedAt: now(), rev: c.rev + 1 } : c)),
    }));
  }, [upd]);

  const deleteCampaign = useCallback((id: string) => {
    // Soft delete so sync can propagate it.
    upd((s) => ({
      ...s,
      campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, deletedAt: now(), updatedAt: now(), rev: c.rev + 1 } : c)),
    }));
  }, [upd]);

  const value = useMemo<Store>(
    () => ({
      ...state,
      saveError,
      brand,
      saveBrand,
      setActiveBrand: (id) => upd((s) => ({ ...s, activeBrandId: id })),
      newCampaign,
      updateCampaign,
      deleteCampaign,
      setFacebookGroups: (groups) =>
        upd((s) => ({ ...s, facebookGroups: { ...s.facebookGroups, [brand.id]: groups } })),
      setDryRun: (v) => upd((s) => ({ ...s, dryRun: v })),
    }),
    [state, saveError, brand, saveBrand, newCampaign, updateCampaign, deleteCampaign, upd],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
