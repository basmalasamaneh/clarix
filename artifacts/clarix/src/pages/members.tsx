import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import {
  Check,
  CircleDot,
  CircleSlash,
  Clock,
  Copy,
  History,
  Link2,
  MailPlus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  getGetInvitationsQueryKey,
  getGetMemberAuditQueryKey,
  getGetMembersQueryKey,
  getGetSessionQueryKey,
  useCreateInvitation,
  useGetInvitations,
  useGetMemberAudit,
  useGetMembers,
  useReissueInvitation,
  useRevokeInvitation,
  useUpdateMember,
  type Invitation,
  type InvitationLink,
  type Member,
  type MemberRole,
  type Session,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { errorStatus, localizeError, usePrefs } from '@/lib/session';
import { cn } from '@/lib/utils';
import {
  absoluteInviteUrl,
  endLocalSession,
  formatDate,
  InlineEmpty,
  InlineError,
  Pager,
  Panel,
  RowsSkeleton,
} from '@/components/accounts/shared';

const ROLES: MemberRole[] = ['factory_manager', 'analyst', 'viewer'];
const PER_PAGE = 20;
const AUDIT_PER_PAGE = 10;

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?';
}

function useReq(session: Session) {
  return { credentials: 'include' as const, headers: { 'X-CSRF-Token': session.csrfToken } };
}

type Pending =
  | { kind: 'role'; member: Member; role: MemberRole }
  | { kind: 'active'; member: Member; active: boolean }
  | { kind: 'revoke'; inv: Invitation }
  | { kind: 'reissue'; inv: Invitation };

