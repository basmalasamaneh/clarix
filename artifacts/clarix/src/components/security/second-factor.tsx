import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { ArrowRight, LifeBuoy, RotateCcw, Smartphone } from 'lucide-react';
import { getGetSessionQueryKey, useCompleteSecondFactor, useLogout } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { CodeField, ErrorLine } from './security-kit';
import { firstAllowedPath, useCsrfRequest } from '@/lib/session';

/** Login stage two: session exists with pendingSecondFactor and user:null. */
export function SecondFactorStep() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const req = useCsrfRequest();
  const complete = useCompleteSecondFactor({ request: req, mutation: { gcTime: 0 } });
  const logout = useLogout({ request: req });
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState('');

  const submit = () => {
    const c = code.trim();
    if (!c) return;
    complete.mutate({ data: { code: c } }, {
      onSuccess: (next) => {
        setCode('');
        qc.setQueryData(getGetSessionQueryKey(), next);
        void qc.invalidateQueries({ queryKey: getGetSessionQueryKey() });
        if (next.user) navigate(firstAllowedPath(next));
      },
      onError: () => setCode(''),
    });
  };
  const startOver = () =>
    logout.mutate(undefined, { onSettled: () => void qc.invalidateQueries({ queryKey: getGetSessionQueryKey() }) });

  return (
    <div className="fade-up w-full max-w-[400px]" data-testid="stage-second-factor">
      <span className="flex size-11 items-center justify-center rounded-xl border bg-accent text-primary">
        {recovery ? <LifeBuoy className="size-5" aria-hidden="true" /> : <Smartphone className="size-5" aria-hidden="true" />}
      </span>
      <h1 className="mt-4 text-[1.75rem] font-semibold tracking-tight" data-testid="text-second-factor-title">
        {recovery ? t('sec.login.recoveryTitle') : t('sec.login.codeTitle')}
      </h1>
      <p className="mt-2 leading-relaxed text-muted-foreground">{recovery ? t('sec.login.recoveryLead') : t('sec.login.codeLead')}</p>
      {complete.isError && <div className="mt-6"><ErrorLine error={complete.error} testId="status-second-factor-error" /></div>}
      <form className="mt-7 space-y-5" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <div key={recovery ? 'r' : 'c'} className="fade-up">
          <CodeField
            id="sf-code"
            value={code}
            onChange={setCode}
            recovery={recovery}
            label={recovery ? t('sec.login.recoveryLabel') : t('sec.login.codeLabel')}
            testId="input-second-factor-code"
          />
        </div>
        <Button type="submit" className="h-11 w-full gap-2 text-[0.95rem]" disabled={complete.isPending || !code.trim()} data-testid="button-second-factor-submit">
          {complete.isPending ? t('sec.common.working') : t('sec.login.verify')}
          {!complete.isPending && <ArrowRight className="size-4 rtl-flip" aria-hidden="true" />}
        </Button>
      </form>
      <div className="mt-6 flex flex-col items-start gap-1 border-t pt-4">
        <Button variant="link" className="h-auto min-h-11 px-0" onClick={() => { setRecovery((r) => !r); setCode(''); complete.reset(); }} data-testid="button-second-factor-toggle">
          {recovery ? t('sec.login.useApp') : t('sec.login.useRecovery')}
        </Button>
        <Button variant="ghost" className="min-h-11 gap-2 px-2 text-muted-foreground" disabled={logout.isPending} onClick={startOver} data-testid="button-second-factor-restart">
          <RotateCcw className="size-4" aria-hidden="true" />{t('sec.login.startOver')}
        </Button>
      </div>
    </div>
  );
}
