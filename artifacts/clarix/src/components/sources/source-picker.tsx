import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, Check, Database, Lightbulb, Loader2, Plus, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/import-model';
import { useDataSources } from '@/lib/sources-api';
import { ErrorNote, Pager, Raw } from '@/components/imports/shared';

export type SourceChoice = { mode: 'existing' | 'new'; existing: string | null; newName: string };

export function chosenName(c: SourceChoice): string {
  return (c.mode === 'existing' ? c.existing ?? '' : c.newName).trim();
}

export function SourcePicker({
  value,
  onChange,
  disabled,
  invalid,
  recommendation,
  recommending,
  recommendChecked,
}: {
  value: SourceChoice;
  onChange: (c: SourceChoice) => void;
  disabled?: boolean;
  invalid?: boolean;
  recommendation: string | null;
  recommending: boolean;
  recommendChecked: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDataSources(page, search.trim());
  const items = q.data?.items ?? [];
  const taken = value.mode === 'new' && !!value.newName.trim() && items.some((s) => s.name.toLowerCase() === value.newName.trim().toLowerCase());
  const showRec = recommendation && !(value.mode === 'existing' && value.existing === recommendation);

  return (
    <div className="space-y-3" data-testid="source-picker">
      <div>
        <p className="text-sm font-medium">{t('src.pick.title')}</p>
        <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground" data-testid="text-source-help">{t('src.pick.help')}</p>
      </div>

      <div className="inline-flex rounded-lg border bg-muted p-1" role="radiogroup" aria-label={t('src.pick.title')}>
        {(['existing', 'new'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={value.mode === m}
            disabled={disabled}
            onClick={() => onChange({ ...value, mode: m })}
            data-testid={`toggle-source-${m}`}
            className={cn('inline-flex min-h-11 items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors', value.mode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            {m === 'existing' ? <Database className="size-4" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
            {t(m === 'existing' ? 'src.pick.existing' : 'src.pick.create')}
          </button>
        ))}
      </div>

      {recommending && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite" data-testid="status-recommending">
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {t('src.pick.recommending')}
        </p>
      )}
      {!recommending && recommendChecked && !recommendation && (
        <p className="text-xs text-muted-foreground" data-testid="text-recommend-none">{t('src.pick.recommendNone')}</p>
      )}
      {showRec && (
        <div className="fade-up flex flex-col gap-3 rounded-lg border border-[color-mix(in_srgb,var(--series-good)_35%,transparent)] bg-[color-mix(in_srgb,var(--series-good)_6%,var(--card))] p-3 sm:flex-row sm:items-center" role="status" data-testid="banner-source-recommendation">
          <Lightbulb className="size-5 shrink-0 text-[var(--series-good)]" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">{t('src.pick.recommendTitle')}</p>
            <p className="text-muted-foreground">{t('src.pick.recommendBody', { name: recommendation })}</p>
          </div>
          <Button variant="outline" className="min-h-11 shrink-0 bg-card" disabled={disabled} onClick={() => onChange({ ...value, mode: 'existing', existing: recommendation })} data-testid="button-use-recommendation">
            {t('src.pick.use', { name: recommendation })}
          </Button>
        </div>
      )}

      {value.mode === 'existing' ? (
        <div className={cn('rounded-lg border bg-card', invalid && !value.existing && 'border-status-red')}>
          <div className="relative border-b p-2">
            <Search className="pointer-events-none absolute start-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t('src.pick.search')}
              aria-label={t('src.pick.search')}
              disabled={disabled}
              className="h-11 ps-9"
              data-testid="input-source-search"
            />
          </div>
          {q.isLoading ? (
            <div className="space-y-2 p-2" aria-busy="true">
              {[0, 1, 2].map((i) => <div key={i} className="h-11 animate-pulse rounded bg-muted" />)}
            </div>
          ) : q.isError ? (
            <div className="p-3">
              <ErrorNote error={q.error} action={<Button variant="outline" className="min-h-11 gap-2" onClick={() => q.refetch()} data-testid="button-retry-sources"><RotateCcw className="size-4" aria-hidden="true" />{t('imp.errors.retry')}</Button>} />
            </div>
          ) : items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground" data-testid="text-sources-empty">{search.trim() ? t('src.pick.noMatch') : t('src.pick.empty')}</p>
          ) : (
            <ul className={cn('max-h-72 divide-y overflow-y-auto', q.isFetching && 'opacity-70')} role="listbox" aria-label={t('src.pick.existing')} data-testid="list-sources">
              {items.map((s) => {
                const sel = value.existing === s.name;
                return (
                  <li key={s.name}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={sel}
                      disabled={disabled || s.archived}
                      onClick={() => onChange({ ...value, existing: s.name })}
                      data-testid={`option-source-${s.name}`}
                      className={cn('flex min-h-11 w-full items-center gap-3 px-3 py-2 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-60', sel ? 'bg-accent' : 'hover:bg-muted/60')}
                    >
                      <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border', sel && 'border-primary bg-primary text-primary-foreground')}>
                        {sel && <Check className="size-3" aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <Raw className="block truncate font-sans text-sm font-medium">{s.name}</Raw>
                        <span className="text-xs text-muted-foreground">
                          {t('src.pick.orders', { count: s.orderCount })} · {s.lastApprovedAt ? t('src.pick.lastApproved', { at: formatDate(s.lastApprovedAt, i18n.language) }) : t('src.pick.never')}
                        </span>
                      </span>
                      {s.archived && (
                        <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
                          <Archive className="size-3" aria-hidden="true" />
                          {t('src.pick.archived')}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="px-2 pb-2">
            <Pager page={page} total={q.data?.total ?? 0} onPage={setPage} testId="pager-sources" />
          </div>
        </div>
      ) : (
        <div className="max-w-md space-y-1.5">
          <Label htmlFor="source-name">{t('src.pick.newName')}</Label>
          <Input
            id="source-name"
            value={value.newName}
            onChange={(e) => onChange({ ...value, newName: e.target.value })}
            maxLength={120}
            disabled={disabled}
            className="h-11"
            aria-invalid={invalid && !value.newName.trim() ? true : undefined}
            data-testid="input-source-name"
          />
          {taken && <p className="text-xs text-status-amber" data-testid="text-source-name-taken">{t('src.pick.nameTaken')}</p>}
        </div>
      )}

      {invalid && !chosenName(value) ? (
        <p className="text-xs text-status-red" role="alert" data-testid="text-source-required">{t('src.pick.required')}</p>
      ) : chosenName(value) ? (
        <p className="text-xs text-muted-foreground" data-testid="text-source-chosen">{t('src.pick.chosen', { name: chosenName(value) })}</p>
      ) : null}
    </div>
  );
}
