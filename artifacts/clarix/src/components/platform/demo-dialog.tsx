import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FlaskConical } from 'lucide-react';
import { useCreateDemoFactory } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { localizeError, useCsrfRequest, usePrefs } from '@/lib/session';
import { cn } from '@/lib/utils';
import '@/lib/phase19-i18n';

type Link = { factory: string; path: string; expiresAt: string | null };

export function DemoFactoryDialog({ open, onClose, onLink, onCreated }: { open: boolean; onClose: () => void; onLink: (l: Link) => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const { language } = usePrefs();
  const { toast } = useToast();
  const request = useCsrfRequest();
  const create = useCreateDemoFactory({ mutation: { gcTime: 0 }, request });
  const [v, setV] = useState({ name: '', lang: language as 'en' | 'ar', email: '', ok: false });
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) { setV({ name: '', lang: language as 'en' | 'ar', email: '', ok: false }); setTouched(false); create.reset(); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const email = v.email.trim();
  const errs = {
    name: !v.name.trim() ? t('p13.plat.create.nameRequired') : Array.from(v.name.trim()).length > 160 ? t('p13.plat.create.nameMax') : '',
    email: !email || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254) ? '' : t('p13.plat.create.emailInvalid'),
    ok: v.ok ? '' : t('p19.demo.confirmRequired'),
  };
  const invalid = Object.values(errs).some(Boolean);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (invalid || create.isPending) return;
    create.mutate({ data: { name: v.name.trim(), defaultLanguage: v.lang, ...(email ? { managerEmail: email } : {}) } }, {
      onSuccess: (res) => {
        if (res.path) onLink({ factory: res.factory.name, path: res.path, expiresAt: res.expiresAt });
        onCreated();
        toast({ description: t('p19.demo.done') });
        onClose();
      },
    });
  };

  const msg = (k: 'name' | 'email' | 'ok', hint?: string) => (
    <p id={`demo-${k}-msg`} className={cn('text-xs', touched && errs[k] ? 'text-status-red' : 'text-muted-foreground')}>{touched && errs[k] ? errs[k] : hint}</p>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !create.isPending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" data-testid="dialog-create-demo">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FlaskConical className="size-5 text-primary" aria-hidden="true" />{t('p19.demo.title')}</DialogTitle>
          <DialogDescription>{t('p19.demo.body')}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5 rounded-lg border border-dashed bg-muted p-3 text-sm" data-testid="list-demo-facts">
          {(['facts1', 'facts2', 'facts3'] as const).map((k) => <li key={k} className="ps-1">{t(`p19.demo.${k}`)}</li>)}
        </ul>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="demo-name">{t('p13.plat.create.name')}</Label>
            <Input id="demo-name" value={v.name} onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))} maxLength={200} autoComplete="off"
              aria-invalid={touched && !!errs.name} aria-describedby="demo-name-msg" className="h-11" data-testid="input-demo-name" />
            {msg('name')}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="demo-lang">{t('p13.plat.create.language')}</Label>
            <Select value={v.lang} onValueChange={(x) => setV((s) => ({ ...s, lang: x as 'en' | 'ar' }))}>
              <SelectTrigger id="demo-lang" className="h-11" data-testid="select-demo-language"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ar">{t('p13.plat.lang.ar')}</SelectItem>
                <SelectItem value="en">{t('p13.plat.lang.en')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="demo-email">{t('p19.demo.emailOptional')}</Label>
            <Input id="demo-email" type="email" dir="ltr" value={v.email} onChange={(e) => setV((s) => ({ ...s, email: e.target.value }))} maxLength={254} autoComplete="off"
              aria-invalid={touched && !!errs.email} aria-describedby="demo-email-msg" className="h-11" data-testid="input-demo-email" />
            {msg('email', t('p19.demo.emailHint'))}
          </div>
          <div className="space-y-1">
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md py-2 text-sm">
              <Checkbox checked={v.ok} onCheckedChange={(c) => setV((s) => ({ ...s, ok: c === true }))} className="mt-0.5" aria-describedby="demo-ok-msg" data-testid="checkbox-demo-confirm" />
              <span>{t('p19.demo.confirm')}</span>
            </label>
            {touched && errs.ok && msg('ok')}
          </div>
          {create.error != null && <p role="alert" className="text-sm text-status-red [overflow-wrap:anywhere]" data-testid="error-create-demo">{localizeError(t, create.error)}</p>}
          {create.isPending && <p role="status" className="text-sm text-muted-foreground" data-testid="status-demo-working">{t('p19.demo.working')}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={onClose} disabled={create.isPending} data-testid="button-cancel-demo">{t('p13.common.cancel')}</Button>
            <Button type="submit" className="min-h-11 gap-2" disabled={create.isPending} data-testid="button-submit-demo">
              <FlaskConical className="size-4" aria-hidden="true" />{create.isPending ? t('p13.common.saving') : t('p19.demo.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DemoBanner() {
  const { t } = useTranslation();
  return (
    <div role="note" className="mb-6 flex items-start gap-2 rounded-lg border-2 border-dashed border-[color-mix(in_srgb,var(--status-amber)_55%,var(--border))] bg-[color-mix(in_srgb,var(--status-amber)_8%,var(--card))] px-3 py-2.5 text-sm" data-testid="banner-demo">
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-status-amber" aria-hidden="true" />
      <span className="min-w-0 [overflow-wrap:anywhere]"><strong className="me-1.5 rounded bg-foreground px-1.5 py-0.5 text-[11px] font-bold tracking-wider text-background" dir="ltr">{t('p19.demo.badge')}</strong>{t('p19.demo.banner')}</span>
    </div>
  );
}
