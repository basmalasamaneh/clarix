import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocation, useSearch } from 'wouter';
import type { Session } from '@workspace/api-client-react';
import { SourceDrawer } from '@/components/source/source-drawer';

export type SourceTarget = { kind: 'metric' | 'issue'; id: string; metric?: string; other?: string; snapshot?: string };

export const SOURCE_PARAMS = { kind: 'sourceKind', id: 'sourceId', metric: 'sourceMetric', other: 'sourceOther', snapshot: 'sourceSnapshot' } as const;

type Ctx = { openSource: (t: SourceTarget, trigger?: HTMLElement | null) => void; closeSource: () => void };
const SourceCtx = createContext<Ctx | null>(null);

export function useSource(): Ctx {
  const c = useContext(SourceCtx);
  if (!c) throw new Error('useSource must be used inside SourceDrawerProvider');
  return c;
}

/** Snapshot scope is inferred from the /snapshots/:id route so every drawer link resolves frozen rows. */
const SNAP_ROUTE = /^\/snapshots\/([^/?#]+)/;
export function snapshotFromPath(location: string): string | undefined {
  const m = SNAP_ROUTE.exec(location);
  return m ? decodeURIComponent(m[1]) : undefined;
}

function parse(search: string, location = ''): SourceTarget | null {
  const sp = new URLSearchParams(search);
  const kind = sp.get(SOURCE_PARAMS.kind);
  if (!kind) return null;
  return {
    kind: kind as SourceTarget['kind'],
    id: sp.get(SOURCE_PARAMS.id) ?? '',
    metric: sp.get(SOURCE_PARAMS.metric) || undefined,
    other: sp.get(SOURCE_PARAMS.other) || undefined,
    snapshot: snapshotFromPath(location) || sp.get(SOURCE_PARAMS.snapshot) || undefined,
  };
}

/** Shared source drawer. State lives in the URL (sourceKind/sourceId/sourceMetric/sourceOther); other params are preserved. */
export function SourceDrawerProvider({ session, children }: { session: Session; children: ReactNode }) {
  const search = useSearch();
  const [location, navigate] = useLocation();
  const target = useMemo(() => parse(search, location), [search, location]);
  const triggerRef = useRef<HTMLElement | null>(null);
  const stateRef = useRef({ search, location });
  stateRef.current = { search, location };

  const write = useCallback((fn: (p: URLSearchParams) => void) => {
    const { search: s, location: l } = stateRef.current;
    const p = new URLSearchParams(s);
    fn(p);
    const qs = p.toString();
    navigate(qs ? `${l}?${qs}` : l, { replace: true });
  }, [navigate]);

  const openSource = useCallback((t: SourceTarget, trigger?: HTMLElement | null) => {
    triggerRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    write((p) => {
      p.set(SOURCE_PARAMS.kind, t.kind);
      p.set(SOURCE_PARAMS.id, t.id);
      if (t.metric) p.set(SOURCE_PARAMS.metric, t.metric); else p.delete(SOURCE_PARAMS.metric);
      if (t.other) p.set(SOURCE_PARAMS.other, t.other); else p.delete(SOURCE_PARAMS.other);
      const snap = snapshotFromPath(stateRef.current.location) ?? t.snapshot;
      if (snap) p.set(SOURCE_PARAMS.snapshot, snap); else p.delete(SOURCE_PARAMS.snapshot);
    });
  }, [write]);

  const closeSource = useCallback(() => {
    write((p) => Object.values(SOURCE_PARAMS).forEach((k) => p.delete(k)));
  }, [write]);

  // Factory switch: never keep another factory's drawer open.
  const factoryRef = useRef(session.activeFactoryId);
  useEffect(() => {
    if (factoryRef.current !== session.activeFactoryId) {
      factoryRef.current = session.activeFactoryId;
      if (parse(stateRef.current.search)) closeSource();
    }
  }, [session.activeFactoryId, closeSource]);

  const restoreFocus = useCallback(() => {
    const el = triggerRef.current;
    triggerRef.current = null;
    if (el && el.isConnected) el.focus();
    else document.getElementById('main')?.focus();
  }, []);

  const value = useMemo(() => ({ openSource, closeSource }), [openSource, closeSource]);
  return (
    <SourceCtx.Provider value={value}>
      {children}
      <SourceDrawer target={target} session={session} onClose={closeSource} onRestoreFocus={restoreFocus} />
    </SourceCtx.Provider>
  );
}
