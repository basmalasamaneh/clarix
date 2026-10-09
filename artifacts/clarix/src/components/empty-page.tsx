import type { LucideIcon } from 'lucide-react';
import { CircleDashed, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

export function PageHeader({ title, lead, icon: Icon, meta }: { title: string; lead: string; icon: LucideIcon; meta?: string }) {
  return (
    <header className="fade-up flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-start gap-4">
        <div className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-lg border bg-card text-primary shadow-sm">
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight" data-testid="text-page-title">
            {title}
          </h1>
          <p className="mt-1 text-muted-foreground">{lead}</p>
        </div>
      </div>
      {meta && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          {meta}
        </div>
      )}
    </header>
  );
}

function Schematic() {
  // Purely structural drawing: frame, ruled lines, a source trace. No values.
  return (
    <svg viewBox="0 0 320 180" className="h-auto w-full" aria-hidden="true">
      <rect x="0.5" y="0.5" width="319" height="179" rx="10" fill="var(--card)" stroke="var(--border)" />
      {Array.from({ length: 6 }).map((_, i) => (
        <line key={i} x1="20" x2="300" y1={36 + i * 22} y2={36 + i * 22} stroke="var(--rule)" strokeWidth="1" />
      ))}
      {Array.from({ length: 36 }).map((_, i) => (
        <line
          key={`t${i}`}
          x1={20 + i * 8}
          x2={20 + i * 8}
          y1="160"
          y2={i % 5 === 0 ? 152 : 156}
          stroke="var(--border)"
        />
      ))}
      <rect x="20" y="20" width="84" height="8" rx="4" fill="var(--muted)" stroke="var(--border)" />
      <rect x="32" y="58" width="96" height="66" rx="6" fill="none" stroke="var(--primary)" strokeDasharray="4 4" opacity="0.55" />
      <rect x="192" y="58" width="96" height="66" rx="6" fill="none" stroke="var(--primary)" strokeDasharray="4 4" opacity="0.55" />
      <path d="M128 91 H192" stroke="var(--border)" strokeWidth="1.5" strokeDasharray="2 4" />
      <circle cx="160" cy="91" r="9" fill="var(--background)" stroke="var(--border)" />
      <path d="M156 91h8" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M80 124 V140 H236 V124" fill="none" stroke="var(--primary)" strokeWidth="1.2" opacity="0.4" />
      <rect x="132" y="133" width="56" height="14" rx="7" fill="var(--secondary)" stroke="var(--primary)" strokeOpacity="0.35" />
      <rect x="142" y="138.5" width="36" height="3" rx="1.5" fill="var(--primary)" opacity="0.45" />
    </svg>
  );
}

export function EmptyPanel({
  title,
  body,
  items,
  pageKey,
}: {
  title: string;
  body: string;
  items: string[];
  pageKey: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="fade-up mt-8 grid overflow-hidden rounded-xl border bg-card shadow-sm lg:grid-cols-[1.15fr_1fr]"
      style={{ animationDelay: '80ms' }}
      data-testid={`empty-${pageKey}`}
    >
      <div className="flex flex-col p-6 sm:p-8">
        <Badge variant="outline" className="w-fit gap-1.5 rounded-full border-dashed px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          <CircleDashed className="size-3.5" aria-hidden="true" />
          {t('pages.emptyBadge')}
        </Badge>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 max-w-prose leading-relaxed text-muted-foreground">{body}</p>
        <div className="mt-8">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t('pages.whatAppears')}</h3>
          <ol className="mt-3 divide-y border-y">
            {items.map((item, i) => (
              <li key={item} className="flex items-center gap-4 py-3">
                <span className="num flex size-6 shrink-0 items-center justify-center rounded-md border bg-muted font-mono text-xs text-muted-foreground">
                  {i + 1}
                </span>
                <span className="text-[0.95rem]">{item}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="ledger-grid relative flex flex-col justify-between gap-6 border-t bg-background p-6 sm:p-8 lg:border-t-0 lg:border-s">
        <Schematic />
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          {t('pages.nothingInvented')}
        </p>
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" className="animate-pulse">
      <div className="flex items-start gap-4 border-b pb-6">
        <div className="size-11 rounded-lg bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-7 w-48 rounded bg-muted" />
          <div className="h-4 w-80 max-w-full rounded bg-muted" />
        </div>
      </div>
      <div className="mt-8 grid gap-0 overflow-hidden rounded-xl border lg:grid-cols-2">
        <div className="space-y-3 p-8">
          <div className="h-5 w-24 rounded-full bg-muted" />
          <div className="h-6 w-64 rounded bg-muted" />
          <div className="h-4 w-full rounded bg-muted" />
          <div className="h-4 w-5/6 rounded bg-muted" />
          <div className="mt-6 h-32 rounded bg-muted" />
        </div>
        <div className="min-h-64 bg-muted/60" />
      </div>
    </div>
  );
}
