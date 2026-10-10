import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Info, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import {
  getGetFactorySettingsAuditQueryKey,
  getGetFactorySettingsQueryKey,
  getGetSessionQueryKey,
  useGetFactorySettings,
  useGetFactorySettingsAudit,
  useSaveFactorySettings,
  type FactoryPreferences,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InlineError, Panel, RowsSkeleton } from '@/components/accounts/shared';
import { AuditPanel } from '@/components/management/audit-list';
import { useToast } from '@/hooks/use-toast';
import { localizeError, useCsrfRequest } from '@/lib/session';
import { cn } from '@/lib/utils';

const BUILTIN = ['kg', 'kgs', 'g', 't', 'tonne', 'lb'];
const DEC = /^\d+(\.\d+)?$/;
type Row = { key: number; unit: string; factor: string };
type Draft = { name: string; defaultLanguage: 'en' | 'ar'; warningPercent: string; errorPercent: string; units: Row[] };

let seq = 0;
const toDraft = (p: FactoryPreferences): Draft => ({
  name: p.name,
  defaultLanguage: p.defaultLanguage,
  warningPercent: p.warningPercent,
  errorPercent: p.errorPercent,
  units: p.units.map((u) => ({ key: ++seq, unit: u.unit, factor: u.factor })),
});
const toBody = (d: Draft): FactoryPreferences => ({
  name: d.name.trim(),
  defaultLanguage: d.defaultLanguage,
  warningPercent: d.warningPercent.trim(),
  errorPercent: d.errorPercent.trim(),
  units: d.units.map((u) => ({ unit: u.unit.trim(), factor: u.factor.trim() })),
});

function validate(d: Draft, t: (k: string) => string) {
  const e: Record<string, string> = {};
  const n = Array.from(d.name.trim()).length;
  if (n < 1 || n > 160) e.name = t('p13.set.v.name');
  const pct = (s: string) => DEC.test(s.trim()) && Number(s) >= 0 && Number(s) <= 100;
  if (!pct(d.warningPercent)) e.warning = t('p13.set.v.pct');
  if (!pct(d.errorPercent)) e.error = t('p13.set.v.pct');
  if (!e.warning && !e.error && Number(d.warningPercent) >= Number(d.errorPercent)) e.warning = t('p13.set.v.order');
  if (d.units.length > 100) e.units = t('p13.set.v.max');
  const seen = new Set<string>();
  d.units.forEach((u) => {
    const name = u.unit.trim();
    const low = name.toLowerCase();
    if (!name || name.length > 32) e[`u${u.key}`] = t('p13.set.v.unit');
    else if (BUILTIN.includes(low)) e[`u${u.key}`] = t('p13.set.v.builtin');
    else if (seen.has(low)) e[`u${u.key}`] = t('p13.set.v.dup');
    seen.add(low);
    if (!DEC.test(u.factor.trim()) || Number(u.factor) <= 0 || u.factor.length > 80) e[`f${u.key}`] = t('p13.set.v.factor');
  });
  return e;
}

