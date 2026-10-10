import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EVENT_TYPES, PAGE_SIZE, formatDate, type CodeChoiceM } from '@/lib/import-model';
import { rowCells, type EventCodeItem } from '@/lib/import-api';
import { ErrorNote, NativeSelect, Pager, Raw } from './shared';

type Props = {
  items: EventCodeItem[] | undefined;
  total: number;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  hasColumn: boolean;
  choices: Record<string, CodeChoiceM>;
  suggested: Set<string>;
  readOnly: boolean;
  showBlocked: boolean;
  onChoose: (code: string, choice: CodeChoiceM | '') => void;
};

export function EventCodes({ items, total, loading, error, onRetry, hasColumn, choices, suggested, readOnly, showBlocked, onChoose }: Props) {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const list = items ?? [];
  const missing = list.filter((it) => !choices[it.code]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));

  useEffect(() => {
    if (page > pages) setPage(1);
  }, [page, pages]);

  if (!hasColumn)
    return (
      <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground" data-testid="text-codes-need-column">
        {t('imp.map.codes.needColumn')}
      </p>
    );
  if (loading)
    return (
      <div className="space-y-2" aria-busy="true" data-testid="state-codes-loading">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {t('imp.map.codes.loading')}
        </p>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  if (error != null)
    return (
      <ErrorNote
        error={error}
        testId="status-codes-error"
        action={
          <Button variant="outline" className="min-h-11 gap-2" onClick={onRetry} data-testid="button-retry-codes">
            <RotateCcw className="size-4" aria-hidden="true" />
            {t('imp.errors.retry')}
          </Button>
        }
      />
    );
  if (list.length === 0)
    return (
      <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground" data-testid="text-codes-empty">
        {t('imp.map.codes.empty')}
      </p>
    );

  const slice = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const jumpMissing = () => {
    const first = missing[0];
    if (!first) return;
    const idx = list.findIndex((x) => x.code === first.code);
    setPage(Math.floor(idx / PAGE_SIZE) + 1);
    requestAnimationFrame(() => document.getElementById(`code-choice-${idx}`)?.focus());
  };

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'flex flex-col gap-2 rounded-md px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between',
          missing.length > 0
            ? 'bg-[color-mix(in_srgb,var(--status-amber)_9%,var(--card))]'
            : 'bg-[color-mix(in_srgb,var(--status-green)_8%,var(--card))]',
        )}
        role={showBlocked && missing.length > 0 ? 'alert' : 'status'}
        data-testid="status-codes-progress"
      >
        <p className="flex items-start gap-2">
          {missing.length > 0 ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-amber" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-green" aria-hidden="true" />
          )}
          <span>
            <span className="font-medium">{t('imp.map.codes.total', { count: total || list.length })}</span>
            {' · '}
            {missing.length > 0 ? t('imp.map.codes.missing', { count: missing.length }) : t('imp.map.codes.allChosen')}
            {showBlocked && missing.length > 0 && <span className="block text-status-red">{t('imp.map.codes.blocked')}</span>}
          </span>
        </p>
        {missing.length > 0 && !readOnly && (
          <Button variant="outline" className="min-h-11 shrink-0 bg-card" onClick={jumpMissing} data-testid="button-next-missing-code">
            {t('imp.map.codes.showMissing')}
          </Button>
        )}
      </div>

      <ul className="divide-y rounded-lg border" data-testid="list-event-codes">
        {slice.map((it, j) => {
          const idx = (page - 1) * PAGE_SIZE + j;
          const choice = choices[it.code] ?? '';
          const isSuggested = suggested.has(it.code) && choice === it.suggestion;
          const unset = !choice;
          return (
            <li
              key={it.code}
              className={cn('grid gap-3 p-3 md:grid-cols-[minmax(7rem,0.8fr)_minmax(0,2fr)_minmax(13rem,1.2fr)] md:items-start', unset && showBlocked && 'bg-[color-mix(in_srgb,var(--status-red)_5%,transparent)]')}
              data-testid={`row-code-${idx}`}
            >
              <div className="min-w-0">
                <Raw className="break-all text-sm font-semibold">{it.code}</Raw>
                <p className="num mt-0.5 text-xs text-muted-foreground" data-testid={`text-code-count-${idx}`}>
                  {t('imp.map.codes.colRows')}: {it.count}
                </p>
              </div>
              <div className="min-w-0 text-xs">
                <p className="mb-1 text-muted-foreground">
                  {t('imp.map.codes.colSample')} · <Raw className="text-xs">{it.sample.file}</Raw> · <span className="num">{t('imp.map.codes.line', { line: it.sample.line })}</span>
                </p>
                <dl className="flex flex-wrap gap-1">
                  {rowCells(it.sample).map(([k, v]) => (
                    <div key={k} className="flex min-w-0 max-w-full items-baseline gap-1 rounded border bg-muted px-1.5 py-0.5">
                      <dt className="text-muted-foreground">
                        <Raw className="text-[11px]">{k}</Raw>
                      </dt>
                      <dd className="min-w-0 break-all">
                        <Raw className="text-xs">{v || '—'}</Raw>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="min-w-0 space-y-1">
                <label htmlFor={`code-choice-${idx}`} className="sr-only">
                  {t('imp.map.codes.colChoice')} {it.code}
                </label>
                <NativeSelect
                  id={`code-choice-${idx}`}
                  value={choice}
                  disabled={readOnly}
                  invalid={unset && showBlocked}
                  onChange={(e) => onChoose(it.code, e.target.value as CodeChoiceM | '')}
                  data-testid={`select-code-choice-${idx}`}
                >
                  <option value="">{t('imp.map.codes.choose')}</option>
                  {EVENT_TYPES.map((et) => (
                    <option key={et} value={et}>
                      {t(`imp.map.types.${et}`)}
                    </option>
                  ))}
                  <option value="IGNORE">{t('imp.map.codes.ignore')}</option>
                </NativeSelect>
                {isSuggested ? (
                  <p className="flex items-start gap-1 text-xs text-primary">
                    <Sparkles className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                    {t('imp.map.codes.suggested')}
                  </p>
                ) : unset && !it.suggestion ? (
                  <p className="text-xs text-muted-foreground">{t('imp.map.codes.noSuggestion')}</p>
                ) : null}
                {choice === 'IGNORE' && <p className="text-xs text-status-amber">{t('imp.map.codes.ignoredNote')}</p>}
                {it.chosenBy && it.choice === choice && (
                  <p className="text-xs text-muted-foreground" data-testid={`text-code-chosen-${idx}`}>
                    {t('imp.map.codes.chosenBy', { by: it.chosenBy, at: it.chosenAt ? formatDate(it.chosenAt, i18n.language) : '—' })}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {pages > 1 && <Pager page={page} total={list.length} onPage={setPage} testId="pager-codes" />}
    </div>
  );
}
