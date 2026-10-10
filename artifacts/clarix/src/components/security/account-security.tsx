import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { KeyRound, Laptop, MonitorX, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import { getGetAccountSessionsQueryKey, useGetAccountSessions, type Session } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { InlineEmpty, InlineError, Pager, Panel, PasswordInput, RowsSkeleton, formatDate } from '@/components/accounts/shared';
import { CodeField, ErrorLine, ReauthInline, SecondManagerHint, SecretBox, useSecurityAction, useSecurityState } from './security-kit';
import { useToast } from '@/hooks/use-toast';
import { localizeError } from '@/lib/session';
import { cn } from '@/lib/utils';

const SESSIONS_PER_PAGE = 10;

function Stat({ label, value, tone, testId }: { label: string; value: string; tone?: 'good' | 'warn'; testId: string }) {
  return (
    <div className="px-4 py-4 sm:px-5">
      <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</dt>
      <dd className={cn('mt-1 font-medium', tone === 'good' && 'text-status-green', tone === 'warn' && 'text-status-amber')} data-testid={testId}>{value}</dd>
    </div>
  );
}

export function AccountSecurity({ session }: { session: Session }) {
  const { t, i18n } = useTranslation();
  const sec = useSecurityState();
  const canRecoveryKey = !session.user?.platformAdmin && session.memberships.some((m) => m.role === 'factory_manager');
  const isManager = session.memberships.some((m) => m.factoryId === session.activeFactoryId && m.role === 'factory_manager');

  if (sec.isLoading) return <Panel testId="panel-security-status" title={t('sec.status.title')}><RowsSkeleton rows={2} /></Panel>;
  if (sec.isError || !sec.data)
    return (
      <Panel testId="panel-security-status" title={t('sec.status.title')}>
        <InlineError message={t('sec.status.loadError')} onRetry={() => sec.refetch()} testId="error-security" />
      </Panel>
    );
  const s = sec.data;
  return (
    <>
      {s.singleManager && isManager && <SecondManagerHint testId="notice-account-second-manager" />}
      <Panel testId="panel-security-status" title={t('sec.status.title')} lead={t('sec.status.lead')}>
        <dl className="grid divide-y sm:grid-cols-2 sm:divide-y-0 md:grid-flow-col md:auto-cols-fr md:divide-x md:rtl:divide-x-reverse">
          <Stat label={t('sec.status.mfa')} value={s.enrolled ? t('sec.common.on') : t('sec.common.off')} tone={s.enrolled ? 'good' : s.setupRequired || s.factoryRequiresMfa ? 'warn' : undefined} testId="text-security-mfa" />
          <Stat label={t('sec.status.codesLeft')} value={s.enrolled ? String(s.recoveryRemaining) : '—'} tone={s.enrolled && s.recoveryRemaining <= 3 ? 'warn' : undefined} testId="text-security-codes" />
          {canRecoveryKey && <Stat label={t('sec.status.key')} value={s.hasRecoveryKey ? t('sec.status.keyYes') : t('sec.status.keyNo')} tone={s.hasRecoveryKey ? 'good' : undefined} testId="text-security-key" />}
          <Stat label={t('sec.status.lastSignIn')} value={s.lastSignIn ? formatDate(s.lastSignIn, i18n.language) : t('sec.status.never')} testId="text-security-last" />
        </dl>
        {s.enrolled && s.recoveryRemaining <= 3 && (
          <p className="border-t px-4 py-3 text-sm text-status-amber sm:px-5" role="status" data-testid="text-security-low-codes">{t('sec.status.lowCodes')}</p>
        )}
      </Panel>
      <MfaPanel enrolled={s.enrolled} factoryRequiresMfa={s.factoryRequiresMfa} />
      {canRecoveryKey && <RecoveryKeyPanel hasKey={s.hasRecoveryKey} />}
      <SessionsPanel />
    </>
  );
}

type Stage = { k: 'idle' } | { k: 'password' } | { k: 'scan'; key: string; uri: string } | { k: 'codes'; codes: string[] };

function Steps({ at }: { at: number }) {
  const { t } = useTranslation();
  const labels = [t('sec.mfa.step1'), t('sec.mfa.step2'), t('sec.mfa.step3')];
  return (
    <ol className="flex flex-wrap gap-x-5 gap-y-2 text-xs" aria-label={labels[at]}>
      {labels.map((l, i) => (
        <li key={l} className={cn('flex items-center gap-2', i === at ? 'font-semibold text-foreground' : i < at ? 'text-status-green' : 'text-muted-foreground')} aria-current={i === at ? 'step' : undefined}>
          <span className={cn('num flex size-6 items-center justify-center rounded-full border font-mono', i === at && 'brand-gradient border-transparent text-primary-foreground')}>{i + 1}</span>
          {l}
        </li>
      ))}
    </ol>
  );
}

function Qr({ uri }: { uri: string }) {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(uri, { margin: 1, width: 208, errorCorrectionLevel: 'M', color: { dark: '#10201a', light: '#ffffff' } })
      .then((d) => live && setSrc(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      setSrc(null);
    };
  }, [uri]);
  if (failed) return <p className="text-sm text-status-amber" role="status">{t('sec.mfa.qrError')}</p>;
  return (
    <div className="grid size-[13.5rem] place-items-center rounded-lg border bg-white p-2" data-testid="img-mfa-qr">
      {src ? <img src={src} alt={t('sec.mfa.qrAlt')} width={208} height={208} draggable={false} /> : <div className="size-full animate-pulse rounded bg-muted" />}
    </div>
  );
}

