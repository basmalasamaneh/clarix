import { HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '@/lib/phase19-i18n';

/** Small, collapsed "How to read this page" affordance. Native <details> = keyboard + screen-reader friendly. */
export function HowToRead({ page }: { page: 'overview' | 'comparison' | 'quality' }) {
  const { t } = useTranslation();
  return (
    <details className="group mt-3 max-w-2xl rounded-lg border bg-card text-sm" data-testid={`details-how-to-read-${page}`}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-3 font-medium text-primary hover-elevate focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden" data-testid={`button-how-to-read-${page}`}>
        <HelpCircle className="size-4 shrink-0" aria-hidden="true" />
        {t('p19.howTo.label')}
      </summary>
      <p className="whitespace-normal border-t px-3 py-2.5 leading-relaxed text-muted-foreground [overflow-wrap:anywhere]" data-testid={`text-how-to-read-${page}`}>{t(`p19.howTo.${page}`)}</p>
    </details>
  );
}
