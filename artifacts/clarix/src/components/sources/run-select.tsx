import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useSearch } from 'wouter';
import { AlertTriangle, Check, Layers, RotateCcw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useSourceComparison, useSourceRuns, type RunIdentity } from '@/lib/sources-api';
import { ErrorNote, Pager, Raw, Section } from '@/components/imports/shared';

function RunList({ selected, onSelect, testPrefix }: { selected: string | null; onSelect: (r: RunIdentity) => void; testPrefix: string }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useSourceRuns(page, search.trim());
  const items = q.data?.items ?? [];
  return (
    <div className="rounded-lg border bg-card">
      <div className="relative border-b p-2">
        <Search className="pointer-events-none absolute start-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t('src.runs.search')} aria-label={t('src.runs.search')} className="h-11 ps-9" data-testid={`input-${testPrefix}-search`} />
      </div>
      {q.isLoading ? (
        <div className="space-y-2 p-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="h-11 animate-pulse rounded bg-muted" />)}</div>
      ) : q.isError ? (
        <div className="p-3"><ErrorNote error={q.error} action={<Button variant="outline" className="min-h-11 gap-2" onClick={() => q.refetch()} data-testid={`button-retry-${testPrefix}`}><RotateCcw className="size-4" aria-hidden="true" />{t('imp.errors.retry')}</Button>} /></div>
      ) : items.length === 0 ? (
        <div className="ledger-grid flex flex-col items-center gap-2 p-8 text-center" data-testid={`state-${testPrefix}-empty`}>
          <Layers className="size-6 text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{search.trim() ? t('src.runs.noMatch') : t('src.runs.empty')}</p>
        </div>
      ) : (
        <ul className={cn('max-h-96 divide-y overflow-y-auto', q.isFetching && 'opacity-70')} role="listbox" data-testid={`list-${testPrefix}`}>
          {items.map((r) => {
            const sel = selected === r.id;
            return (
              <li key={r.id}>
                <button type="button" role="option" aria-selected={sel} onClick={() => onSelect(r)} data-testid={`option-${testPrefix}-${r.id}`} className={cn('flex min-h-11 w-full items-center gap-3 px-3 py-2 text-start', sel ? 'bg-accent' : 'hover:bg-muted/60')}>
                  <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border', sel && 'border-primary bg-primary text-primary-foreground')}>{sel && <Check className="size-3" aria-hidden="true" />}</span>
                  <span className="min-w-0 flex-1">
                    <Raw className="font-semibold">{r.orderId}</Raw>
                    <span className="mx-1.5 text-muted-foreground">·</span>
                    <Raw className="font-sans text-sm text-muted-foreground">{r.sourceName}</Raw>
                  </span>
                  {r.ambiguous && (
                    <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs text-status-amber" data-testid={`badge-ambiguous-${r.id}`}>
                      <AlertTriangle className="size-3" aria-hidden="true" />
                      <span className="hidden sm:inline">{t('src.runs.ambiguous')}</span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="px-2 pb-2"><Pager page={page} total={q.data?.total ?? 0} onPage={setPage} testId={`pager-${testPrefix}`} /></div>
    </div>
  );
}

function Identity({ run, testId, label }: { run: RunIdentity; testId: string; label: string }) {
  const { t } = useTranslation();
  return (
    <div className="fade-up rounded-lg border bg-background p-4" data-testid={testId}>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div><dt className="text-xs text-muted-foreground">{t('src.runs.order')}</dt><dd><Raw className="font-semibold" >{run.orderId}</Raw></dd></div>
        <div><dt className="text-xs text-muted-foreground">{t('src.runs.source')}</dt><dd><Raw className="font-sans font-medium">{run.sourceName}</Raw></dd></div>
        <div className="min-w-0"><dt className="text-xs text-muted-foreground">{t('src.runs.id')}</dt><dd className="num break-all font-mono text-xs">{run.id}</dd></div>
      </dl>
    </div>
  );
}

export function RunsSelect() {
  const { t } = useTranslation();
  const [sel, setSel] = useState<RunIdentity | null>(null);
  return (
    <Section title={t('src.runs.title')} body={t('src.runs.body')} testId="section-runs-select">
      <div className="space-y-4">
        <RunList selected={sel?.id ?? null} onSelect={setSel} testPrefix="runs" />
        {sel ? (
          <div className="space-y-2">
            <Identity run={sel} label={t('src.runs.selected')} testId="card-selected-run" />
            <Button variant="ghost" className="min-h-11 gap-2" onClick={() => setSel(null)} data-testid="button-clear-run"><X className="size-4" aria-hidden="true" />{t('src.runs.clear')}</Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="text-run-hint">{t('src.runs.pickHint')}</p>
        )}
      </div>
    </Section>
  );
}

export function ComparisonSelect() {
  const { t } = useTranslation();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const p = new URLSearchParams(search);
  const left = p.get('left');
  const right = p.get('right');
  const set = (side: 'left' | 'right', v: string | null) => {
    const n = new URLSearchParams(search);
    if (v) n.set(side, v);
    else n.delete(side);
    const s = n.toString();
    setLocation(`/comparison${s ? `?${s}` : ''}`);
  };
  const same = !!left && left === right;
  const q = useSourceComparison(same ? null : left, same ? null : right);

  const side = (k: 'left' | 'right') => {
    const id = k === 'left' ? left : right;
    const ident = q.data?.[k];
    return (
      <div className="min-w-0 space-y-2" data-testid={`panel-compare-${k}`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{t(`src.cmp.${k}`)}</p>
          {id && <Button variant="ghost" className="min-h-11" onClick={() => set(k, null)} data-testid={`button-change-${k}`}>{t('src.cmp.change')}</Button>}
        </div>
        {id && ident ? <Identity run={ident} label={t(`src.cmp.${k}`)} testId={`card-compare-${k}`} /> : id && q.isLoading ? <div className="h-24 animate-pulse rounded-lg bg-muted" aria-busy="true" /> : !id ? <RunList selected={id} onSelect={(r) => set(k, r.id)} testPrefix={`compare-${k}`} /> : null}
      </div>
    );
  };

  return (
    <Section title={t('src.cmp.title')} body={t('src.cmp.body')} testId="section-compare-select">
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          {side('left')}
          {side('right')}
        </div>
        {same && <p className="text-sm text-status-amber" role="alert" data-testid="text-compare-same">{t('src.cmp.same')}</p>}
        {q.isError && (
          <ErrorNote error={q.error} action={<Button variant="outline" className="min-h-11 gap-2" onClick={() => q.refetch()} data-testid="button-retry-compare"><RotateCcw className="size-4" aria-hidden="true" />{t('imp.errors.retry')}</Button>} />
        )}
        {q.data && (
          <p className="rounded-md bg-accent px-3 py-2 text-sm" data-testid="text-compare-pair">
            <span className="font-medium">{t('src.cmp.pair')}: </span>
            <Raw>{q.data.left.orderId}</Raw> · <Raw className="font-sans">{q.data.left.sourceName}</Raw>
            <span className="mx-2 text-muted-foreground">/</span>
            <Raw>{q.data.right.orderId}</Raw> · <Raw className="font-sans">{q.data.right.sourceName}</Raw>
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t('src.cmp.note')}</p>
      </div>
    </Section>
  );
}
