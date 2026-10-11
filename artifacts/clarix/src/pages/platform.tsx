import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Building2, FlaskConical, Check, Copy, Gauge, KeyRound, Link2Off, Pause, Play, Plus, RefreshCcw, ShieldCheck, ShieldHalf } from 'lucide-react';
import {
  getGetPlatformAuditQueryKey,
  getGetPlatformFactoriesQueryKey,
  useCreatePlatformFactory,
  useGetPlatformAudit,
  useGetPlatformFactories,
  useManagePlatformInvitation,
  useUpdatePlatformFactory,
  type PlatformFactory,
} from '@workspace/api-client-react';
import { PageHeader } from '@/components/empty-page';
import { DemoFactoryDialog } from '@/components/platform/demo-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { absoluteInviteUrl, formatDate, InlineEmpty, InlineError, Pager, Panel, RowsSkeleton } from '@/components/accounts/shared';
import { AuditPanel, PER_PAGE } from '@/components/management/audit-list';
import { useToast } from '@/hooks/use-toast';
import { localizeError, useCsrfRequest, usePrefs } from '@/lib/session';
import { cn } from '@/lib/utils';

type OneShot = { factory: string; path: string; expiresAt: string | null };

function bytes(n: number, lang: string) {
  const f = new Intl.NumberFormat(lang === 'ar' ? 'ar' : 'en', { maximumFractionDigits: 1, numberingSystem: 'latn' });
  if (n >= 1_000_000) return `${f.format(n / 1_000_000)} MB`;
  if (n >= 1000) return `${f.format(n / 1000)} KB`;
  return `${f.format(n)} B`;
}
const num = (n: number, lang: string) => new Intl.NumberFormat(lang === 'ar' ? 'ar' : 'en', { numberingSystem: 'latn' }).format(n);

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: getGetPlatformFactoriesQueryKey() });
    qc.invalidateQueries({ queryKey: getGetPlatformAuditQueryKey() });
  };
}

function ErrorLine({ err }: { err: unknown }) {
  const { t } = useTranslation();
  if (!err) return null;
  return (
    <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-status-red" data-testid="error-platform-action">
      {localizeError(t, err)}
    </p>
  );
}

function StatusBadge({ status }: { status: PlatformFactory['status'] }) {
  const { t } = useTranslation();
  const Icon = status === 'active' ? Play : Pause;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        status === 'active' ? 'border-status-green/40 text-status-green' : 'border-status-amber/40 text-status-amber',
      )}
      data-testid="status-factory"
    >
      <Icon className="size-3" aria-hidden="true" />
      {t(`p13.plat.status.${status}`)}
    </span>
  );
}

function Meter({ label, value, ratio, testId }: { label: string; value: string; ratio?: number; testId: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="num mt-0.5 text-sm font-medium" data-testid={testId}>{value}</p>
      {ratio !== undefined && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div
            className={cn('h-full origin-left rounded-full', ratio >= 1 ? 'bg-status-red' : ratio >= 0.8 ? 'bg-status-amber' : 'bg-primary')}
            style={{ transform: `scaleX(${Math.min(1, Math.max(0.02, ratio))})` }}
          />
        </div>
      )}
    </div>
  );
}

