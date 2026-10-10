import { useTranslation } from 'react-i18next';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StateScreen } from '@/components/state-screen';
import type { ErrorFallbackProps } from '@/components/error-boundary';

/** Friendly 500 screen. Never shows the error message or stack. */
export function CrashScreen({ resetError }: ErrorFallbackProps) {
  const { t } = useTranslation();
  return (
    <StateScreen
      icon={TriangleAlert}
      tone="red"
      title={t('states.crashTitle')}
      body={t('states.crashBody')}
      code={t('states.crashCode')}
      testId="state-crash"
      actions={
        <Button onClick={resetError} className="gap-2" data-testid="button-crash-retry">
          <RotateCcw className="size-4" aria-hidden="true" />
          {t('states.crashAction')}
        </Button>
      }
    />
  );
}
