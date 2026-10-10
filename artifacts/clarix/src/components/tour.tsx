import { useEffect, useRef, useState } from 'react';
import { Building2, CircleHelp, Languages, Workflow, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Max 4 steps. Non-modal: the page stays usable while the card is shown. */
const steps = [
  { icon: Building2, title: 'tour.s1Title', body: 'tour.s1Body' },
  { icon: Workflow, title: 'tour.s2Title', body: 'tour.s2Body' },
  { icon: Languages, title: 'tour.s3Title', body: 'tour.s3Body' },
  { icon: CircleHelp, title: 'tour.s4Title', body: 'tour.s4Body' },
] as const;

export function FirstRunTour({ open, onFinish }: { open: boolean; onFinish: () => void }) {
  const { t } = useTranslation();
  const [i, setI] = useState(0);
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setI(0);
        finishRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  const step = steps[i];
  const Icon = step.icon;
  const last = i === steps.length - 1;
  const finish = () => {
    setI(0);
    onFinish();
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="tour-title"
      aria-describedby="tour-body"
      className="fade-up fixed bottom-4 end-4 start-4 z-40 overflow-hidden rounded-xl border bg-card shadow-lg sm:start-auto sm:w-[22rem]"
      data-testid="dialog-tour"
    >
      <div className="flex items-start gap-3 border-b px-5 py-4">
        <div key={i} className="flex size-10 shrink-0 items-center justify-center rounded-lg brand-gradient text-primary-foreground">
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {t('tour.label')} · <span className="num">{t('tour.step', { n: i + 1, total: steps.length })}</span>
          </div>
          <h2 id="tour-title" className="mt-1 font-semibold tracking-tight">{t(step.title)}</h2>
        </div>
        <Button variant="ghost" size="icon" className="-me-2 -mt-1 size-11 shrink-0" onClick={finish} aria-label={t('common.dismiss')} data-testid="button-tour-close">
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="px-5 pb-4 pt-3">
        <p id="tour-body" className="text-sm leading-relaxed text-muted-foreground">{t(step.body)}</p>
        <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
          {steps.map((_, k) => (
            <span key={k} className={cn('h-1 rounded-full transition-all', k === i ? 'w-6 bg-primary' : 'w-2 bg-border')} />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={finish} data-testid="button-tour-skip">
            {t('common.skip')}
          </Button>
          <div className="flex gap-2">
            {i > 0 && (
              <Button variant="outline" onClick={() => setI(i - 1)} data-testid="button-tour-back">
                {t('common.back')}
              </Button>
            )}
            <Button onClick={() => (last ? finish() : setI(i + 1))} data-testid="button-tour-next">
              {last ? t('common.done') : t('common.next')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
