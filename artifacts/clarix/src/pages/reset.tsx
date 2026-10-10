import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { ArrowLeft, CheckCircle2, KeyRound, LifeBuoy } from 'lucide-react';
import { useRecoverAccount } from '@workspace/api-client-react';
import '@/lib/phase18-i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandMark } from '@/components/brand';
import { LanguageSwitch, ThemeMenu } from '@/components/prefs-controls';
import { PasswordInput, charLen, endLocalSession } from '@/components/accounts/shared';
import { ErrorLine, StrengthGuide } from '@/components/security/security-kit';
import { useCsrfRequest } from '@/lib/session';

/** Reads the reset token from the URL fragment once, then strips it so it never sits in history or the address bar. */
function takeHashToken(): string {
  const raw = window.location.hash.replace(/^#/, '');
  if (raw) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return /^[A-Za-z0-9_.~-]{1,128}$/.test(raw) ? raw : '';
}

export default function ResetPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const req = useCsrfRequest();
  const recover = useRecoverAccount({ request: req, mutation: { gcTime: 0 } });
  const [token] = useState(takeHashToken);
  const [mode, setMode] = useState<'token' | 'key' | 'none'>(token ? 'token' : 'none');
  const [email, setEmail] = useState('');
  const [key, setKey] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => () => { setPw(''); setPw2(''); setKey(''); }, []);

  const n = charLen(pw);
  const pwOk = n >= 12 && pw.length <= 256;
  const match = pw === pw2;
  const canSubmit = pwOk && match && (mode === 'token' ? !!token : !!email.trim() && !!key.trim());

  const submit = () => {
    if (!canSubmit) return;
    const data = mode === 'token' ? { token, password: pw } : { email: email.trim(), recoveryKey: key.trim(), password: pw };
    recover.mutate({ data }, {
      onSuccess: () => {
        setPw(''); setPw2(''); setKey('');
        endLocalSession(qc);
        setDone(true);
      },
      onError: () => { setPw2(''); },
    });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <div className="flex h-16 items-center justify-between px-4 sm:px-8">
        <BrandMark />
        <div className="flex items-center gap-1"><LanguageSwitch /><ThemeMenu /></div>
      </div>
      <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-6 sm:items-center sm:px-8">
        <div className="fade-up w-full max-w-[440px]" data-testid="page-reset">
          {done ? (
            <div className="rounded-xl border bg-card p-6 shadow-[var(--shadow)]" role="status" data-testid="status-reset-done">
              <CheckCircle2 className="size-8 text-status-green" aria-hidden="true" />
              <h1 className="mt-4 text-2xl font-semibold tracking-tight">{t('sec.recover.doneTitle')}</h1>
              <p className="mt-2 leading-relaxed text-muted-foreground">{t('sec.recover.doneBody')}</p>
              <Button className="mt-6 h-11 w-full" onClick={() => navigate('/login')} data-testid="button-reset-signin">{t('sec.recover.signIn')}</Button>
            </div>
          ) : (
            <>
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">{t('sec.recover.kicker')}</div>
              <h1 className="mt-2 text-[1.75rem] font-semibold tracking-tight" data-testid="text-reset-title">{t('sec.recover.title')}</h1>
              <p className="mt-2 leading-relaxed text-muted-foreground">
                {mode === 'token' ? t('sec.recover.leadToken') : mode === 'key' ? t('sec.recover.leadKey') : t('sec.recover.noLink')}
              </p>

              {mode === 'none' ? (
                <div className="mt-7 space-y-3">
                  <div className="flex items-start gap-3 rounded-lg border bg-card p-4 text-sm">
                    <LifeBuoy className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{t('sec.help.forgotBody')}</span>
                  </div>
                  <Button variant="outline" className="h-11 w-full gap-2" onClick={() => setMode('key')} data-testid="button-reset-use-key">
                    <KeyRound className="size-4" aria-hidden="true" />{t('sec.recover.useKey')}
                  </Button>
                </div>
              ) : (
                <form className="mt-7 space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
                  {mode === 'key' && (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="rec-email">{t('sec.recover.email')}</Label>
                        <Input id="rec-email" type="email" dir="ltr" autoComplete="username" inputMode="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 bg-card text-start" autoFocus data-testid="input-reset-email" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="rec-key">{t('sec.recover.keyLabel')}</Label>
                        <PasswordInput id="rec-key" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" maxLength={128} className="bg-card font-mono" dir="ltr" testId="input-reset-key" />
                      </div>
                    </>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="rec-pw">{t('sec.recover.newPw')}</Label>
                    <PasswordInput id="rec-pw" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" maxLength={512} className="bg-card" autoFocus={mode === 'token'} testId="input-reset-password" />
                  </div>
                  <StrengthGuide value={pw} testId="guide-reset-password" />
                  <div className="space-y-1.5">
                    <Label htmlFor="rec-pw2">{t('sec.recover.confirm')}</Label>
                    <PasswordInput id="rec-pw2" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" maxLength={512} className="bg-card" aria-invalid={!!pw2 && !match} testId="input-reset-confirm" />
                    {!!pw2 && !match && <p className="text-xs text-status-red">{t('acct.pw.mismatch')}</p>}
                  </div>
                  {recover.isError && <ErrorLine error={recover.error} testId="error-reset" />}
                  <Button type="submit" className="h-11 w-full" disabled={!canSubmit || recover.isPending} data-testid="button-reset-submit">
                    {recover.isPending ? t('sec.common.working') : t('sec.recover.submit')}
                  </Button>
                </form>
              )}
              <Button variant="ghost" className="mt-6 min-h-11 gap-2 px-2" onClick={() => navigate('/login')} data-testid="button-reset-back">
                <ArrowLeft className="size-4 rtl-flip" aria-hidden="true" />{t('sec.recover.back')}
              </Button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