function FactoryRow({
  f,
  onLimits,
  onStatus,
  onInvitation,
}: {
  f: PlatformFactory;
  onLimits: () => void;
  onStatus: () => void;
  onInvitation: (a: 'reissue' | 'revoke') => void;
}) {
  const { t } = useTranslation();
  const { language } = usePrefs();
  const canInvite = f.managers === 0 && f.status === 'active';
  return (
    <li className="grid gap-4 px-4 py-4 sm:px-5" data-testid={`row-factory-${f.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold" data-testid={`text-factory-name-${f.id}`}>{f.name}</h3>
            <StatusBadge status={f.status} />
            {f.demo && <span className="rounded border border-dashed px-1.5 py-0.5 text-[11px] font-bold tracking-wider" dir="ltr" data-testid={`badge-demo-${f.id}`}>{t('p19.demo.badge')}</span>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('p13.plat.slug')} <span className="font-mono" dir="ltr">{f.slug}</span> · {t(`p13.plat.lang.${f.defaultLanguage}`)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11 gap-2" onClick={onLimits} data-testid={`button-limits-${f.id}`}>
            <Gauge className="size-4" aria-hidden="true" />
            {t('p13.plat.limits.edit')}
          </Button>
          <Button
            variant="outline"
            className={cn('min-h-11 gap-2', f.status === 'active' && 'text-status-red')}
            onClick={onStatus}
            data-testid={`button-${f.status === 'active' ? 'suspend' : 'reactivate'}-${f.id}`}
          >
            {f.status === 'active' ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
            {f.status === 'active' ? t('p13.plat.suspend') : t('p13.plat.reactivate')}
          </Button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
        {[
          { k: 'created', v: f.createdAt ? formatDate(f.createdAt, language, false) : t('p13.plat.legacy') },
          { k: 'members', v: num(f.activeMembers, language) },
          { k: 'managers', v: num(f.managers, language) },
          { k: 'lastApproved', v: f.lastApprovedAt ? formatDate(f.lastApprovedAt, language, false) : t('p13.common.never') },
        ].map((x) => (
          <div key={x.k}>
            <dt className="text-xs text-muted-foreground">{t(`p13.plat.${x.k}`)}</dt>
            <dd className="num mt-0.5 text-sm font-medium" data-testid={`text-${x.k}-${f.id}`}>{x.v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-3 rounded-lg border bg-background p-3 md:grid-cols-3">
        <Meter
          label={t('p13.plat.limits.maxMembers')}
          value={t('p13.plat.limits.usageMembers', { used: num(f.activeMembers, language), max: num(f.limits.maxMembers, language) })}
          ratio={f.activeMembers / f.limits.maxMembers}
          testId={`text-usage-members-${f.id}`}
        />
        <Meter
          label={`${t('p13.plat.limits.maxFileBytes')}: ${bytes(f.limits.maxFileBytes, language)}`}
          value={t('p13.plat.limits.usageLargest', { used: bytes(f.uploadBytesUsage, language) })}
          ratio={f.uploadBytesUsage / f.limits.maxFileBytes}
          testId={`text-usage-bytes-${f.id}`}
        />
        <Meter
          label={`${t('p13.plat.limits.maxRows')}: ${num(f.limits.maxRows, language)}`}
          value={t('p13.plat.limits.usageLargest', { used: num(f.rowsUsage, language) })}
          ratio={f.rowsUsage / f.limits.maxRows}
          testId={`text-usage-rows-${f.id}`}
        />
        <p className="text-xs text-muted-foreground md:col-span-3">{t('p13.plat.limits.usageNote')}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm">
          <KeyRound className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-muted-foreground">{t('p13.plat.inv.label')}:</span>
          <span className="font-medium" data-testid={`status-invitation-${f.id}`}>{t(`p13.plat.inv.${f.invitationStatus}`)}</span>
        </p>
        {canInvite ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="min-h-11 gap-2" onClick={() => onInvitation('reissue')} data-testid={`button-reissue-${f.id}`}>
              <RefreshCcw className="size-4" aria-hidden="true" />
              {t('p13.plat.inv.reissue')}
            </Button>
            {f.invitationStatus === 'pending' && (
              <Button variant="ghost" className="min-h-11 gap-2 text-status-red" onClick={() => onInvitation('revoke')} data-testid={`button-revoke-${f.id}`}>
                <Link2Off className="size-4" aria-hidden="true" />
                {t('p13.plat.inv.revoke')}
              </Button>
            )}
          </div>
        ) : (
          f.managers === 0 || <p className="text-xs text-muted-foreground">{t('p13.plat.inv.onlyNoManager')}</p>
        )}
      </div>
    </li>
  );
}

function CreateDialog({ open, onClose, onLink }: { open: boolean; onClose: () => void; onLink: (l: OneShot) => void }) {
  const { t } = useTranslation();
  const { language } = usePrefs();
  const { toast } = useToast();
  const request = useCsrfRequest();
  const invalidate = useInvalidate();
  const create = useCreatePlatformFactory({ mutation: { gcTime: 0 }, request });
  const [v, setV] = useState({ name: '', slug: '', lang: language as 'en' | 'ar', email: '' });
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) {
      setV({ name: '', slug: '', lang: language as 'en' | 'ar', email: '' });
      setTouched(false);
      create.reset();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const errs = {
    name: !v.name.trim() ? t('p13.plat.create.nameRequired') : Array.from(v.name.trim()).length > 160 ? t('p13.plat.create.nameMax') : '',
    slug: /^[a-z][a-z0-9-]{0,99}$/.test(v.slug) ? '' : t('p13.plat.create.slugInvalid'),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim()) && v.email.trim().length <= 254 ? '' : t('p13.plat.create.emailInvalid'),
  };
  const invalid = Object.values(errs).some(Boolean);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (invalid) return;
    create.mutate(
      { data: { name: v.name.trim(), slug: v.slug, defaultLanguage: v.lang, managerEmail: v.email.trim() } },
      {
        onSuccess: (res) => {
          if (res.path) onLink({ factory: res.factory.name, path: res.path, expiresAt: res.expiresAt });
          create.reset();
          invalidate();
          toast({ description: t('p13.plat.create.done') });
          onClose();
        },
      },
    );
  };

  const field = (id: 'name' | 'slug' | 'email', label: string, extra: Record<string, unknown> = {}, hint?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`pf-${id}`}>{label}</Label>
      <Input
        id={`pf-${id}`}
        value={v[id]}
        onChange={(e) => setV((s) => ({ ...s, [id]: id === 'slug' ? e.target.value.toLowerCase() : e.target.value }))}
        aria-invalid={touched && !!errs[id]}
        aria-describedby={`pf-${id}-msg`}
        className="h-11"
        data-testid={`input-factory-${id}`}
        {...extra}
      />
      <p id={`pf-${id}-msg`} className={cn('text-xs', touched && errs[id] ? 'text-status-red' : 'text-muted-foreground')}>
        {touched && errs[id] ? errs[id] : hint}
      </p>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" data-testid="dialog-create-factory">
        <DialogHeader>
          <DialogTitle>{t('p13.plat.create.title')}</DialogTitle>
          <DialogDescription>{t('p13.plat.create.body')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" noValidate>
          {field('name', t('p13.plat.create.name'), { maxLength: 200, autoComplete: 'off' })}
          {field('slug', t('p13.plat.create.slug'), { dir: 'ltr', maxLength: 100, autoComplete: 'off', spellCheck: false, className: 'h-11 font-mono' }, t('p13.plat.create.slugHint'))}
          <div className="space-y-1.5">
            <Label htmlFor="pf-lang">{t('p13.plat.create.language')}</Label>
            <Select value={v.lang} onValueChange={(x) => setV((s) => ({ ...s, lang: x as 'en' | 'ar' }))}>
              <SelectTrigger id="pf-lang" className="h-11" data-testid="select-factory-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ar">{t('p13.plat.lang.ar')}</SelectItem>
                <SelectItem value="en">{t('p13.plat.lang.en')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {field('email', t('p13.plat.create.email'), { type: 'email', dir: 'ltr', autoComplete: 'off', maxLength: 254 })}
          <ErrorLine err={create.error} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={onClose} data-testid="button-cancel-create">
              {t('p13.common.cancel')}
            </Button>
            <Button type="submit" className="min-h-11 gap-2" disabled={create.isPending} data-testid="button-submit-create">
              <Plus className="size-4" aria-hidden="true" />
              {create.isPending ? t('p13.common.saving') : t('p13.plat.create.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LimitsDialog({ factory, onClose }: { factory: PlatformFactory | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const request = useCsrfRequest();
  const invalidate = useInvalidate();
  const update = useUpdatePlatformFactory({ mutation: { gcTime: 0 }, request });
  const [v, setV] = useState({ m: '', mb: '', r: '' });

  useEffect(() => {
    update.reset();
    if (factory) setV({ m: String(factory.limits.maxMembers), mb: String(+(factory.limits.maxFileBytes / 1_000_000).toFixed(2)), r: String(factory.limits.maxRows) });
  }, [factory?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = Number(v.m), mb = Number(v.mb), r = Number(v.r);
  const errs = {
    m: Number.isInteger(m) && m >= 1 && m <= 10000 ? '' : t('p13.plat.limits.rangeMembers'),
    mb: Number.isFinite(mb) && mb >= 0.01 && mb <= 20 ? '' : t('p13.plat.limits.rangeMb'),
    r: Number.isInteger(r) && r >= 1 && r <= 100000 ? '' : t('p13.plat.limits.rangeRows'),
  };
  const invalid = Object.values(errs).some(Boolean);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!factory || invalid) return;
    update.mutate(
      { id: factory.id, data: { limits: { maxMembers: m, maxFileBytes: Math.max(1024, Math.round(mb * 1_000_000)), maxRows: r } } },
      {
        onSuccess: () => {
          update.reset();
          invalidate();
          toast({ description: t('p13.plat.limits.saved') });
          onClose();
        },
      },
    );
  };

  const fields: { k: 'm' | 'mb' | 'r'; label: string; step: string }[] = [
    { k: 'm', label: t('p13.plat.limits.maxMembers'), step: '1' },
    { k: 'mb', label: t('p13.plat.limits.maxFileMb'), step: '0.01' },
    { k: 'r', label: t('p13.plat.limits.maxRows'), step: '1' },
  ];

  return (
    <Dialog open={!!factory} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-limits">
        <DialogHeader>
          <DialogTitle>{t('p13.plat.limits.dialogTitle', { name: factory?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('p13.plat.limits.dialogBody')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" noValidate>
          {fields.map((f) => (
            <div key={f.k} className="space-y-1.5">
              <Label htmlFor={`lim-${f.k}`}>{f.label}</Label>
              <Input
                id={`lim-${f.k}`}
                type="number"
                inputMode="decimal"
                step={f.step}
                dir="ltr"
                value={v[f.k]}
                onChange={(e) => setV((s) => ({ ...s, [f.k]: e.target.value }))}
                aria-invalid={!!errs[f.k]}
                className="num h-11"
                data-testid={`input-limit-${f.k}`}
              />
              {errs[f.k] && <p className="text-xs text-status-red">{errs[f.k]}</p>}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{t('p13.plat.limits.usageNote')}</p>
          <ErrorLine err={update.error} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={onClose} data-testid="button-cancel-limits">{t('p13.common.cancel')}</Button>
            <Button type="submit" className="min-h-11" disabled={invalid || update.isPending} data-testid="button-save-limits">
              {update.isPending ? t('p13.common.saving') : t('p13.common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LinkDialog({ link, onClose }: { link: OneShot | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { language } = usePrefs();
  const ref = useRef<HTMLInputElement>(null);
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
      ref.current?.focus();
      ref.current?.select();
    }
  };
  return (
    <Dialog open={!!link} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-platform-link">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
            {t('p13.plat.link.title')}
          </DialogTitle>
          <DialogDescription>{t('p13.plat.link.body')}</DialogDescription>
        </DialogHeader>
        {link && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground" data-testid="text-platform-link-for">
              {t('p13.plat.link.for', { factory: link.factory })}
              {link.expiresAt && <> · {t('p13.plat.link.expires', { date: formatDate(link.expiresAt, language) })}</>}
            </p>
            <div className="ledger-grid rounded-lg border bg-background p-2">
              <Input
                ref={ref}
                readOnly
                value={url}
                dir="ltr"
                onFocus={(e) => e.currentTarget.select()}
                aria-label={t('p13.plat.link.title')}
                className="h-11 bg-card font-mono text-xs"
                data-testid="input-platform-link"
              />
            </div>
            <div aria-live="polite" className="min-h-5 text-sm" data-testid="status-platform-copy">
              {state === 'copied' && (
                <span className="flex items-center gap-1.5 text-status-green">
                  <Check className="size-4" aria-hidden="true" />
                  {t('p13.plat.link.copied')}
                </span>
              )}
              {state === 'failed' && <span className="text-status-amber">{t('p13.plat.link.copyFailed')}</span>}
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11 gap-2" onClick={copy} data-testid="button-copy-platform-link">
            <Copy className="size-4" aria-hidden="true" />
            {t('p13.plat.link.copy')}
          </Button>
          <Button className="min-h-11" onClick={onClose} data-testid="button-close-platform-link">{t('p13.common.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Confirm = { kind: 'status' | 'revoke'; f: PlatformFactory } | null;

export default function PlatformPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const request = useCsrfRequest();
  const invalidate = useInvalidate();
  const [page, setPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [limitsFor, setLimitsFor] = useState<PlatformFactory | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [link, setLink] = useState<OneShot | null>(null);

  const list = useGetPlatformFactories({ page }, { query: { queryKey: getGetPlatformFactoriesQueryKey({ page }) }, request: { credentials: 'include' } });
  const audit = useGetPlatformAudit({ page: auditPage }, { query: { queryKey: getGetPlatformAuditQueryKey({ page: auditPage }) }, request: { credentials: 'include' } });
  const update = useUpdatePlatformFactory({ mutation: { gcTime: 0 }, request });
  const inv = useManagePlatformInvitation({ mutation: { gcTime: 0 }, request });

  useEffect(() => () => setLink(null), []);

  const runInvitation = (f: PlatformFactory, action: 'reissue' | 'revoke') =>
    inv.mutate(
      { id: f.id, data: { action } },
      {
        onSuccess: (res) => {
          if (action === 'reissue' && res.path) setLink({ factory: res.factory.name, path: res.path, expiresAt: res.expiresAt });
          inv.reset();
          invalidate();
          setConfirm(null);
          toast({ description: t(action === 'reissue' ? 'p13.plat.inv.reissueDone' : 'p13.plat.inv.revokeDone') });
        },
        onError: (e) => toast({ variant: 'destructive', description: localizeError(t, e) }),
      },
    );

  const runStatus = (f: PlatformFactory) => {
    const next = f.status === 'active' ? 'suspended' : 'active';
    update.mutate(
      { id: f.id, data: { status: next } },
      {
        onSuccess: () => {
          update.reset();
          invalidate();
          setConfirm(null);
          toast({ description: t(next === 'suspended' ? 'p13.plat.suspended' : 'p13.plat.reactivated') });
        },
      },
    );
  };

  const d = list.data;
  const c = confirm;
  const suspending = c?.kind === 'status' && c.f.status === 'active';
  const pending = update.isPending || inv.isPending;

  return (
    <div data-testid="page-platform" className="space-y-6">
      <PageHeader icon={ShieldHalf} title={t('p13.plat.title')} lead={t('p13.plat.lead')} meta={t('p13.plat.note')} />

      <Panel
        title={t('p13.plat.factories')}
        meta={d ? t('p13.plat.count', { count: d.total }) : undefined}
        testId="panel-factories"
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="min-h-11 gap-2" onClick={() => setCreatingDemo(true)} data-testid="button-add-demo-factory">
              <FlaskConical className="size-4" aria-hidden="true" />
              {t('p19.demo.add')}
            </Button>
            <Button className="min-h-11 gap-2" onClick={() => setCreating(true)} data-testid="button-add-factory">
              <Plus className="size-4" aria-hidden="true" />
              {t('p13.plat.add')}
            </Button>
          </div>
        }
      >
        {list.isLoading ? (
          <RowsSkeleton rows={3} />
        ) : list.isError ? (
          <InlineError message={`${t('p13.plat.loadError')} ${localizeError(t, list.error)}`} onRetry={() => list.refetch()} testId="error-factories" />
        ) : !d || d.items.length === 0 ? (
          <InlineEmpty icon={Building2} title={t('p13.plat.emptyTitle')} body={t('p13.plat.emptyBody')} testId="empty-factories" />
        ) : (
          <>
            <ul className="divide-y">
              {d.items.map((f) => (
                <FactoryRow
                  key={f.id}
                  f={f}
                  onLimits={() => setLimitsFor(f)}
                  onStatus={() => {
                    update.reset();
                    setConfirm({ kind: 'status', f });
                  }}
                  onInvitation={(a) => (a === 'revoke' ? setConfirm({ kind: 'revoke', f }) : runInvitation(f, 'reissue'))}
                />
              ))}
            </ul>
            <Pager page={page} total={d.total} perPage={PER_PAGE} onPage={setPage} testId="factories-pager" />
          </>
        )}
      </Panel>

      <AuditPanel
        title={t('p13.plat.audit.title')}
        lead={t('p13.plat.audit.lead')}
        emptyTitle={t('p13.plat.audit.empty')}
        emptyBody={t('p13.plat.audit.emptyBody')}
        errorText={t('p13.plat.audit.error')}
        query={audit}
        page={auditPage}
        onPage={setAuditPage}
        testId="panel-platform-audit"
      />

      <CreateDialog open={creating} onClose={() => setCreating(false)} onLink={setLink} />
      <DemoFactoryDialog open={creatingDemo} onClose={() => setCreatingDemo(false)} onLink={setLink} onCreated={invalidate} />
      <LimitsDialog factory={limitsFor} onClose={() => setLimitsFor(null)} />
      <LinkDialog link={link} onClose={() => setLink(null)} />

      <AlertDialog open={!!c} onOpenChange={(o) => !o && !pending && setConfirm(null)}>
        <AlertDialogContent data-testid="dialog-confirm-platform">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {c?.kind === 'revoke' ? t('p13.plat.inv.revokeTitle') : suspending ? t('p13.plat.suspendTitle', { name: c?.f.name }) : t('p13.plat.reactivateTitle', { name: c?.f.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {c?.kind === 'revoke' ? t('p13.plat.inv.revokeBody') : suspending ? t('p13.plat.suspendBody') : t('p13.plat.reactivateBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ErrorLine err={update.error} />
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="min-h-11" disabled={pending} data-testid="button-cancel-confirm">{t('p13.common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className={cn('min-h-11', (suspending || c?.kind === 'revoke') && 'bg-destructive text-destructive-foreground hover:bg-destructive/90')}
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                if (!c) return;
                if (c.kind === 'revoke') runInvitation(c.f, 'revoke');
                else runStatus(c.f);
              }}
              data-testid="button-confirm-platform"
            >
              {pending ? t('p13.common.saving') : c?.kind === 'revoke' ? t('p13.plat.inv.revoke') : suspending ? t('p13.plat.suspendConfirm') : t('p13.plat.reactivate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
