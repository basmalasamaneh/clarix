import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'wouter';
import { KeyRound, Link2Off, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { Member, Session } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Panel, RowsSkeleton, InlineError, absoluteInviteUrl, formatDate } from '@/components/accounts/shared';
import { ErrorLine, Notice, ReauthInline, SecondManagerHint, SecretBox, useSecurityAction, useSecurityState } from './security-kit';
import { useToast } from '@/hooks/use-toast';
import { errorStatus } from '@/lib/session';

/** App-wide, non-blocking notices: guided admin setup, factory grace period, single-manager advice. */
export function SecurityNotices({ session }: { session: Session }) {
  const { t, i18n } = useTranslation();
  const [location] = useLocation();
  const sec = useSecurityState(!!session.user);
  if (!sec.data || location === '/account') return null;
  const s = sec.data;
  const isManager = session.memberships.some((m) => m.factoryId === session.activeFactoryId && m.role === 'factory_manager');
  const setupLink = (label: string, id: string) => (
    <Link href="/account#mfa" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover-elevate" data-testid={id}>
      <ShieldCheck className="size-4" aria-hidden="true" />{label}
    </Link>
  );
  const notices = [];
  if (s.setupRequired && !s.enrolled)
    notices.push(<Notice key="setup" tone="amber" icon={<ShieldAlert className="size-5" aria-hidden="true" />} title={t('sec.banner.setupTitle')} body={t('sec.banner.setupBody')} action={setupLink(t('sec.banner.setupAction'), 'link-mfa-setup')} testId="notice-mfa-setup" />);
  else if (s.factoryRequiresMfa && !s.enrolled)
    notices.push(
      <Notice
        key="grace"
        tone="amber"
        icon={<ShieldAlert className="size-5" aria-hidden="true" />}
        title={t('sec.banner.graceTitle')}
        body={s.graceUntil ? t('sec.banner.graceBody', { date: formatDate(s.graceUntil, i18n.language) }) : t('sec.banner.graceBodyNoDate')}
        action={setupLink(t('sec.banner.graceAction'), 'link-mfa-grace')}
        testId="notice-mfa-grace"
      />,
    );
  if (s.singleManager && isManager && location !== '/members')
    notices.push(
      <SecondManagerHint key="single" testId="notice-app-second-manager" dismissible />,
    );
  if (!notices.length) return null;
  return <div className="mb-6 space-y-3" data-testid="region-security-notices">{notices}</div>;
}

