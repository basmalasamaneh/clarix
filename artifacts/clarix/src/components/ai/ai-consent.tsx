import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, RotateCcw, Sparkles } from 'lucide-react';
import {
  getGetAiConsentQueryKey,
  getGetFactorySettingsAuditQueryKey,
  useGetAiConsent,
  useSaveAiConsent,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { localizeError, useCsrfRequest } from '@/lib/session';
import { GEMINI_TERMS_URL } from '@/lib/phase16-i18n';
import { CONSENT_VERSION, consentStateOf } from '@/components/ai/assist-common';

/** Manager-only AI consent section. Render only for factory managers. */
export function AiConsentSection({ factoryId }: { factoryId: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const request = useCsrfRequest();
  const q = useGetAiConsent({ query: { queryKey: [...getGetAiConsentQueryKey(), factoryId], staleTime: 0, refetchOnWindowFocus: 'always', retry: false }, request: { credentials: 'include' } });
  const save = useSaveAiConsent({ mutation: { gcTime: 0 }, request });
  const [open, setOpen] = useState<null | 'on' | 'off'>(null);
  const [agree, setAgree] = useState(false);

  const needsReconfirm = q.data ? consentStateOf(q.data) === 'reconfirm' : false;
  const close = () => { setOpen(null); setAgree(false); save.reset(); };
  const submit = (enabled: boolean) => {
    save.mutate({ data: enabled ? { version: CONSENT_VERSION, enabled: true, confirmed: agree } : { enabled: false, confirmed: true } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetAiConsentQueryKey() });
        qc.invalidateQueries({ queryKey: getGetFactorySettingsAuditQueryKey() });
        toast({ description: enabled ? t('ai.consent.savedOn') : t('ai.consent.savedOff') });
        close();
      },
    });
  };

  return (
    <section className="mt-6 rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="ai-consent-title" data-testid="section-ai-consent">
      <h2 id="ai-consent-title" className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" aria-hidden="true" />{t('ai.consent.title')}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{t('ai.consent.lead')}</p>
      <div className="mt-3">
        {q.isLoading ? (
          <div role="status" aria-busy="true" className="h-11 w-56 animate-pulse rounded-md bg-muted" data-testid="state-ai-consent-loading" />
        ) : q.isError || !q.data ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm" data-testid="state-ai-consent-settings-error">
            <span className="flex-1">{t('ai.consentError')} {localizeError(t, q.error)}</span>
            <Button variant="outline" onClick={() => q.refetch()} className="min-h-11 gap-2" data-testid="button-ai-consent-retry"><RotateCcw className="size-4" aria-hidden="true" />{t('ai.retry')}</Button>
          </div>
        ) : !q.data.configured ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground" data-testid="state-ai-consent-unconfigured">{t('ai.consent.unconfigured')}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${needsReconfirm ? 'border-[var(--status-amber)] text-status-amber' : q.data.enabled ? 'border-primary/40 bg-accent text-primary' : 'text-muted-foreground'}`} data-testid="status-ai-consent">
              {needsReconfirm ? t('aiConsent2.stateReconfirm') : q.data.enabled ? t('ai.consent.stateOn') : t('ai.consent.stateOff')}
            </span>
            {needsReconfirm && <Button onClick={() => setOpen('on')} className="min-h-11" data-testid="button-ai-consent-reconfirm">{t('aiConsent2.reconfirmButton')}</Button>}
            {q.data.enabled
              ? <Button variant="outline" onClick={() => setOpen('off')} className="min-h-11" data-testid="button-ai-consent-disable">{t('ai.consent.disable')}</Button>
              : <Button onClick={() => setOpen('on')} className="min-h-11" data-testid="button-ai-consent-enable">{t('ai.consent.enable')}</Button>}
          </div>
        )}
      </div>

      <AlertDialog open={open !== null} onOpenChange={(o) => { if (!o) close(); }}>
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto" data-testid={open === 'off' ? 'dialog-ai-consent-disable' : 'dialog-ai-consent'}>
          <AlertDialogHeader>
            <AlertDialogTitle>{open === 'off' ? t('ai.consent.disable') : t('ai.consent.dialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{open === 'off' ? t('ai.consent.disableBody') : t('ai.consent.lead')}</AlertDialogDescription>
          </AlertDialogHeader>
          {open === 'on' && (
            <div className="space-y-3 text-sm" data-testid="text-ai-consent-disclosure">
              {needsReconfirm && <div className="rounded-lg border border-[var(--status-amber)] p-3" data-testid="text-ai-consent-reconfirm"><p className="font-semibold">{t('aiConsent2.reconfirmTitle')}</p><p className="text-muted-foreground">{t('aiConsent2.reconfirm')}</p></div>}
              <div><p className="font-semibold">{t('ai.consent.sendsTitle')}</p><p className="text-muted-foreground">{t('ai.consent.sends')}</p></div>
              <div><p className="font-semibold">{t('ai.consent.neverTitle')}</p><p className="text-muted-foreground">{t('ai.consent.never')}</p></div>
              <div data-testid="text-ai-consent-typed"><p className="font-semibold">{t('aiConsent2.typedTitle')}</p><p className="text-muted-foreground">{t('aiConsent2.typed')}</p></div>
              <div className="rounded-lg border border-[color-mix(in_srgb,var(--status-amber)_40%,var(--border))] p-3" data-testid="text-ai-consent-free"><p className="font-semibold">{t('aiConsent2.freeTitle')}</p><p className="text-muted-foreground">{t('aiConsent2.free')}</p></div>
              <div className="rounded-lg border border-[color-mix(in_srgb,var(--status-amber,orange)_40%,var(--border))] p-3">
                <p className="font-semibold">{t('ai.consent.googleTitle')}</p>
                <p className="text-muted-foreground">{t('ai.consent.google')}</p>
                <a href={GEMINI_TERMS_URL} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1.5 font-medium text-primary underline" data-testid="link-ai-terms">
                  {t('ai.consent.terms')}<ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              </div>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3">
                <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" data-testid="checkbox-ai-consent-confirm" />
                <span>{t('ai.consent.confirm')}</span>
              </label>
            </div>
          )}
          {save.isError && <p role="alert" className="text-sm text-status-red" data-testid="error-ai-consent-save">{t('ai.consent.saveError')} {localizeError(t, save.error)}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" data-testid="button-ai-consent-cancel">{t('ai.consent.cancel')}</AlertDialogCancel>
            {open === 'off'
              ? <Button variant="destructive" onClick={() => submit(false)} disabled={save.isPending} className="min-h-11" data-testid="button-ai-consent-confirm-disable">{t('ai.consent.disable')}</Button>
              : <Button onClick={() => submit(true)} disabled={!agree || save.isPending} className="min-h-11" data-testid="button-ai-consent-confirm">{t('ai.consent.saveOn')}</Button>}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
