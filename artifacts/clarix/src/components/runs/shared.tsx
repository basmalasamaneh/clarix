import { useTranslation } from 'react-i18next';
import { Database } from 'lucide-react';
import type { ProductionRun, RunIssue, RunMetric } from '@workspace/api-client-react';
import { Raw } from '@/components/imports/shared';
import { cn } from '@/lib/utils';
import { Qty } from '@/components/num-text';
import '@/lib/runs-i18n';

export const VOLUME_KEYS = ['input_kg', 'good_kg', 'scrap_kg', 'scrap_rate_pct', 'good_rate_pct', 'material_balance_kg'] as const;
export const LIST_KEYS = ['input_kg', 'good_kg', 'scrap_kg', 'scrap_rate_pct', 'changeover_min'] as const;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function metricOf(list: RunMetric[] | undefined, key: string): RunMetric | undefined {
  return list?.find((m) => m.key === key);
}

export function qualityHref(issue: RunIssue): string {
  const p = new URLSearchParams({ issue: issue.id, source: issue.sourceName });
  if (issue.orderId) p.set('order', issue.orderId);
  return `/quality?${p.toString()}`;
}

/** Server display string + unit label. Never formats or computes numbers. */
export function MetricValue({ m, className, testId, showHours = true }: { m: RunMetric | undefined; className?: string; testId?: string; showHours?: boolean }) {
  const { t } = useTranslation();
  if (!m || !m.available || m.display == null) {
    return (
      <span className={cn('text-sm italic text-muted-foreground', className)} data-testid={testId} data-na="true">
        {t('rc.na')}
      </span>
    );
  }
  const hours = showHours && m.unit === 'min' ? m.hours : null;
  return (
    <span className={cn('inline-flex flex-col items-start gap-0.5', className)} data-testid={testId}>
      <span className="whitespace-nowrap">
        <Qty value={m.display} unit={m.unit} fallbackUnit={t(`rc.unit.${m.unit}`)} numClassName="font-semibold" unitClassName="text-xs text-muted-foreground" />
      </span>
      {hours && <span className="text-xs text-muted-foreground">(<Qty value={hours} unit="h" />)</span>}
      {m.noEvents && (
        <span className="rounded border border-dashed px-1.5 text-[11px] font-medium text-muted-foreground" data-testid={testId ? `${testId}-no-events` : undefined}>
          {t('rc.noEvents')}
        </span>
      )}
    </span>
  );
}

export function SourceChip({ run, testId }: { run: Pick<ProductionRun, 'sourceName'>; testId?: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border bg-secondary px-1.5 py-0.5 text-xs" data-testid={testId}>
      <Database className="size-3 shrink-0 text-primary" aria-hidden="true" />
      <Raw className="min-w-0 whitespace-normal break-words text-xs [overflow-wrap:anywhere]">{run.sourceName}</Raw>
    </span>
  );
}
