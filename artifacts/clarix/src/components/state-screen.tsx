import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'amber' | 'red';

const toneClass: Record<Tone, string> = {
  neutral: 'text-primary bg-secondary border-primary/20',
  amber: 'text-status-amber bg-status-amber/10 border-status-amber/30',
  red: 'text-status-red bg-status-red/10 border-status-red/30',
};

export function StateScreen({
  icon: Icon,
  title,
  body,
  tone = 'neutral',
  code,
  actions,
  className,
  testId,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  tone?: Tone;
  code?: string;
  actions?: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section
      role={tone === 'red' ? 'alert' : 'status'}
      data-testid={testId}
      className={cn('fade-up mx-auto flex w-full max-w-lg flex-col items-center px-6 py-16 text-center', className)}
    >
      <div className="relative mb-6">
        <div className="ledger-grid absolute -inset-6 rounded-2xl opacity-80 [mask-image:radial-gradient(closest-side,black,transparent)]" />
        <div className={cn('relative flex size-14 items-center justify-center rounded-xl border', toneClass[tone])}>
          <Icon className="size-6" aria-hidden="true" />
        </div>
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-balance">{title}</h1>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-muted-foreground text-pretty">{body}</p>
      {code && (
        <p className="num mt-3 rounded-md border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">{code}</p>
      )}
      {actions && <div className="mt-7 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
    </section>
  );
}