export function FactorySettings({ factoryId }: { factoryId: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const request = useCsrfRequest();
  const [auditPage, setAuditPage] = useState(1);
  const q = useGetFactorySettings({ query: { queryKey: getGetFactorySettingsQueryKey() }, request: { credentials: 'include' } });
  const audit = useGetFactorySettingsAudit(
    { page: auditPage },
    { query: { queryKey: getGetFactorySettingsAuditQueryKey({ page: auditPage }) }, request: { credentials: 'include' } },
  );
  const save = useSaveFactorySettings({ mutation: { gcTime: 0 }, request });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [touched, setTouched] = useState(false);
  const init = useRef<string | null>(null);
  const baseline = useRef('');

  useEffect(() => {
    if (q.data && init.current !== factoryId) {
      init.current = factoryId;
      setDraft(toDraft(q.data));
      baseline.current = JSON.stringify(toBody(toDraft(q.data)));
    }
  }, [q.data, factoryId]);

  if (q.isLoading || (!draft && !q.isError)) {
    return (
      <div className="mt-6 rounded-xl border bg-card" data-testid="state-settings-loading" aria-busy="true">
        <RowsSkeleton rows={5} />
      </div>
    );
  }
  if (q.isError || !draft) {
    return (
      <div className="mt-6 rounded-xl border bg-card">
        <InlineError message={`${t('p13.set.loadError')} ${localizeError(t, q.error)}`} onRetry={() => q.refetch()} testId="error-settings" />
      </div>
    );
  }

  const errs = validate(draft, t);
  const invalid = Object.keys(errs).length > 0;
  const dirty = JSON.stringify(toBody(draft)) !== baseline.current;
  const show = (k: string) => (touched ? errs[k] : undefined);
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setUnit = (key: number, patch: Partial<Row>) => set({ units: draft.units.map((u) => (u.key === key ? { ...u, ...patch } : u)) });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (invalid || !dirty) return;
    save.mutate(
      { data: toBody(draft) },
      {
        onSuccess: (next) => {
          save.reset();
          qc.setQueryData(getGetFactorySettingsQueryKey(), next);
          baseline.current = JSON.stringify(toBody(toDraft(next)));
          setDraft(toDraft(next));
          setTouched(false);
          qc.invalidateQueries({ queryKey: getGetFactorySettingsAuditQueryKey() });
          qc.invalidateQueries({ queryKey: getGetSessionQueryKey() });
          toast({ description: t('p13.set.saved') });
        },
      },
    );
  };

  const msg = (id: string, k: string) =>
    show(k) ? (
      <p id={id} className="text-xs text-status-red">{show(k)}</p>
    ) : null;

  return (
    <div className="mt-6 space-y-6" data-testid="section-factory-settings">
      <p className="flex items-start gap-2 rounded-lg border border-primary/30 bg-accent p-3 text-sm" role="note" data-testid="text-settings-future">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        {t('p13.set.future')}
      </p>

      <form onSubmit={submit} noValidate className="space-y-6">
        <Panel title={t('p13.set.general')} testId="panel-settings-general">
          <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fs-name">{t('p13.set.name')}</Label>
              <Input id="fs-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} maxLength={200} aria-invalid={!!show('name')} aria-describedby="fs-name-m" className="h-11" data-testid="input-settings-name" />
              {msg('fs-name-m', 'name')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fs-lang">{t('p13.set.language')}</Label>
              <Select value={draft.defaultLanguage} onValueChange={(v) => set({ defaultLanguage: v as 'en' | 'ar' })}>
                <SelectTrigger id="fs-lang" className="h-11" data-testid="select-settings-language"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ar">{t('p13.plat.lang.ar')}</SelectItem>
                  <SelectItem value="en">{t('p13.plat.lang.en')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Panel>

        <Panel title={t('p13.set.thresholds')} lead={t('p13.set.thresholdsLead')} testId="panel-settings-thresholds">
          <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-2">
            {([['warning', 'warningPercent', 'text-status-amber'], ['error', 'errorPercent', 'text-status-red']] as const).map(([k, f, tone]) => (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={`fs-${k}`} className="flex items-center gap-2">
                  <span className={cn('inline-block size-2 rounded-full bg-current', tone)} aria-hidden="true" />
                  {t(`p13.set.${k}`)}
                </Label>
                <Input id={`fs-${k}`} inputMode="decimal" dir="ltr" value={draft[f]} onChange={(e) => set({ [f]: e.target.value })} aria-invalid={!!show(k)} aria-describedby={`fs-${k}-m`} className="num h-11" data-testid={`input-settings-${k}`} />
                {msg(`fs-${k}-m`, k)}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={t('p13.set.units')} lead={t('p13.set.unitsLead')} meta={t('p13.set.unitsCount', { count: draft.units.length })} testId="panel-settings-units">
          <div className="space-y-3 p-4 sm:p-5">
            {draft.units.length === 0 && <p className="text-sm text-muted-foreground" data-testid="empty-units">{t('p13.set.noUnits')}</p>}
            {draft.units.map((u, i) => (
              <div key={u.key} className="grid grid-cols-[1fr_auto] items-start gap-2 rounded-lg border bg-background p-3 sm:grid-cols-[1fr_1fr_auto]" data-testid={`row-unit-${i}`}>
                <div className="space-y-1">
                  <Label htmlFor={`u-${u.key}`} className="text-xs">{t('p13.set.unit')}</Label>
                  <Input id={`u-${u.key}`} dir="ltr" value={u.unit} maxLength={40} onChange={(e) => setUnit(u.key, { unit: e.target.value })} aria-invalid={!!show(`u${u.key}`)} className="h-11 font-mono" data-testid={`input-unit-name-${i}`} />
                  {msg(`u-${u.key}-m`, `u${u.key}`)}
                </div>
                <div className="col-span-2 row-start-2 space-y-1 sm:col-span-1 sm:row-start-auto">
                  <Label htmlFor={`f-${u.key}`} className="text-xs">{t('p13.set.factor')}</Label>
                  <Input id={`f-${u.key}`} dir="ltr" inputMode="decimal" value={u.factor} maxLength={80} onChange={(e) => setUnit(u.key, { factor: e.target.value })} aria-invalid={!!show(`f${u.key}`)} className="num h-11" data-testid={`input-unit-factor-${i}`} />
                  {msg(`f-${u.key}-m`, `f${u.key}`)}
                </div>
                <Button type="button" variant="ghost" size="icon" className="col-start-2 row-start-1 mt-5 size-11 text-status-red sm:col-start-3" onClick={() => set({ units: draft.units.filter((x) => x.key !== u.key) })} aria-label={t('p13.set.removeUnit', { unit: u.unit || String(i + 1) })} data-testid={`button-remove-unit-${i}`}>
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
            {msg('fs-units-m', 'units')}
            <Button type="button" variant="outline" className="min-h-11 gap-2" disabled={draft.units.length >= 100} onClick={() => set({ units: [...draft.units, { key: ++seq, unit: '', factor: '' }] })} data-testid="button-add-unit">
              <Plus className="size-4" aria-hidden="true" />
              {t('p13.set.addUnit')}
            </Button>
          </div>
        </Panel>

        {save.isError && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-status-red" data-testid="error-settings-save">
            {localizeError(t, save.error)}
          </p>
        )}

        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
          <span aria-live="polite" className="me-auto text-sm text-muted-foreground" data-testid="status-settings-dirty">{dirty ? t('p13.set.unsaved') : ''}</span>
          <Button type="button" variant="outline" className="min-h-11 gap-2" disabled={!dirty || save.isPending} onClick={() => { setDraft(toDraft(JSON.parse(baseline.current) as FactoryPreferences)); setTouched(false); save.reset(); }} data-testid="button-reset-settings">
            <RotateCcw className="size-4" aria-hidden="true" />
            {t('p13.set.reset')}
          </Button>
          <Button type="submit" className="min-h-11 gap-2" disabled={!dirty || save.isPending} data-testid="button-save-settings">
            <Save className="size-4" aria-hidden="true" />
            {save.isPending ? t('p13.common.saving') : t('p13.common.save')}
          </Button>
        </div>
      </form>

      <AuditPanel
        title={t('p13.set.audit.title')}
        lead={t('p13.set.audit.lead')}
        emptyTitle={t('p13.set.audit.empty')}
        emptyBody={t('p13.set.audit.emptyBody')}
        errorText={t('p13.set.audit.error')}
        query={audit}
        page={auditPage}
        onPage={setAuditPage}
        testId="panel-settings-audit"
      />
    </div>
  );
}