export default function MembersPage({ session }: { session: Session }) {
  const { t } = useTranslation();
  const { language } = usePrefs();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const req = useReq(session);
  const factory = session.memberships.find((m) => m.factoryId === session.activeFactoryId)?.factoryName ?? '';

  const [mPage, setMPage] = useState(1);
  const [iPage, setIPage] = useState(1);
  const [aPage, setAPage] = useState(1);
  const live = { refetchOnWindowFocus: true, retry: (n: number, e: unknown) => n < 1 && ![401, 403, 404].includes(errorStatus(e) ?? 0) };

  const members = useGetMembers({ page: mPage }, { request: req, query: { queryKey: getGetMembersQueryKey({ page: mPage }), ...live } });
  const invites = useGetInvitations({ page: iPage }, { request: req, query: { queryKey: getGetInvitationsQueryKey({ page: iPage }), ...live } });
  const audit = useGetMemberAudit({ request: req, query: { queryKey: getGetMemberAuditQueryKey(), ...live } });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [link, setLink] = useState<InvitationLink | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const update = useUpdateMember({ request: req });
  const revoke = useRevokeInvitation({ request: req });
  const reissue = useReissueInvitation({ request: req, mutation: { gcTime: 0 } });

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ['/api/members'] });
    void qc.invalidateQueries({ queryKey: ['/api/members/invitations'] });
    void qc.invalidateQueries({ queryKey: getGetMemberAuditQueryKey() });
  };

  const onErr = (err: unknown) => {
    if (errorStatus(err) === 401) {
      endLocalSession(qc);
      navigate('/login');
      return;
    }
    toast({ variant: 'destructive', description: localizeError(t, err) });
    if (errorStatus(err) === 403) void qc.invalidateQueries({ queryKey: getGetSessionQueryKey() });
  };

  const confirmPending = () => {
    const p = pending;
    if (!p) return;
    if (p.kind === 'role' || p.kind === 'active') {
      const data = p.kind === 'role' ? { role: p.role } : { active: p.active };
      const self = p.member.id === session.user?.id || p.member.email === session.user?.email;
      update.mutate(
        { id: p.member.id, data },
        {
          onSuccess: () => {
            setPending(null);
            if (self && (p.kind === 'active' ? !p.active : p.role !== 'factory_manager')) {
              if (p.kind === 'active') {
                toast({ description: t('acct.members.selfOut') });
                endLocalSession(qc);
                navigate('/login');
                return;
              }
              void qc.invalidateQueries({ queryKey: getGetSessionQueryKey() });
            }
            toast({ description: t('acct.members.updated') });
            refreshAll();
          },
          onError: (e) => {
            setPending(null);
            onErr(e);
          },
        },
      );
    } else if (p.kind === 'revoke') {
      revoke.mutate(
        { id: p.inv.id },
        {
          onSuccess: () => {
            setPending(null);
            toast({ description: t('acct.inv.revoked') });
            refreshAll();
          },
          onError: (e) => {
            setPending(null);
            onErr(e);
          },
        },
      );
    } else {
      reissue.mutate(
        { id: p.inv.id },
        {
          onSuccess: (res) => {
            setPending(null);
            setLink(res);
            reissue.reset();
            refreshAll();
          },
          onError: (e) => {
            setPending(null);
            onErr(e);
          },
        },
      );
    }
  };

  const auditItems = audit.data ?? [];
  const auditSlice = useMemo(
    () => auditItems.slice((aPage - 1) * AUDIT_PER_PAGE, aPage * AUDIT_PER_PAGE),
    [auditItems, aPage],
  );
  const busy = update.isPending || revoke.isPending || reissue.isPending;

  return (
    <div className="space-y-8">
      <header className="fade-up flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">{t('acct.members.kicker')}</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl" data-testid="text-members-title">
            {t('acct.members.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t('acct.members.lead', { factory })}</p>
        </div>
        <Button className="min-h-11 gap-2" onClick={() => setInviteOpen(true)} data-testid="button-invite-member">
          <UserPlus className="size-4" aria-hidden="true" />
          {t('acct.members.invite')}
        </Button>
      </header>

      <Panel
        testId="panel-members"
        title={t('acct.members.membersTitle')}
        meta={members.data ? t('acct.members.membersCount', { n: members.data.total }) : undefined}
      >
        {members.isLoading ? (
          <RowsSkeleton />
        ) : members.isError ? (
          <InlineError message={localizeError(t, members.error) || t('acct.members.loadError')} onRetry={() => members.refetch()} testId="error-members" />
        ) : !members.data?.items.length ? (
          <InlineEmpty icon={Users} title={t('acct.members.emptyTitle')} body={t('acct.members.emptyBody')} testId="empty-members" />
        ) : (
          <>
            <ul className="divide-y">
              {members.data.items.map((m) => {
                const self = m.id === session.user?.id || m.email === session.user?.email;
                return (
                  <li key={m.id} className="grid gap-3 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1.6fr)_11rem_minmax(0,1fr)_auto] md:items-center" data-testid={`row-member-${m.id}`}>
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className={cn('size-9', !m.active && 'opacity-50')}>
                        <AvatarFallback className="bg-secondary text-xs font-semibold text-primary">{initials(m.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium" data-testid={`text-member-name-${m.id}`}>{m.name}</span>
                          {self && <span className="rounded border px-1.5 text-[0.68rem] text-muted-foreground">{t('acct.members.you')}</span>}
                        </div>
                        <div className="truncate text-sm text-muted-foreground" dir="ltr" data-testid={`text-member-email-${m.id}`}>{m.email}</div>
                      </div>
                    </div>
                    <Select
                      value={m.role}
                      disabled={!m.active || busy}
                      onValueChange={(role) => role !== m.role && setPending({ kind: 'role', member: m, role: role as MemberRole })}
                    >
                      <SelectTrigger className="h-11" aria-label={t('acct.members.changeRole', { name: m.name })} data-testid={`select-member-role-${m.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r} data-testid={`option-role-${r}-${m.id}`}>{t(`roles.${r}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-sm">
                      <div className={cn('flex items-center gap-1.5 font-medium', m.active ? 'text-status-green' : 'text-muted-foreground')} data-testid={`status-member-${m.id}`}>
                        {m.active ? <CircleDot className="size-3.5" aria-hidden="true" /> : <CircleSlash className="size-3.5" aria-hidden="true" />}
                        {m.active ? t('acct.members.active') : t('acct.members.inactive')}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground" data-testid={`text-member-lastlogin-${m.id}`}>
                        {t('acct.members.lastLogin')}: {m.lastLogin ? formatDate(m.lastLogin, language) : t('acct.members.never')}
                      </div>
                      <div className="num mt-0.5 text-xs text-muted-foreground" style={{ direction: 'inherit' }} data-testid={`text-member-logins-${m.id}`}>
                        {t('acct.members.loginsDetail', { ok: m.loginSuccessCount, fail: m.loginFailureCount })}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className={cn('min-h-11', m.active && 'text-status-red')}
                      disabled={busy}
                      onClick={() => setPending({ kind: 'active', member: m, active: !m.active })}
                      data-testid={`button-member-${m.active ? 'deactivate' : 'reactivate'}-${m.id}`}
                    >
                      {m.active ? t('acct.members.deactivate') : t('acct.members.reactivate')}
                    </Button>
                  </li>
                );
              })}
            </ul>
            <Pager page={mPage} total={members.data.total} perPage={PER_PAGE} onPage={setMPage} testId="members-page" />
          </>
        )}
      </Panel>

      <Panel
        testId="panel-invitations"
        title={t('acct.inv.title')}
        meta={invites.data ? t('acct.inv.count', { n: invites.data.total }) : undefined}
      >
        {invites.isLoading ? (
          <RowsSkeleton rows={2} />
        ) : invites.isError ? (
          <InlineError message={t('acct.inv.loadError')} onRetry={() => invites.refetch()} testId="error-invitations" />
        ) : !invites.data?.items.length ? (
          <InlineEmpty icon={MailPlus} title={t('acct.inv.emptyTitle')} body={t('acct.inv.emptyBody')} testId="empty-invitations" />
        ) : (
          <>
            <ul className="divide-y">
              {invites.data.items.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5" data-testid={`row-invitation-${inv.id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium" dir="ltr" data-testid={`text-invitation-email-${inv.id}`}>{inv.email}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span>{t(`roles.${inv.role}`)}</span>
                      <span>{t('acct.inv.created', { date: formatDate(inv.createdAt, language, false) })}</span>
                      <span>{t('acct.inv.expires', { date: formatDate(inv.expiresAt, language) })}</span>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
                      inv.status === 'pending' ? 'text-primary' : 'text-status-amber',
                    )}
                    data-testid={`status-invitation-${inv.id}`}
                  >
                    {inv.status === 'pending' ? <Clock className="size-3" aria-hidden="true" /> : <CircleSlash className="size-3" aria-hidden="true" />}
                    {t(`acct.inv.${inv.status}`)}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" className="min-h-11 gap-1.5" disabled={busy} onClick={() => setPending({ kind: 'reissue', inv })} data-testid={`button-reissue-invitation-${inv.id}`}>
                      <RefreshCw className="size-4" aria-hidden="true" />
                      {t('acct.inv.reissue')}
                    </Button>
                    <Button variant="outline" className="min-h-11 gap-1.5 text-status-red" disabled={busy} onClick={() => setPending({ kind: 'revoke', inv })} data-testid={`button-revoke-invitation-${inv.id}`}>
                      <Trash2 className="size-4" aria-hidden="true" />
                      {t('acct.inv.revoke')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <Pager page={iPage} total={invites.data.total} perPage={PER_PAGE} onPage={setIPage} testId="invitations-page" />
          </>
        )}
      </Panel>

      <Panel testId="panel-audit" title={t('acct.audit.title')} lead={t('acct.audit.lead')}>
        {audit.isLoading ? (
          <RowsSkeleton rows={3} />
        ) : audit.isError ? (
          <InlineError message={t('acct.audit.loadError')} onRetry={() => audit.refetch()} testId="error-audit" />
        ) : !auditItems.length ? (
          <InlineEmpty icon={History} title={t('acct.audit.emptyTitle')} body={t('acct.audit.emptyBody')} testId="empty-audit" />
        ) : (
          <>
            <ol className="divide-y">
              {auditSlice.map((a) => {
                const failure = a.action === 'login_failure';
                return (
                  <li key={a.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4 sm:px-5" data-testid={`row-audit-${a.id}`}>
                    <time className="text-xs text-muted-foreground sm:pt-0.5" dateTime={a.createdAt}>{formatDate(a.createdAt, language)}</time>
                    <div className="text-sm">
                      <span className={cn('font-medium', failure && 'text-status-red')} data-testid={`text-audit-action-${a.id}`}>
                        {t(`acct.audit.actions.${a.action}`, { defaultValue: a.action })}
                      </span>
                      {a.role && <span className="text-muted-foreground"> {t('acct.audit.roleTo', { role: t(`roles.${a.role}`, { defaultValue: a.role }) })}</span>}
                      {a.count > 1 && <span className="ms-2 rounded border px-1.5 text-xs text-muted-foreground">{t('acct.audit.count', { n: a.count })}</span>}
                      <div className="text-xs text-muted-foreground">
                        {a.actorName ?? t('acct.audit.system')}
                        {a.subjectName && a.subjectName !== a.actorName ? ` → ${a.subjectName}` : ''}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            <Pager page={aPage} total={auditItems.length} perPage={AUDIT_PER_PAGE} onPage={setAPage} testId="audit-page" />
          </>
        )}
      </Panel>

      <InviteDialog
        open={inviteOpen}
        session={session}
        onClose={() => setInviteOpen(false)}
        onCreated={(res) => {
          setInviteOpen(false);
          setLink(res);
          refreshAll();
        }}
        onUnauthorized={() => {
          endLocalSession(qc);
          navigate('/login');
        }}
      />
      <LinkDialog link={link} onClose={() => setLink(null)} />
      <ConfirmDialog pending={pending} busy={busy} session={session} onCancel={() => !busy && setPending(null)} onConfirm={confirmPending} />
    </div>
  );
}

function ConfirmDialog({
  pending,
  busy,
  session,
  onCancel,
  onConfirm,
}: {
  pending: Pending | null;
  busy: boolean;
  session: Session;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  let title = '';
  let body = '';
  let danger = false;
  if (pending?.kind === 'role') {
    title = t('acct.members.confirmRoleTitle');
    body = t('acct.members.confirmRoleBody', { name: pending.member.name, role: t(`roles.${pending.role}`) });
  } else if (pending?.kind === 'active') {
    const self = pending.member.id === session.user?.id || pending.member.email === session.user?.email;
    if (pending.active) {
      title = t('acct.members.confirmReactivateTitle', { name: pending.member.name });
      body = t('acct.members.confirmReactivateBody');
    } else {
      danger = true;
      title = t('acct.members.confirmDeactivateTitle', { name: pending.member.name });
      body = self ? t('acct.members.confirmDeactivateSelf') : t('acct.members.confirmDeactivateBody');
    }
  } else if (pending?.kind === 'revoke') {
    danger = true;
    title = t('acct.inv.revokeTitle');
    body = t('acct.inv.revokeBody', { email: pending.inv.email });
  } else if (pending?.kind === 'reissue') {
    title = t('acct.inv.reissueTitle');
    body = t('acct.inv.reissueBody', { email: pending.inv.email });
  }
  return (
    <AlertDialog open={!!pending} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent data-testid="dialog-confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11" disabled={busy} data-testid="button-confirm-cancel">{t('acct.members.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            className={cn('min-h-11', danger && 'bg-destructive text-destructive-foreground hover:bg-destructive/90')}
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            data-testid="button-confirm-action"
          >
            {t('acct.members.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function InviteDialog({
  open,
  session,
  onClose,
  onCreated,
  onUnauthorized,
}: {
  open: boolean;
  session: Session;
  onClose: () => void;
  onCreated: (l: InvitationLink) => void;
  onUnauthorized: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateInvitation({ request: { credentials: 'include', headers: { 'X-CSRF-Token': session.csrfToken } }, mutation: { gcTime: 0 } });
  const schema = z.object({
    email: z.string().trim().min(1, t('acct.inv.emailInvalid')).max(254).email(t('acct.inv.emailInvalid')),
    role: z.enum(['factory_manager', 'analyst', 'viewer']),
  });
  type V = z.infer<typeof schema>;
  const form = useForm<V>({ resolver: zodResolver(schema), defaultValues: { email: '', role: 'viewer' } });
  const resetRef = useRef(create.reset);
  resetRef.current = create.reset;

  useEffect(() => {
    if (!open) {
      form.reset({ email: '', role: 'viewer' });
      resetRef.current();
    }
  }, [open, form]);

  const submit = (v: V) =>
    create.mutate(
      { data: { email: v.email, role: v.role } },
      {
        onSuccess: (res) => {
          onCreated(res);
          resetRef.current();
        },
        onError: (e) => {
          if (errorStatus(e) === 401) onUnauthorized();
        },
      },
    );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !create.isPending && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-invite">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MailPlus className="size-5 text-primary" aria-hidden="true" />
            {t('acct.inv.dialogTitle')}
          </DialogTitle>
          <DialogDescription>{t('acct.inv.dialogBody')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('acct.inv.emailLabel')}</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" dir="ltr" autoComplete="off" className="h-11" maxLength={254} data-testid="input-invite-email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('acct.inv.roleLabel')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="h-11" data-testid="select-invite-role">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r} data-testid={`option-invite-role-${r}`}>{t(`roles.${r}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {create.isError && errorStatus(create.error) !== 401 && (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-status-red" data-testid="error-invite">
                {localizeError(t, create.error)}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" className="min-h-11" onClick={onClose} disabled={create.isPending} data-testid="button-invite-cancel">
                {t('acct.members.cancel')}
              </Button>
              <Button type="submit" className="min-h-11 gap-2" disabled={create.isPending} data-testid="button-invite-submit">
                <Link2 className="size-4" aria-hidden="true" />
                {create.isPending ? t('acct.inv.creating') : t('acct.inv.create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function LinkDialog({ link, onClose }: { link: InvitationLink | null; onClose: () => void }) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const url = link ? absoluteInviteUrl(link.path) : '';

  useEffect(() => {
    if (!link) setState('idle');
  }, [link]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
    } catch {
      setState('failed');
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  return (
    <Dialog open={!!link} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-invite-link">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
            {t('acct.inv.linkTitle')}
          </DialogTitle>
          <DialogDescription>{t('acct.inv.linkBody')}</DialogDescription>
        </DialogHeader>
        {link && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground" data-testid="text-invite-link-for">
              {t('acct.inv.linkFor', { email: link.invitation.email, role: t(`roles.${link.invitation.role}`) })}
            </p>
            <div className="ledger-grid rounded-lg border bg-background p-2">
              <Input
                ref={inputRef}
                readOnly
                value={url}
                dir="ltr"
                onFocus={(e) => e.currentTarget.select()}
                aria-label={t('acct.inv.linkTitle')}
                className="h-11 bg-card font-mono text-xs"
                data-testid="input-invite-link"
              />
            </div>
            <div aria-live="polite" className="min-h-5 text-sm" data-testid="status-copy">
              {state === 'copied' && (
                <span className="flex items-center gap-1.5 text-status-green">
                  <Check className="size-4" aria-hidden="true" />
                  {t('acct.inv.copied')}
                </span>
              )}
              {state === 'failed' && <span className="text-status-amber">{t('acct.inv.copyFailed')}</span>}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" className="min-h-11 gap-2" onClick={copy} data-testid="button-copy-invite-link">
            <Copy className="size-4" aria-hidden="true" />
            {t('acct.inv.copy')}
          </Button>
          <Button className="min-h-11" onClick={onClose} data-testid="button-invite-link-done">
            {t('acct.inv.done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
