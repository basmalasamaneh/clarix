import { useTranslation } from 'react-i18next';
import { ClipboardCheck, Columns2, FileUp, CircleHelp, Ban, Info, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS: { n: string; icon: LucideIcon }[] = [
  { n: '1', icon: FileUp },
  { n: '2', icon: ClipboardCheck },
  { n: '3', icon: Columns2 },
];

const COLORS = [
  { key: 'green', dot: 'bg-status-green' },
  { key: 'yellow', dot: 'bg-status-amber' },
  { key: 'red', dot: 'bg-status-red' },
] as const;

export default function HelpPage() {
  const { t } = useTranslation();
  return (
    <div className="fade-up" data-testid="page-help">
      <div className="text-xs font-semibold uppercase tracking-[0.1em] text-primary">{t('help.kicker')}</div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight" data-testid="text-help-title">{t('help.title')}</h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">{t('help.lead')}</p>

      <section className="mt-10" aria-labelledby="help-steps">
        <h2 id="help-steps" className="text-lg font-semibold">{t('help.stepsTitle')}</h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {STEPS.map(({ n, icon: Icon }) => (
            <li key={n} className="rounded-xl border bg-card p-5" data-testid={`card-help-step-${n}`}>
              <div className="flex items-center gap-3">
                <span className="num flex size-8 items-center justify-center rounded-full brand-gradient font-mono text-sm text-primary-foreground">{n}</span>
                <Icon className="size-4 text-primary" aria-hidden="true" />
                <h3 className="font-semibold">{t(`help.s${n}Title`)}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t(`help.s${n}Body`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10" aria-labelledby="help-colors">
        <h2 id="help-colors" className="text-lg font-semibold">{t('help.colorsTitle')}</h2>
        <ul className="mt-4 divide-y rounded-xl border bg-card">
          {COLORS.map(({ key, dot }) => (
            <li key={key} className="flex gap-4 p-5" data-testid={`row-help-color-${key}`}>
              <span className={cn('mt-1.5 size-3 shrink-0 rounded-full', dot)} aria-hidden="true" />
              <div>
                <div className="font-medium">{t(`help.${key}`)}</div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(`help.${key}Body`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <Note icon={Ban} title={t('help.naTitle')} body={t('help.naBody')} testId="card-help-na" />
        <Note icon={Info} title={t('help.causeTitle')} body={t('help.causeBody')} testId="card-help-cause" />
      </div>
      <div className="mt-4">
        <Note icon={CircleHelp} title={t('help.moreTitle')} body={t('help.moreBody')} testId="card-help-more" />
      </div>
    </div>
  );
}

function Note({ icon: Icon, title, body, testId }: { icon: LucideIcon; title: string; body: string; testId: string }) {
  return (
    <section className="rounded-xl border bg-card p-5" data-testid={testId}>
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-primary" aria-hidden="true" />
        <h2 className="font-semibold">{title}</h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </section>
  );
}