/** Factory Settings: require two-factor for every member (audited server-side, needs recent sign-in). */
export function MfaPolicyPanel() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const sec = useSecurityState();
  const act = useSecurityAction();
  const [want, setWant] = useState<boolean | null>(null);
  const apply = () => {
    if (want === null) return;
    act.run({ action: 'require-mfa', required: want }, () => { setWant(null); toast({ description: t('sec.policy.saved') }); });
  };
  return (
    <Panel testId="panel-mfa-policy" title={t('sec.policy.title')} lead={t('sec.policy.lead')}>
      {sec.isLoading ? (
        <RowsSkeleton rows={1} />
      ) : sec.isError || !sec.data ? (
        <InlineError message={t('sec.status.loadError')} onRetry={() => sec.refetch()} testId="error-mfa-policy" />
      ) : (
        <div className="space-y-3 px-4 py-5 sm:px-5">
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
            <span className="font-medium">{t('sec.policy.label')}</span>
            <span className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground" data-testid="text-mfa-policy-state">{sec.data.factoryRequiresMfa ? t('sec.common.on') : t('sec.common.off')}</span>
              <Switch checked={sec.data.factoryRequiresMfa} disabled={act.pending} onCheckedChange={(v) => { act.reset(); setWant(v); }} data-testid="switch-mfa-policy" />
            </span>
          </label>
          {sec.data.factoryRequiresMfa && sec.data.graceUntil && (
            <p className="text-sm text-muted-foreground" data-testid="text-mfa-policy-grace">{t('sec.policy.grace', { date: formatDate(sec.data.graceUntil, i18n.language) })}</p>
          )}
          {!sec.data.enrolled && (
            <p className="text-sm text-status-amber" role="note">
              {t('sec.policy.selfFirst')}{' '}
              <Link href="/account#mfa" className="font-medium underline underline-offset-2" data-testid="link-policy-self-mfa">{t('sec.mfa.start')}</Link>
            </p>
          )}
          {act.needsReauth && <ReauthInline onConfirmed={() => act.retry?.()} onCancel={() => { act.cancelReauth(); setWant(null); }} testId="reauth-mfa-policy" />}
          {act.error && <ErrorLine error={act.error} testId="error-mfa-policy-save" />}
        </div>
      )}
      <AlertDialog open={want !== null && !act.needsReauth} onOpenChange={(o) => !o && !act.pending && setWant(null)}>
        <AlertDialogContent data-testid="dialog-mfa-policy">
          <AlertDialogHeader>
            <AlertDialogTitle>{want ? t('sec.policy.onTitle') : t('sec.policy.offTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{want ? t('sec.policy.onBody') : t('sec.policy.offBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={act.pending} data-testid="button-mfa-policy-cancel">{t('sec.common.cancel')}</AlertDialogCancel>
            <Button className="min-h-11" disabled={act.pending} onClick={apply} data-testid="button-mfa-policy-confirm">
              {act.pending ? t('sec.common.working') : t('sec.common.continue')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}

/** Members page: issue / cancel a one-time reset link. Link is kept in memory only while the dialog is open. */
export function MemberResetControl({ member, disabled }: { member: Member; disabled?: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const act = useSecurityAction();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const issue = () =>
    act.run({ action: 'issue-reset', memberId: member.id }, (r) => {
      if (r.token) setLink(absoluteInviteUrl(`/reset#${r.token}`));
    });
  const revoke = () => {
    act.run({ action: 'revoke-reset', memberId: member.id }, () => {
      setLink(null);
      setOpen(false);
      setRevokeOpen(false);
      toast({ description: t('sec.reset.revoked') });
    }, (e) => {
      if (errorStatus(e) === 404) {
        act.reset();
        setRevokeOpen(false);
        toast({ description: t('errors.codes.no_pending_reset') });
      }
    });
  };
  const close = () => { setOpen(false); setLink(null); act.reset(); };

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <Button variant="outline" className="min-h-11 gap-1.5" disabled={disabled || act.pending} onClick={() => { act.reset(); setOpen(true); }} data-testid={`button-reset-member-${member.id}`}>
          <KeyRound className="size-4" aria-hidden="true" />{t('sec.reset.issue')}
        </Button>
        {!open && (
          <Button variant="ghost" size="icon" className="size-11 text-status-red" onClick={() => setRevokeOpen(true)} aria-label={t('sec.reset.revokeShort')} title={t('sec.reset.revokeShort')} data-testid={`button-revoke-reset-${member.id}`}>
            <Link2Off className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      <AlertDialog open={open} onOpenChange={(o) => !o && !act.pending && close()}>
        <AlertDialogContent data-testid={`dialog-reset-${member.id}`}>
          <AlertDialogHeader>
            <AlertDialogTitle>{link ? t('sec.reset.linkTitle', { name: member.name }) : t('sec.reset.issueTitle', { name: member.name })}</AlertDialogTitle>
            <AlertDialogDescription>{link ? t('sec.reset.linkBody', { name: member.name }) : t('sec.reset.issueBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          {act.needsReauth && <ReauthInline onConfirmed={() => act.retry?.()} onCancel={act.cancelReauth} testId="reauth-reset" />}
          {act.error && <ErrorLine error={act.error} testId="error-reset" />}
          {link && <SecretBox label={t('sec.reset.issue')} lines={[link]} testId="secret-reset-link" />}
          <AlertDialogFooter>
            {link ? (
              <>
                <Button variant="outline" className="min-h-11 gap-1.5 text-status-red" disabled={act.pending} onClick={revoke} data-testid="button-reset-revoke-now">
                  <Link2Off className="size-4" aria-hidden="true" />{t('sec.reset.revoke')}
                </Button>
                <Button className="min-h-11" onClick={close} data-testid="button-reset-done">{t('sec.common.done')}</Button>
              </>
            ) : (
              <>
                <AlertDialogCancel className="min-h-11" disabled={act.pending} data-testid="button-reset-cancel">{t('sec.common.cancel')}</AlertDialogCancel>
                {!act.needsReauth && (
                  <Button className="min-h-11" disabled={act.pending} onClick={issue} data-testid="button-reset-create">
                    {act.pending ? t('sec.common.working') : t('sec.reset.create')}
                  </Button>
                )}
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={revokeOpen} onOpenChange={(o) => !act.pending && setRevokeOpen(o)}>
        <AlertDialogContent data-testid={`dialog-revoke-reset-${member.id}`}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sec.reset.revokeTitle', { name: member.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t('sec.reset.revokeBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          {act.needsReauth && <ReauthInline onConfirmed={() => act.retry?.()} onCancel={act.cancelReauth} testId="reauth-revoke-reset" />}
          {act.error && <ErrorLine error={act.error} testId="error-revoke-reset" />}
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={act.pending} data-testid="button-revoke-reset-cancel">{t('sec.common.cancel')}</AlertDialogCancel>
            {!act.needsReauth && (
              <Button className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={act.pending} onClick={revoke} data-testid="button-revoke-reset-confirm">
                {t('sec.reset.revoke')}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
