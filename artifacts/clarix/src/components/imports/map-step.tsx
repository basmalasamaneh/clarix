import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BookmarkPlus, Check, Info, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import {
  getGetImportQueryKey,
  getListImportTemplatesQueryKey,
  getListImportsQueryKey,
  useCheckImport,
  useCreateImportTemplate,
  useListImportTemplates,
  useSaveImportMapping,
  type ImportDetail,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useCsrfRequest } from '@/lib/session';
import { cn } from '@/lib/utils';
import {
  EVENT_TYPES,
  FIELDS,
  HAS_UNIT,
  ROLES,
  draftFromMapping,
  hasErrors,
  levelOf,
  mappingFromDraft,
  newRowId,
  validateDraft,
  type Draft,
  type EventType,
  type Role,
} from '@/lib/import-model';
import { ErrorNote, NativeSelect, Raw, Section } from './shared';

export function MapStep({ detail, readOnly, onChecked }: { detail: ImportDetail; readOnly: boolean; onChecked: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const req = useCsrfRequest();
  const save = useSaveImportMapping({ request: req });
  const check = useCheckImport({ request: req });
  const createTpl = useCreateImportTemplate({ request: req });
  const [draft, setDraft] = useState<Draft>(() => draftFromMapping(detail.mapping));
  const [dirty, setDirty] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplTouched, setTplTouched] = useState(false);
  const initFor = useRef(detail.id);

  useEffect(() => {
    if (initFor.current !== detail.id) {
      initFor.current = detail.id;
      setDraft(draftFromMapping(detail.mapping));
      setDirty(false);
    }
  }, [detail.id, detail.mapping]);

  const tplParams = { source: detail.sourceName, page: 1 };
  const templates = useListImportTemplates(tplParams, {
    query: { queryKey: getListImportTemplatesQueryKey(tplParams) },
    request: { credentials: 'include' },
  });

  const errors = useMemo(() => validateDraft(t, draft), [t, draft]);
  const headers = useMemo(() => Object.fromEntries(detail.files.map((f) => [f.name, f.header ?? []])), [detail.files]);
  const level = levelOf(draft.files);

  const update = (fn: (d: Draft) => Draft) => {
    setDraft((d) => fn(d));
    setDirty(true);
  };

  const roleOf = (name: string): Role | 'none' => ROLES.find((r) => draft.files[r]?.file === name) ?? 'none';

  function setRole(name: string, role: Role | 'none') {
    update((d) => {
      const files = { ...d.files };
      for (const r of ROLES) if (files[r]?.file === name) delete files[r];
      if (role !== 'none') {
        const hdr = headers[name] ?? [];
        const columns: Record<string, string> = {};
        for (const f of FIELDS[role]) {
          const hit = hdr.find((h) => h.trim().toLowerCase() === f.key);
          if (hit) columns[f.key] = hit;
        }
        files[role] = { file: name, columns };
      }
      return { ...d, files };
    });
  }

  async function persist(): Promise<ImportDetail | null> {
    setShowErrors(true);
    if (hasErrors(errors)) return null;
    setError(null);
    try {
      const d = await save.mutateAsync({ id: detail.id, data: { mapping: mappingFromDraft(draft, detail.sourceName) } });
      qc.setQueryData(getGetImportQueryKey(d.id), d);
      void qc.invalidateQueries({ queryKey: getListImportsQueryKey() });
      setDirty(false);
      return d;
    } catch (e) {
      setError(e);
      return null;
    }
  }

  async function saveAndCheck() {
    const saved = dirty || !detail.samples?.length ? await persist() : detail;
    if (!saved) return;
    try {
      const d = await check.mutateAsync({ id: detail.id });
      qc.setQueryData(getGetImportQueryKey(d.id), d);
      void qc.invalidateQueries({ queryKey: getListImportsQueryKey() });
      onChecked();
    } catch (e) {
      setError(e);
    }
  }

  function loadTemplate(id: string) {
    const tpl = templates.data?.items.find((x) => x.id === id);
    if (!tpl) return;
    const next = draftFromMapping(tpl.mapping);
    const names = detail.files.map((f) => f.name);
    for (const r of ROLES) {
      const f = next.files[r];
      if (!f) continue;
      if (!names.includes(f.file)) {
        const cur = draft.files[r]?.file;
        if (cur) f.file = cur;
        else delete next.files[r];
      }
    }
    setDraft(next);
    setDirty(true);
    toast({ title: t('imp.templates.loaded', { name: tpl.name }) });
  }

  function saveTemplate() {
    setTplTouched(true);
    if (!tplName.trim()) return;
    createTpl.mutate(
      { data: { sourceName: detail.sourceName, name: tplName.trim(), mapping: mappingFromDraft(draft, detail.sourceName) } },
      {
        onSuccess: (tpl) => {
          void qc.invalidateQueries({ queryKey: getListImportTemplatesQueryKey(tplParams) });
          toast({ title: t('imp.templates.savedToast', { name: tpl.name, version: tpl.version }) });
          setTplOpen(false);
          setTplName('');
          setTplTouched(false);
        },
      },
    );
  }

  const busy = save.isPending || check.isPending;
  const fe = (k: string) => (showErrors ? errors.fields[k] : undefined);

  return (
    <div className="space-y-5">
      <Section
        title={t('imp.templates.title')}
        testId="section-templates"
        aside={
          !readOnly && (
            <Button variant="outline" className="min-h-11 gap-2" onClick={() => setTplOpen(true)} data-testid="button-open-save-template">
              <BookmarkPlus className="size-4" aria-hidden="true" />
              {t('imp.templates.save')}
            </Button>
          )
        }
      >
        {templates.isLoading ? (
          <div className="h-11 max-w-md animate-pulse rounded-md bg-muted" />
        ) : templates.isError ? (
          <ErrorNote error={templates.error} action={<Button variant="outline" className="min-h-11" onClick={() => templates.refetch()}>{t('imp.errors.retry')}</Button>} />
        ) : templates.data && templates.data.items.length > 0 ? (
          <div className="max-w-md space-y-1.5">
            <Label htmlFor="tpl-load">{t('imp.templates.load')}</Label>
            <NativeSelect id="tpl-load" value="" disabled={readOnly} onChange={(e) => loadTemplate(e.target.value)} data-testid="select-template">
              <option value="">{t('imp.templates.loadPlaceholder')}</option>
              {templates.data.items.map((tp) => (
                <option key={tp.id} value={tp.id}>
                  {tp.name} · {t('imp.templates.version', { version: tp.version })}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="text-no-templates">{t('imp.templates.none')}</p>
        )}
      </Section>

      <Section title={t('imp.map.title')} body={t('imp.map.body')} testId="section-roles">
        <h3 className="mb-3 text-sm font-medium">{t('imp.map.roleTitle')}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {detail.files.map((f, i) => (
            <div key={f.id} className="min-w-0 space-y-1.5">
              <Label htmlFor={`role-${i}`} className="block truncate">
                {t('imp.map.role', { name: f.name })}
              </Label>
              <NativeSelect id={`role-${i}`} value={roleOf(f.name)} disabled={readOnly} onChange={(e) => setRole(f.name, e.target.value as Role | 'none')} data-testid={`select-role-${i}`}>
                <option value="none">{t('imp.map.roles.none')}</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`imp.map.roles.${r}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ))}
        </div>
        {showErrors && errors.general.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm text-status-red" role="alert" data-testid="list-mapping-errors">
            {errors.general.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        )}
        <p className="mt-4 flex items-start gap-2 rounded-md bg-accent px-3 py-2 text-sm" data-testid="text-level">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="font-medium">{t('imp.map.level', { level })}</span> — {t(`imp.map.levels.${level}`)}
          </span>
        </p>
      </Section>

      {ROLES.filter((r) => draft.files[r]).map((r) => {
        const fm = draft.files[r]!;
        const hdr = headers[fm.file] ?? [];
        return (
          <Section key={r} title={t('imp.map.columnsTitle', { role: t(`imp.map.roles.${r}`) })} testId={`section-columns-${r}`} aside={<Raw className="text-muted-foreground">{fm.file}</Raw>}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FIELDS[r].map((fd) => {
                const key = `${r}.${fd.key}`;
                const err = fe(key);
                return (
                  <div key={fd.key} className="min-w-0 space-y-1.5">
                    <Label htmlFor={`col-${key}`} className="flex items-center gap-2">
                      {t(`imp.map.fields.${fd.key}`)}
                      {fd.required && <span className="text-xs font-normal text-muted-foreground">({t('imp.map.required')})</span>}
                    </Label>
                    <NativeSelect
                      id={`col-${key}`}
                      value={fm.columns[fd.key] ?? ''}
                      disabled={readOnly}
                      invalid={!!err}
                      aria-describedby={err ? `err-${key}` : undefined}
                      onChange={(e) =>
                        update((d) => ({ ...d, files: { ...d.files, [r]: { ...d.files[r]!, columns: { ...d.files[r]!.columns, [fd.key]: e.target.value } } } }))
                      }
                      data-testid={`select-col-${r}-${fd.key}`}
                    >
                      <option value="">{t('imp.map.notMapped')}</option>
                      {hdr.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </NativeSelect>
                    {err && (
                      <p id={`err-${key}`} className="text-xs text-status-red">
                        {err}
                      </p>
                    )}
                  </div>
                );
              })}
              {HAS_UNIT[r] && !fm.columns.unit && (
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={`unit-${r}`}>{t('imp.map.fixedUnit')}</Label>
                  <Input
                    id={`unit-${r}`}
                    dir="ltr"
                    className="h-11 font-mono"
                    value={fm.fixed_unit ?? ''}
                    disabled={readOnly}
                    maxLength={16}
                    onChange={(e) => update((d) => ({ ...d, files: { ...d.files, [r]: { ...d.files[r]!, fixed_unit: e.target.value } } }))}
                    data-testid={`input-fixed-unit-${r}`}
                  />
                  <p className="text-xs text-muted-foreground">{t('imp.map.fixedUnitHint')}</p>
                </div>
              )}
            </div>
          </Section>
        );
      })}

      <Section title={t('imp.map.formatTitle')} body={t('imp.map.formatHint')} testId="section-format">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="fmt-decimal">{t('imp.map.decimal')}</Label>
            <NativeSelect
              id="fmt-decimal"
              value={draft.format.decimal_separator}
              disabled={readOnly}
              onChange={(e) => update((d) => ({ ...d, format: { ...d.format, decimal_separator: e.target.value } }))}
              data-testid="select-decimal"
            >
              <option value=".">{t('imp.map.decimalDot')}</option>
              <option value=",">{t('imp.map.decimalComma')}</option>
            </NativeSelect>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="fmt-date">{t('imp.map.dateFormat')}</Label>
            <Input
              id="fmt-date"
              dir="ltr"
              className={cn('h-11 font-mono', fe('format.date_format') && 'border-status-red')}
              value={draft.format.date_format}
              disabled={readOnly}
              aria-invalid={fe('format.date_format') ? true : undefined}
              onChange={(e) => update((d) => ({ ...d, format: { ...d.format, date_format: e.target.value } }))}
              data-testid="input-date-format"
            />
            {fe('format.date_format') && <p className="text-xs text-status-red">{fe('format.date_format')}</p>}
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="fmt-dt">{t('imp.map.dateTimeFormat')}</Label>
            <Input
              id="fmt-dt"
              dir="ltr"
              className="h-11 font-mono"
              value={draft.format.datetime_format}
              disabled={readOnly}
              onChange={(e) => update((d) => ({ ...d, format: { ...d.format, datetime_format: e.target.value } }))}
              data-testid="input-datetime-format"
            />
          </div>
        </div>
      </Section>

      {draft.files.events && (
        <Section
          title={t('imp.map.eventsTitle')}
          body={t('imp.map.eventsBody')}
          testId="section-event-codes"
          aside={
            !readOnly && (
              <Button variant="outline" className="min-h-11 gap-2" onClick={() => update((d) => ({ ...d, codes: [...d.codes, { id: newRowId(), code: '', type: 'CHANGEOVER' }] }))} data-testid="button-add-code">
                <Plus className="size-4" aria-hidden="true" />
                {t('imp.map.addCode')}
              </Button>
            )
          }
        >
          <div className="space-y-3">
            {draft.codes.map((c, i) => {
              const err = showErrors ? errors.codes[c.id] : undefined;
              return (
                <div key={c.id} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start">
                  <div className="min-w-0">
                    <Label htmlFor={`code-${c.id}`} className={cn('mb-1 block text-xs text-muted-foreground', i > 0 && 'sm:sr-only')}>
                      {t('imp.map.code')}
                    </Label>
                    <Input
                      id={`code-${c.id}`}
                      dir="auto"
                      className={cn('h-11 font-mono', err && 'border-status-red')}
                      value={c.code}
                      disabled={readOnly}
                      aria-invalid={err ? true : undefined}
                      onChange={(e) => update((d) => ({ ...d, codes: d.codes.map((x) => (x.id === c.id ? { ...x, code: e.target.value } : x)) }))}
                      data-testid={`input-code-${i}`}
                    />
                    {err && <p className="mt-1 text-xs text-status-red">{err}</p>}
                  </div>
                  <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:row-start-auto">
                    <Label htmlFor={`type-${c.id}`} className={cn('mb-1 block text-xs text-muted-foreground', i > 0 && 'sm:sr-only')}>
                      {t('imp.map.meaning')}
                    </Label>
                    <NativeSelect
                      id={`type-${c.id}`}
                      value={c.type}
                      disabled={readOnly}
                      onChange={(e) => update((d) => ({ ...d, codes: d.codes.map((x) => (x.id === c.id ? { ...x, type: e.target.value as EventType } : x)) }))}
                      data-testid={`select-code-type-${i}`}
                    >
                      {EVENT_TYPES.map((et) => (
                        <option key={et} value={et}>
                          {t(`imp.map.types.${et}`)}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn('size-11', i === 0 && 'mt-5')}
                      onClick={() => update((d) => ({ ...d, codes: d.codes.filter((x) => x.id !== c.id) }))}
                      aria-label={t('imp.map.removeCode', { code: c.code })}
                      data-testid={`button-remove-code-${i}`}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <Section title={t('imp.map.samplesTitle')} body={t('imp.map.samplesBody')} testId="section-samples">
        {detail.samples && detail.samples.length > 0 ? (
          <div className="min-w-0 overflow-x-auto rounded-lg border" data-testid="table-samples">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{t('imp.map.sampleFile')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('imp.upload.line')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('imp.map.sampleRaw')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('imp.map.sampleValue')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {detail.samples.map((s, i) => (
                  <tr key={`${s.file}-${s.line}-${s.column}-${i}`} data-testid={`row-sample-${i}`}>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Raw>{s.file}</Raw> <span className="text-muted-foreground">·</span> <Raw className="text-muted-foreground">{s.column}</Raw>
                    </td>
                    <td className="num px-3 py-2 text-muted-foreground">{s.line}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Raw>{s.raw}</Raw>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {s.value == null ? (
                        <span className="text-status-amber">{t('imp.map.notAvailable')}</span>
                      ) : (
                        <span className="font-medium">
                          <Raw>{s.value}</Raw> <Raw className="text-muted-foreground">{s.unit}</Raw>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="text-samples-empty">
            {t('imp.map.samplesEmpty')}
          </p>
        )}
      </Section>

      {error != null && <ErrorNote error={error} testId="status-mapping-error" />}

      {!readOnly && (
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:rounded-xl sm:border">
          <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite" data-testid="status-save">
            {save.isPending ? (
              t('imp.map.saving')
            ) : check.isPending ? (
              t('imp.map.checking')
            ) : dirty ? (
              <>
                <span className="size-2 rounded-full bg-status-amber" aria-hidden="true" />
                {t('imp.map.unsaved')}
              </>
            ) : (
              <>
                <Check className="size-4 text-status-green" aria-hidden="true" />
                {t('imp.map.saved')}
              </>
            )}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="min-h-11 gap-2" disabled={busy} onClick={() => void persist()} data-testid="button-save-mapping">
              {save.isPending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
              {t('imp.map.save')}
            </Button>
            <Button className="min-h-11 gap-2" disabled={busy} onClick={() => void saveAndCheck()} data-testid="button-save-and-check">
              {check.isPending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ArrowRight className="size-4 rtl-flip" aria-hidden="true" />}
              {t('imp.map.toCheck')}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={tplOpen} onOpenChange={setTplOpen}>
        <DialogContent className="w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle>{t('imp.templates.dialogTitle')}</DialogTitle>
            <DialogDescription>{t('imp.templates.dialogBody')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">{t('imp.templates.name')}</Label>
            <Input
              id="tpl-name"
              className="h-11"
              maxLength={120}
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              aria-invalid={tplTouched && !tplName.trim() ? true : undefined}
              data-testid="input-template-name"
            />
            {tplTouched && !tplName.trim() && <p className="text-xs text-status-red">{t('imp.templates.nameRequired')}</p>}
          </div>
          {createTpl.error != null && <ErrorNote error={createTpl.error} />}
          <DialogFooter className="gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => setTplOpen(false)} data-testid="button-cancel-template">
              {t('imp.templates.cancel')}
            </Button>
            <Button className="min-h-11 gap-2" disabled={createTpl.isPending} onClick={saveTemplate} data-testid="button-confirm-template">
              {createTpl.isPending && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {t('imp.templates.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