function MfaPanel({ enrolled, factoryRequiresMfa }: { enrolled: boolean; factoryRequiresMfa: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const act = useSecurityAction();
  const [stage, setStage] = useState<Stage>({ k: 'idle' });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [disableOpen, setDisableOpen] = useState(false);
  const clear = () => { setPassword(''); setCode(''); };
  useEffect(() => () => setStage({ k: 'idle' }), []);

  const enroll = () =>
    act.run({ action: 'enroll', password, ...(enrolled ? { code: code.trim() } : {}) }, (r) => {
      clear();
      if (r.key && r.uri) setStage({ k: 'scan', key: r.key, uri: r.uri });
    }, () => setCode(''));
  const confirm = () =>
    act.run({ action: 'confirm', code: code.trim() }, (r) => {
      clear();
      setStage({ k: 'codes', codes: r.recoveryCodes ?? [] });
    }, () => setCode(''));
  const acknowledge = () =>
    act.run({ action: 'acknowledge' }, () => {
      setStage({ k: 'idle' });
      toast({ description: t('sec.mfa.enabled') });
    });
  const disable = () =>
    act.run({ action: 'disable', password, code: code.trim() }, () => {
      clear();
      setDisableOpen(false);
      toast({ description: t('sec.mfa.disabledToast') });
    }, () => setCode(''));

  const at = stage.k === 'password' ? 0 : stage.k === 'scan' ? 1 : 2;
  return (
    <div id="mfa" className="scroll-mt-24">
      <Panel
        testId="panel-mfa"
        title={t('sec.mfa.title')}
        lead={enrolled ? t('sec.mfa.leadOn') : t('sec.mfa.leadOff')}
        action={stage.k === 'idle' ? (
          <div className="flex flex-wrap gap-2">
            {enrolled ? (
              <>
                <Button variant="outline" className="min-h-11 gap-2" onClick={() => { act.reset(); setStage({ k: 'password' }); }} data-testid="button-mfa-replace">
                  <Smartphone className="size-4" aria-hidden="true" />{t('sec.mfa.replace')}
                </Button>
                <Button variant="outline" className="min-h-11 gap-2 text-status-red" onClick={() => { act.reset(); clear(); setDisableOpen(true); }} data-testid="button-mfa-disable">
                  <ShieldOff className="size-4" aria-hidden="true" />{t('sec.mfa.disable')}
                </Button>
              </>
            ) : (
              <Button className="min-h-11 gap-2" onClick={() => { act.reset(); setStage({ k: 'password' }); }} data-testid="button-mfa-start">
                <ShieldCheck className="size-4" aria-hidden="true" />{t('sec.mfa.start')}
              </Button>
            )}
          </div>
        ) : undefined}
      >
        {stage.k !== 'idle' && (
          <div className="space-y-5 px-4 py-5 sm:px-5">
            <Steps at={at} />
            {act.needsReauth ? (
              <ReauthInline onConfirmed={() => act.retry?.()} onCancel={act.cancelReauth} testId="reauth-mfa" />
            ) : stage.k === 'password' ? (
              <form className="fade-up space-y-4" onSubmit={(e) => { e.preventDefault(); enroll(); }} noValidate>
                <div className={cn('grid gap-4', enrolled && 'md:grid-cols-2')}>
                  <div className="space-y-1.5">
                    <Label htmlFor="mfa-pw">{t('sec.common.password')}</Label>
                    <PasswordInput id="mfa-pw" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" maxLength={256} autoFocus testId="input-mfa-password" />
                  </div>
                  {enrolled && <CodeField id="mfa-old-code" value={code} onChange={setCode} testId="input-mfa-old-code" />}
                </div>
                {act.error && <ErrorLine error={act.error} testId="error-mfa" />}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" className="min-h-11" onClick={() => { clear(); setStage({ k: 'idle' }); }} data-testid="button-mfa-cancel">{t('sec.common.cancel')}</Button>
                  <Button type="submit" className="min-h-11" disabled={act.pending || !password || (enrolled && !code.trim())} data-testid="button-mfa-continue">
                    {act.pending ? t('sec.common.working') : t('sec.common.continue')}
                  </Button>
                </div>
              </form>
            ) : stage.k === 'scan' ? (
              <form className="fade-up grid gap-6 md:grid-cols-[auto_minmax(0,1fr)]" onSubmit={(e) => { e.preventDefault(); confirm(); }} noValidate>
                <div className="space-y-2">
                  <p className="max-w-[13.5rem] text-sm">{t('sec.mfa.scan')}</p>
                  <Qr uri={stage.uri} />
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm text-muted-foreground">{t('sec.mfa.manual')}</p>
                    <SecretBox label={t('sec.mfa.keyLabel')} lines={[stage.key.replace(/(.{4})/g, '$1 ').trim()]} testId="secret-mfa-key" />
                  </div>
                  <CodeField id="mfa-code" value={code} onChange={setCode} testId="input-mfa-code" label={t('sec.mfa.enterCode')} />
                  {act.error && <ErrorLine error={act.error} testId="error-mfa-confirm" />}
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" className="min-h-11" onClick={() => { clear(); setStage({ k: 'idle' }); }} data-testid="button-mfa-scan-cancel">{t('sec.common.cancel')}</Button>
                    <Button type="submit" className="min-h-11" disabled={act.pending || code.trim().length < 6} data-testid="button-mfa-confirm">
                      {act.pending ? t('sec.common.working') : t('sec.mfa.confirm')}
                    </Button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="font-semibold">{t('sec.mfa.codesTitle')}</div>
                  <p className="text-sm text-muted-foreground">{t('sec.mfa.codesBody')}</p>
                </div>
                <SecretBox label={t('sec.mfa.codesTitle')} lines={stage.codes} testId="secret-recovery-codes" onSaved={act.pending ? undefined : acknowledge} savedLabel={t('sec.mfa.finish')} />
                {act.error && <ErrorLine error={act.error} testId="error-mfa-ack" />}
              </div>
            )}
          </div>
        )}
      </Panel>

      <AlertDialog open={disableOpen} onOpenChange={(o) => !act.pending && setDisableOpen(o)}>
        <AlertDialogContent data-testid="dialog-mfa-disable">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sec.mfa.disableTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('sec.mfa.disableBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          {factoryRequiresMfa && <p className="rounded-md border border-status-amber/40 bg-status-amber/[0.07] p-3 text-sm text-status-amber" role="note">{t('sec.mfa.disableFactoryWarn')}</p>}
          {act.needsReauth ? (
            <ReauthInline onConfirmed={() => act.retry?.()} onCancel={act.cancelReauth} testId="reauth-mfa-disable" />
          ) : (
            <form id="mfa-disable-form" className="space-y-3" onSubmit={(e) => { e.preventDefault(); disable(); }} noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="mfa-dis-pw">{t('sec.common.password')}</Label>
                <PasswordInput id="mfa-dis-pw" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" maxLength={256} testId="input-mfa-disable-password" />
              </div>
              <CodeField id="mfa-dis-code" value={code} onChange={setCode} testId="input-mfa-disable-code" />
              {act.error && <ErrorLine error={act.error} testId="error-mfa-disable" />}
            </form>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={act.pending} data-testid="button-mfa-disable-cancel">{t('sec.common.cancel')}</AlertDialogCancel>
            {!act.needsReauth && (
              <Button type="submit" form="mfa-disable-form" className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={act.pending || !password || !code.trim()} data-testid="button-mfa-disable-confirm">
                {act.pending ? t('sec.common.working') : t('sec.mfa.disable')}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RecoveryKeyPanel({ hasKey }: { hasKey: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const act = useSecurityAction();
  const [key, setKey] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  useEffect(() => () => setKey(null), []);
  const create = () =>
    act.run({ action: 'recovery-key' }, (r) => {
      setConfirmOpen(false);
      if (r.key) setKey(r.key);
      toast({ description: t('sec.key.created') });
    }, () => setConfirmOpen(false));
  return (
    <Panel
      testId="panel-recovery-key"
      title={t('sec.key.title')}
      lead={t('sec.key.lead')}
      action={!key && !act.needsReauth ? (
        <Button variant="outline" className="min-h-11 gap-2" disabled={act.pending} onClick={() => (hasKey ? setConfirmOpen(true) : create())} data-testid="button-recovery-key">
          <KeyRound className="size-4" aria-hidden="true" />
          {act.pending ? t('sec.common.working') : hasKey ? t('sec.key.replace') : t('sec.key.create')}
        </Button>
      ) : undefined}
    >
      {(key || act.needsReauth || act.error) && (
        <div className="space-y-3 px-4 py-5 sm:px-5">
          {act.needsReauth && <ReauthInline onConfirmed={() => act.retry?.()} onCancel={act.cancelReauth} testId="reauth-recovery-key" />}
          {act.error && <ErrorLine error={act.error} testId="error-recovery-key" />}
          {key && <SecretBox label={t('sec.key.yours')} lines={[key]} testId="secret-recovery-key" onSaved={() => setKey(null)} />}
        </div>
      )}
      <AlertDialog open={confirmOpen} onOpenChange={(o) => !act.pending && setConfirmOpen(o)}>
        <AlertDialogContent data-testid="dialog-recovery-key">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sec.key.replaceTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('sec.key.replaceBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={act.pending} data-testid="button-recovery-key-cancel">{t('sec.common.cancel')}</AlertDialogCancel>
            <Button className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={act.pending} onClick={create} data-testid="button-recovery-key-confirm">
              {act.pending ? t('sec.common.working') : t('sec.key.replace')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}

type Pend = { kind: 'one'; id: string; device: string } | { kind: 'others' };

function SessionsPanel() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const list = useGetAccountSessions({ page }, { request: { credentials: 'include' }, query: { queryKey: getGetAccountSessionsQueryKey({ page }), refetchOnWindowFocus: true } });
  const act = useSecurityAction();
  const [pend, setPend] = useState<Pend | null>(null);
  const done = (msg: string) => {
    setPend(null);
    void qc.invalidateQueries({ queryKey: ['/api/auth/security/sessions'] });
    toast({ description: msg });
  };
  const exec = () => {
    if (!pend) return;
    if (pend.kind === 'one') act.run({ action: 'revoke-session', sessionId: pend.id }, () => done(t('sec.sessions.revoked')), (e) => { setPend(null); toast({ variant: 'destructive', description: localizeError(t, e) }); });
    else act.run({ action: 'revoke-others' }, () => done(t('sec.sessions.othersDone')), (e) => { setPend(null); toast({ variant: 'destructive', description: localizeError(t, e) }); });
  };
  const items = list.data?.items ?? [];
  const hasOthers = (list.data?.total ?? 0) > 1;
  return (
    <Panel
      testId="panel-device-sessions"
      title={t('sec.sessions.title')}
      lead={t('sec.sessions.lead')}
      meta={list.data ? t('sec.sessions.total', { n: list.data.total }) : undefined}
      action={hasOthers ? (
        <Button variant="outline" className="min-h-11 gap-2 text-status-red" disabled={act.pending} onClick={() => setPend({ kind: 'others' })} data-testid="button-revoke-others">
          <MonitorX className="size-4" aria-hidden="true" />{t('sec.sessions.revokeOthers')}
        </Button>
      ) : undefined}
    >
      {act.needsReauth && (
        <div className="border-b px-4 py-4 sm:px-5">
          <ReauthInline onConfirmed={() => act.retry?.()} onCancel={() => { act.cancelReauth(); setPend(null); }} testId="reauth-sessions" />
        </div>
      )}
      {list.isLoading ? (
        <RowsSkeleton rows={3} />
      ) : list.isError ? (
        <InlineError message={t('sec.sessions.loadError')} onRetry={() => list.refetch()} testId="error-sessions" />
      ) : !items.length ? (
        <InlineEmpty icon={Laptop} title={t('sec.sessions.empty')} body={t('sec.sessions.lead')} testId="empty-sessions" />
      ) : (
        <>
          <ul className="divide-y">
            {items.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5" data-testid={`row-session-${s.id}`}>
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full border', s.current ? 'border-primary/40 bg-accent text-primary' : 'bg-background text-muted-foreground')}>
                  <Laptop className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium" dir="auto" data-testid={`text-session-device-${s.id}`}>{s.device}</span>
                    {s.current && <span className="rounded border border-primary/40 bg-accent px-1.5 text-[0.7rem] font-semibold text-primary" data-testid={`badge-session-current-${s.id}`}>{t('sec.sessions.current')}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground" data-testid={`text-session-active-${s.id}`}>{t('sec.sessions.lastActive', { date: formatDate(s.lastActive, i18n.language) })}</div>
                </div>
                {!s.current && (
                  <Button variant="outline" className="min-h-11" disabled={act.pending} onClick={() => setPend({ kind: 'one', id: s.id, device: s.device })} data-testid={`button-revoke-session-${s.id}`}>
                    {t('sec.sessions.revoke')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <Pager page={page} total={list.data?.total ?? 0} perPage={list.data?.pageSize || SESSIONS_PER_PAGE} onPage={setPage} testId="sessions-page" />
        </>
      )}
      <AlertDialog open={!!pend && !act.needsReauth} onOpenChange={(o) => !o && !act.pending && setPend(null)}>
        <AlertDialogContent data-testid="dialog-revoke-session">
          <AlertDialogHeader>
            <AlertDialogTitle>{pend?.kind === 'others' ? t('sec.sessions.othersTitle') : t('sec.sessions.revokeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{pend?.kind === 'one' ? t('sec.sessions.revokeBody', { device: pend.device }) : t('sec.sessions.othersBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={act.pending} data-testid="button-revoke-session-cancel">{t('sec.common.cancel')}</AlertDialogCancel>
            <Button className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={act.pending} onClick={exec} data-testid="button-revoke-session-confirm">
              {act.pending ? t('sec.common.working') : pend?.kind === 'others' ? t('sec.sessions.revokeOthers') : t('sec.sessions.revoke')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
