import type { ReactNode, SelectHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Check, ChevronDown, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { importError } from '@/lib/import-model';

const STATUS_TONE: Record<string, string> = {
  draft: 'text-muted-foreground border-border bg-muted',
  checked: 'text-[var(--series-good)] border-[color-mix(in_srgb,var(--series-good)_35%,transparent)] bg-[color-mix(in_srgb,var(--series-good)_8%,transparent)]',
  approved: 'text-status-green border-[color-mix(in_srgb,var(--status-green)_35%,transparent)] bg-[color-mix(in_srgb,var(--status-green)_9%,transparent)]',
  rejected: 'text-status-red border-[color-mix(in_srgb,var(--status-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--status-red)_8%,transparent)]',
};

export function StatusBadge({ status, testId }: { status: string; testId?: string }) {
  const { t } = useTranslation();
  return (
    <span
      data-testid={testId}
      className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium', STATUS_TONE[status] ?? STATUS_TONE.draft)}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {t(`imp.status.${status}`, { defaultValue: status })}
    </span>
  );
}

export function NativeSelect({ className, invalid, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <div className="relative min-w-0">
      <select
        {...props}
        aria-invalid={invalid || undefined}
        className={cn(
          'h-11 w-full min-w-0 appearance-none truncate rounded-md border border-input bg-card pe-9 ps-3 text-sm text-foreground transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60',
          invalid && 'border-status-red',
          className,
        )}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

export function ErrorNote({ error, action, testId }: { error: unknown; action?: ReactNode; testId?: string }) {
  const { t } = useTranslation();
  const e = importError(t, error);
  return (
    <div
      role="alert"
      data-testid={testId ?? 'status-error'}
      className="fade-up flex flex-col gap-3 rounded-lg border border-[color-mix(in_srgb,var(--status-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--status-red)_6%,var(--card))] p-4 sm:flex-row sm:items-center"
    >
      <AlertCircle className="size-5 shrink-0 text-status-red" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-foreground">{e.message}</p>
        {e.location && (
          <p className="mt-1 flex items-center gap-1.5 text-muted-foreground" data-testid="text-error-location">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span dir="auto" className="num break-all font-mono text-xs">{e.location}</span>
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Pager({ page, total, onPage, testId }: { page: number; total: number; onPage: (p: number) => void; testId: string }) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / 20));
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-between gap-3 pt-4" aria-label={t('imp.history.page', { page, pages })}>
      <Button variant="outline" className="min-h-11 gap-1" disabled={page <= 1} onClick={() => onPage(page - 1)} data-testid={`${testId}-prev`} aria-label={t('imp.history.prev')}>
        <ChevronLeft className="size-4 rtl-flip" aria-hidden="true" />
      </Button>
      <span className="text-sm text-muted-foreground" data-testid={`${testId}-label`}>
        {t('imp.history.page', { page, pages })}
      </span>
      <Button variant="outline" className="min-h-11 gap-1" disabled={page >= pages} onClick={() => onPage(page + 1)} data-testid={`${testId}-next`} aria-label={t('imp.history.next')}>
        <ChevronRight className="size-4 rtl-flip" aria-hidden="true" />
      </Button>
    </nav>
  );
}

export type StepKey = 'upload' | 'map' | 'check';
export const STEP_KEYS: StepKey[] = ['upload', 'map', 'check'];

export function Stepper({ current, enabled, done, onStep }: { current: StepKey; enabled: Record<StepKey, boolean>; done: Record<StepKey, boolean>; onStep: (s: StepKey) => void }) {
  const { t } = useTranslation();
  return (
    <ol className="grid grid-cols-3 gap-2" data-testid="wizard-steps">
      {STEP_KEYS.map((s, i) => {
        const active = s === current;
        return (
          <li key={s} className="min-w-0">
            <button
              type="button"
              disabled={!enabled[s]}
              onClick={() => onStep(s)}
              aria-current={active ? 'step' : undefined}
              data-testid={`step-${s}`}
              className={cn(
                'group flex min-h-11 w-full min-w-0 flex-col items-start gap-1 border-t-2 pt-2 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                active ? 'border-primary' : done[s] ? 'border-[color-mix(in_srgb,var(--primary)_45%,transparent)]' : 'border-border',
              )}
            >
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={cn(
                    'num flex size-5 items-center justify-center rounded-full border text-[11px] font-semibold',
                    active ? 'border-primary bg-primary text-primary-foreground' : done[s] ? 'border-primary text-primary' : 'border-border',
                  )}
                >
                  {done[s] && !active ? <Check className="size-3" aria-hidden="true" /> : i + 1}
                </span>
                <span className="hidden sm:inline">{t('imp.steps.label', { n: i + 1 })}</span>
              </span>
              <span className={cn('w-full whitespace-normal text-sm font-medium', active ? 'text-foreground' : 'text-muted-foreground group-enabled:group-hover:text-foreground')}>
                {t(`imp.steps.${s}`)}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function Section({ title, body, children, aside, testId }: { title: string; body?: string; children: ReactNode; aside?: ReactNode; testId?: string }) {
  return (
    <section className="fade-up rounded-xl border bg-card p-4 shadow-sm sm:p-6" data-testid={testId}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {body && <p className="mt-1 text-sm text-muted-foreground">{body}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Raw({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span dir="auto" className={cn('font-mono text-[13px]', className)} style={{ unicodeBidi: 'isolate' }}>
      {children}
    </span>
  );
}
