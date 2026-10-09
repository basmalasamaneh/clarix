import { useState } from 'react';
import { Building2, Languages, PanelsTopLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const steps = [
  { icon: Building2, title: 'tour.s1Title', body: 'tour.s1Body' },
  { icon: PanelsTopLeft, title: 'tour.s2Title', body: 'tour.s2Body' },
  { icon: Languages, title: 'tour.s3Title', body: 'tour.s3Body' },
] as const;

export function FirstRunTour({ open, onFinish }: { open: boolean; onFinish: () => void }) {
  const { t } = useTranslation();
  const [i, setI] = useState(0);
  const step = steps[i];
  const Icon = step.icon;
  const last = i === steps.length - 1;
  const finish = () => {
    setI(0);
    onFinish();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && finish()}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0" data-testid="dialog-tour">
        <div className="ledger-grid relative border-b bg-background px-6 pb-6 pt-8">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {t('tour.label')} · <span className="num">{t('tour.step', { n: i + 1, total: steps.length })}</span>
          </div>
          <div key={i} className="fade-up mt-5 flex size-12 items-center justify-center rounded-xl brand-gradient text-primary-foreground shadow-md">
            <Icon className="size-6" aria-hidden="true" />
          </div>
        </div>
        <div className="px-6 pb-6 pt-5">
          <DialogTitle className="text-lg font-semibold tracking-tight">{t(step.title)}</DialogTitle>
          <DialogDescription className="mt-2 leading-relaxed text-muted-foreground">{t(step.body)}</DialogDescription>
          <div className="mt-6 flex items-center gap-1.5" aria-hidden="true">
            {steps.map((_, k) => (
              <span key={k} className={cn('h-1 rounded-full transition-all', k === i ? 'w-6 bg-primary' : 'w-2 bg-border')} />
            ))}
          </div>
          <div className="mt-6 flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={finish} data-testid="button-tour-skip">
              {t('common.skip')}
            </Button>
            <div className="flex gap-2">
              {i > 0 && (
                <Button variant="outline" onClick={() => setI(i - 1)} data-testid="button-tour-back">
                  {t('common.back')}
                </Button>
              )}
              <Button onClick={() => (last ? finish() : setI(i + 1))} data-testid="button-tour-next" autoFocus>
                {last ? t('common.done') : t('common.next')}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
