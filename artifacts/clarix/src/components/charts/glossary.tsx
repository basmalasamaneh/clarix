import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleHelp } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { METRIC_GLOSSARY, STATUS_GLOSSARY, type GlossaryKey } from '@/lib/charts-i18n';

/**
 * Small "?" trigger with the glossary meaning. Popover (not hover tooltip) so it
 * works with tap, Enter and Space. Render it OUTSIDE other buttons/links.
 */
export function GlossaryTip({ term, className, testId }: { term: GlossaryKey; className?: string; testId?: string }) {
  const { t } = useTranslation();
  const name = t(`gl.terms.${term}.term`);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn('inline-grid size-11 shrink-0 place-items-center rounded-full align-middle text-muted-foreground hover-elevate -my-3', className)}
          aria-label={t('gl.open', { term: name })}
          data-testid={testId ?? `button-glossary-${term}`}
        >
          <CircleHelp className="size-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 text-sm" data-testid={`popover-glossary-${term}`}>
        <p className="font-semibold">{name}</p>
        <p className="mt-1 text-muted-foreground">{t(`gl.terms.${term}.def`)}</p>
      </PopoverContent>
    </Popover>
  );
}

/** Text followed by its glossary tip, for metric keys. */
export function MetricTerm({ metric, children }: { metric: string; children: ReactNode }) {
  const g = METRIC_GLOSSARY[metric];
  return <span className="inline-flex min-w-0 flex-wrap items-center">{children}{g && <GlossaryTip term={g} testId={`button-glossary-${g}-${metric}`} />}</span>;
}

const GROUP_GLOSSARY: Record<string, GlossaryKey> = { changeover: 'changeover', downtime: 'downtime' };
export function GroupTip({ group, testId }: { group: string; testId?: string }) {
  const g = GROUP_GLOSSARY[group];
  return g ? <GlossaryTip term={g} testId={testId ?? `button-glossary-${g}-group`} /> : null;
}

export function StatusTip({ status, testId }: { status: string; testId?: string }) {
  const g = STATUS_GLOSSARY[status];
  return g ? <GlossaryTip term={g} testId={testId} /> : null;
}

