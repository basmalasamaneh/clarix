import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, FileText, Rows3 } from 'lucide-react';
import type { MetricReference } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Raw } from '@/components/imports/shared';
import { cn } from '@/lib/utils';
import '@/lib/runs-i18n';

export const REFS_PAGE = 20;

const KIND_CLS: Record<string, string> = {
  included: 'border-[color-mix(in_srgb,var(--status-green)_40%,transparent)] text-status-green',
  excluded: 'border-dashed border-[color-mix(in_srgb,var(--status-amber)_50%,transparent)] text-status-amber',
  quarantined: 'border-[color-mix(in_srgb,var(--status-red)_40%,transparent)] text-status-red bg-[color-mix(in_srgb,var(--status-red)_6%,var(--card))]',
};

/** Open-state for in-page reference disclosures. `open` also scrolls to and focuses the panel. */
export function useRefPanels() {
  const [openSet, setOpenSet] = useState<Set<string>>(new Set());
  const open = useCallback((id: string) => {
    setOpenSet((s) => new Set(s).add(id));
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        if (!el) return;
        el.scrollIntoView({ block: 'start' });
        el.querySelector('summary')?.focus({ preventScroll: true });
        history.replaceState(history.state, '', `${location.pathname}${location.search}#${id}`);
      }),
    );
  }, []);
  const set = useCallback((id: string, o: boolean) => {
    setOpenSet((s) => {
      const n = new Set(s);
      if (o) n.add(id);
      else n.delete(id);
      return n;
    });
  }, []);
  return { isOpen: (id: string) => openSet.has(id), open, set, ids: openSet };
}
export type RefPanels = ReturnType<typeof useRefPanels>;

export function RefList({ refs, testId }: { refs: MetricReference[]; testId: string }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  if (refs.length === 0) return <p className="px-3 py-2 text-xs text-muted-foreground" data-testid={`${testId}-empty`}>{t('rc.cmp.noRefs')}</p>;
  const pages = Math.max(1, Math.ceil(refs.length / REFS_PAGE));
  const p = Math.min(page, pages);
  const start = (p - 1) * REFS_PAGE;
  const shown = refs.slice(start, start + REFS_PAGE);
  return (
    <div>
      <ol className="divide-y" data-testid={testId}>
        {shown.map((r, j) => {
          const i = start + j;
          return (
            <li key={`${r.file}-${r.line}-${r.column}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-xs" data-testid={`${testId}-${i}`} data-kind={r.kind}>
              <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', KIND_CLS[r.kind])} data-testid={`${testId}-${i}-kind`}>
                {t(`rc.cmp.kind.${r.kind}`)}
              </span>
              <FileText className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <Raw className="w-full whitespace-normal break-words text-xs [overflow-wrap:anywhere]">{r.orderId} · {r.sourceName}</Raw>
              <Raw className={cn('text-xs font-semibold', r.kind !== 'included' && 'line-through decoration-1 opacity-80')}>{r.file}</Raw>
              <span className="num text-muted-foreground">{t('rc.cmp.line', { n: r.line })}</span>
              <span className="text-muted-foreground">· {t('rc.cmp.column')}</span>
              <Raw className="text-xs">{r.column}</Raw>
            </li>
          );
        })}
      </ol>
      {pages > 1 && (
        <nav className="flex items-center justify-between gap-2 border-t px-2 py-1" aria-label={t('rc.cmp.refsPage', { page: p, pages })}>
          <Button variant="ghost" className="min-h-11 min-w-11" disabled={p <= 1} onClick={() => setPage(p - 1)} aria-label={t('imp.history.prev')} data-testid={`${testId}-prev`}>
            <ChevronLeft className="size-4 rtl-flip" aria-hidden="true" />
          </Button>
          <span className="num text-xs text-muted-foreground" data-testid={`${testId}-page`}>
            {t('rc.cmp.refsRange', { from: start + 1, to: start + shown.length, total: refs.length })}
          </span>
          <Button variant="ghost" className="min-h-11 min-w-11" disabled={p >= pages} onClick={() => setPage(p + 1)} aria-label={t('imp.history.next')} data-testid={`${testId}-next`}>
            <ChevronRight className="size-4 rtl-flip" aria-hidden="true" />
          </Button>
        </nav>
      )}
    </div>
  );
}

export function RefPanel({ id, title, refs, panels }: { id: string; title: string; refs: MetricReference[]; panels: RefPanels }) {
  const open = panels.isOpen(id);
  return (
    <details id={id} open={open} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; if (o !== open) panels.set(id, o); }} className="scroll-mt-24 rounded-lg border bg-card" data-testid={`panel-${id}`}>
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm font-medium hover-elevate" data-testid={`toggle-${id}`}>
        <Rows3 className="size-4 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">{title}</span>
        <span className="num text-xs text-muted-foreground">{refs.length}</span>
      </summary>
      {open && <div className="border-t"><RefList refs={refs} testId={`list-${id}`} /></div>}
    </details>
  );
}

/** A value that opens its reference panel in-page. */
export function SourceLink({ target, panels, label, testId, children, className, showHint = true }: { target: string; panels: RefPanels; label: string; testId: string; children: ReactNode; className?: string; showHint?: boolean }) {
  const { t } = useTranslation();
  return (
    <a
      href={`#${target}`}
      onClick={(e) => { e.preventDefault(); panels.open(target); }}
      className={cn('group inline-flex min-h-11 flex-col items-start justify-center rounded-md px-1.5 text-start hover-elevate', className)}
      aria-label={`${label} · ${t('rc.cmp.showSource')}`}
      data-testid={testId}
    >
      {children}
      {showHint && <span className="mt-0.5 text-[11px] text-primary underline-offset-2 group-hover:underline">{t('rc.cmp.showSource')}</span>}
    </a>
  );
}
