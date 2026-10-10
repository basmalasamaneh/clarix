import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, CheckCircle2, CircleSlash, FileText, History, Lock, OctagonX, RotateCcw, Scale, TriangleAlert } from 'lucide-react';
import {
  getGetSnapshotQueryKey,
  getListReconciliationsQueryKey,
  getListSnapshotsQueryKey,
  useAddReconciliation,
  usePreviewReconciliation,
  useSaveSnapshot,
  type ReconciliationFigure,
  type ReconciliationResult,
  type ReportFigures,
  type ReportRunFigures,
  type Session,
  type SnapshotChange,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { QualityStatusBadge } from '@/components/quality/status-badge';
import { GlossaryTip } from '@/components/charts/glossary';
import { SourceLink } from '@/components/runs/refs';
import { useToast } from '@/hooks/use-toast';
import { localizeError, useCsrfRequest } from '@/lib/session';
import { cn } from '@/lib/utils';
import { NumText, Qty } from '@/components/num-text';
import '@/lib/phase14-i18n';

export const SNAP_PAGE = 20;
export const FIG_KEYS = ['input_kg', 'good_kg', 'scrap_kg', 'changeover_min', 'downtime_min'] as const;
type FigKey = (typeof FIG_KEYS)[number];
const DEC = /^-?\d{1,30}(\.\d{1,30})?$/;

export function canWriteSnapshots(session: Session) {
  if (session.user?.platformAdmin) return false;
  const role = session.memberships.find((m) => m.factoryId === session.activeFactoryId)?.role;
  return role === 'factory_manager' || role === 'analyst';
}

export function useFmtDate() {
  const { i18n } = useTranslation();
  const loc = i18n.language.startsWith('ar') ? 'ar' : 'en';
  return (s: string) => {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s : new Intl.DateTimeFormat(loc, { dateStyle: 'medium', timeStyle: 'short', numberingSystem: 'latn' }).format(d);
  };
}

function useBi() {
  const { i18n } = useTranslation();
  const ar = i18n.language.startsWith('ar');
  return { ar, pick: (x: { en: string; ar: string }) => (ar ? x.ar : x.en), dir: ar ? 'rtl' as const : 'ltr' as const };
}

/* ---------------- figures form ---------------- */

export type FiguresState = { a: Record<FigKey, string>; b: Record<FigKey, string>; origin: string };
const emptySide = (): Record<FigKey, string> => ({ input_kg: '', good_kg: '', scrap_kg: '', changeover_min: '', downtime_min: '' });
export const emptyFigures = (): FiguresState => ({ a: emptySide(), b: emptySide(), origin: '' });

/** Blank fields are omitted (never zero). Returns null when nothing was entered. */
export function buildFigures(s: FiguresState): { figures: ReportFigures | null; invalid: string[] } {
  const invalid: string[] = [];
  let any = s.origin.trim().length > 0;
  const side = (x: Record<FigKey, string>, tag: string) => {
    const out: ReportRunFigures = {};
    for (const k of FIG_KEYS) {
      const v = x[k].trim();
      if (!v) continue;
      if (!DEC.test(v)) invalid.push(`${tag}-${k}`);
      else { out[k] = v; any = true; }
    }
    return out;
  };
  const a = side(s.a, 'a');
  const b = side(s.b, 'b');
  return { figures: any && invalid.length === 0 ? { a, b, origin: s.origin.trim() } : null, invalid };
}

export function FiguresForm({ value, onChange, disabled }: { value: FiguresState; onChange: (v: FiguresState) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const { invalid } = buildFigures(value);
  const unitOf = (k: FigKey) => t(`rc.unit.${k.endsWith('_kg') ? 'kg' : 'min'}`);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {(['a', 'b'] as const).map((side) => (
          <fieldset key={side} className="min-w-0 rounded-lg border bg-background p-3" disabled={disabled}>
            <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
              <span className="grid size-6 place-items-center rounded bg-primary text-xs font-bold text-primary-foreground">{side === 'a' ? t('rc.cmp.sideA') : t('rc.cmp.sideB')}</span>
              {side === 'a' ? t('rc.cmp.runA') : t('rc.cmp.runB')}
            </legend>
            <div className="mt-1 grid gap-3 sm:grid-cols-2">
              {FIG_KEYS.map((k) => {
                const id = `fig-${side}-${k}`;
                const bad = invalid.includes(`${side}-${k}`);
                return (
                  <div key={k} className="min-w-0">
                    <Label htmlFor={id} className="text-xs">{t(`rc.metric.${k}`)} <span className="font-normal text-muted-foreground">({unitOf(k)})</span></Label>
                    <Input
                      id={id}
                      inputMode="decimal"
                      autoComplete="off"
                      dir="ltr"
                      maxLength={80}
                      value={value[side][k]}
                      placeholder={t('snp.rec.res.not_provided')}
                      aria-invalid={bad || undefined}
                      aria-describedby={bad ? `${id}-err` : undefined}
                      onChange={(e) => onChange({ ...value, [side]: { ...value[side], [k]: e.target.value } })}
                      className={cn('num mt-1 min-h-11', bad && 'border-status-red')}
                      data-testid={`input-figure-${side}-${k}`}
                    />
                    {bad && <p id={`${id}-err`} className="mt-1 text-xs text-status-red" data-testid={`error-figure-${side}-${k}`}>{t('snp.fig.invalid')}</p>}
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      <div>
        <Label htmlFor="fig-origin" className="text-xs">{t('snp.fig.origin')}</Label>
        <Input id="fig-origin" maxLength={1000} value={value.origin} disabled={disabled} placeholder={t('snp.fig.originPh')}
          onChange={(e) => onChange({ ...value, origin: e.target.value })} className="mt-1 min-h-11" data-testid="input-figure-origin" />
      </div>
    </div>
  );
}

/* ---------------- reconciliation result ---------------- */

const RES_STATUS = { matches: 'green', differs: 'yellow', unavailable: 'red', not_provided: 'green' } as const;
const RES_ICON = { matches: CheckCircle2, differs: Scale, unavailable: OctagonX, not_provided: CircleSlash } as const;

function Num({ v, unit, testId, reported = false }: { v: string | null; unit: string; testId: string; reported?: boolean }) {
  const { t } = useTranslation();
  if (v == null) return <span className="text-sm italic text-muted-foreground" data-testid={testId}>{t(reported ? 'snp.rec.res.not_provided' : 'rc.na')}</span>;
  return <span className="break-all text-sm" data-testid={testId}><Qty value={v} unit={unit} fallbackUnit={t(`rc.unit.${unit}`, { defaultValue: unit })} numClassName="font-medium" unitClassName="text-[11px] text-muted-foreground" /></span>;
}

function ResultCell({ f, tid }: { f: ReconciliationFigure; tid: string }) {
  const { t } = useTranslation();
  const { pick, dir } = useBi();
  const Icon = RES_ICON[f.result];
  if (f.result === 'not_provided') return <span className="inline-flex items-center gap-2 text-sm text-muted-foreground" data-testid={`status-rec-${tid}`}><CircleSlash className="size-4" aria-hidden="true" />{t('snp.rec.res.not_provided')}</span>;
  return (
    <div className="min-w-0 space-y-1">
      <span className="inline-flex items-center gap-1.5">
        <Icon className={cn('size-4', f.result === 'matches' ? 'text-status-green' : f.result === 'differs' ? 'text-status-amber' : 'text-status-red')} aria-hidden="true" />
        <QualityStatusBadge status={RES_STATUS[f.result]} label={t(`snp.rec.res.${f.result}`)} size="sm" testId={`status-rec-${tid}`} />
      </span>
      <p className="text-sm leading-relaxed" dir={dir} data-testid={`text-rec-sentence-${tid}`}><NumText text={pick(f.sentence)} /></p>
      {f.result === 'unavailable' && (
        <>
          {pick(f.reason) && <p className="text-xs text-muted-foreground" dir={dir} data-testid={`text-rec-reason-${tid}`}><NumText text={pick(f.reason)} /></p>}
          <Link href="/quality" className="inline-flex min-h-11 items-center text-xs font-medium text-primary underline-offset-2 hover:underline" data-testid={`link-rec-quality-${tid}`}>{t('snp.rec.openQuality')}</Link>
        </>
      )}
    </div>
  );
}

function DiffCell({ f, tid }: { f: ReconciliationFigure; tid: string }) {
  const { t } = useTranslation();
  if (f.result === 'unavailable' || f.difference == null) return <span className="text-sm text-muted-foreground" data-testid={`text-rec-diff-${tid}`}>{t('rc.na')}</span>;
  return (
    <SourceLink source={{ kind: 'metric', id: f.runId, metric: f.key }} label={`${t(`rc.metric.${f.key}`, { defaultValue: f.key })} · ${t('snp.rec.difference')}`} testId={`link-rec-source-${tid}`}>
      <Num v={f.difference} unit={f.unit} testId={`text-rec-diff-${tid}`} />
    </SourceLink>
  );
}

export function ReconciliationTable({ result, testId }: { result: ReconciliationResult; testId: string }) {
  const { t } = useTranslation();
  const rows = result.figures;
  const runLabel = (s: string) => (s === 'a' ? t('rc.cmp.runA') : t('rc.cmp.runB'));
  return (
    <div data-testid={testId}>
      {result.origin && (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground" data-testid={`${testId}-origin`}>
          <FileText className="size-3.5" aria-hidden="true" />{t('snp.rec.source')}: <span className="font-medium text-foreground">{result.origin}</span>
        </p>
      )}
      <table className="hidden w-full table-fixed break-words text-sm md:table">
        <thead>
          <tr className="border-b bg-muted text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 text-start">{t('snp.rec.metric')}</th>
            <th className="px-3 py-2 text-start">{t('snp.rec.clarix')}</th>
            <th className="px-3 py-2 text-start">{t('snp.rec.reported')}</th>
            <th className="bg-accent px-3 py-2 text-start">{t('snp.rec.difference')} <span className="font-normal normal-case">({t('snp.rec.diffHint')})</span></th>
            <th className="w-[38%] px-3 py-2 text-start">{t('snp.rec.result')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => {
            const tid = `${f.side}-${f.key}`;
            return (
              <tr key={tid} className="border-b align-top last:border-0" data-testid={`row-rec-${tid}`}>
                <th scope="row" className="px-3 py-3 text-start font-medium">
                  <span className="block text-[11px] font-normal text-muted-foreground">{runLabel(f.side)}</span>{t(`rc.metric.${f.key}`, { defaultValue: f.key })}
                </th>
                <td className="px-3 py-3"><Num v={f.clarix} unit={f.unit} testId={`text-rec-clarix-${tid}`} /></td>
                <td className="px-3 py-3"><Num v={f.reported} unit={f.unit} reported testId={`text-rec-reported-${tid}`} /></td>
                <td className="bg-[color-mix(in_srgb,var(--accent)_60%,transparent)] px-1 py-1.5"><DiffCell f={f} tid={tid} /></td>
                <td className="px-3 py-3"><ResultCell f={f} tid={tid} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ul className="space-y-2 md:hidden">
        {rows.map((f) => {
          const tid = `${f.side}-${f.key}`;
          return (
            <li key={tid} className="rounded-lg border bg-background p-3" data-testid={`card-rec-${tid}`}>
              <p className="text-sm font-semibold"><span className="font-normal text-muted-foreground">{runLabel(f.side)} · </span>{t(`rc.metric.${f.key}`, { defaultValue: f.key })}</p>
              <dl className="mt-2 grid grid-cols-2 gap-2">
                <div><dt className="text-[11px] text-muted-foreground">{t('snp.rec.clarix')}</dt><dd><Num v={f.clarix} unit={f.unit} testId={`text-rec-card-clarix-${tid}`} /></dd></div>
                <div><dt className="text-[11px] text-muted-foreground">{t('snp.rec.reported')}</dt><dd><Num v={f.reported} unit={f.unit} reported testId={`text-rec-card-reported-${tid}`} /></dd></div>
                <div className="col-span-2 rounded-md bg-accent p-1"><dt className="px-2 text-[11px] text-muted-foreground">{t('snp.rec.difference')} ({t('snp.rec.diffHint')})</dt><dd><DiffCell f={f} tid={`card-${tid}`} /></dd></div>
              </dl>
              <div className="mt-2"><ResultCell f={f} tid={`card-${tid}`} /></div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------------- comparison: save snapshot + preview ---------------- */

export function ComparisonSnapshotPanel({ session, a, b, expectedImportA, expectedImportB }: { session: Session; a: string; b: string; expectedImportA: string; expectedImportB: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [figs, setFigs] = useState<FiguresState>(emptyFigures);
  const [preview, setPreview] = useState<ReconciliationResult | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const request = useCsrfRequest();
  const previewM = usePreviewReconciliation({ request });
  const saveM = useSaveSnapshot({ request });
  const { figures, invalid } = buildFigures(figs);

  if (!canWriteSnapshots(session)) {
    return (
      <p className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm text-muted-foreground" data-testid="text-snapshot-viewer">
        <Lock className="size-4 shrink-0" aria-hidden="true" />{t('snp.save.viewerNote')}
        <Link href="/snapshots" className="ms-auto inline-flex min-h-11 items-center font-medium text-primary" data-testid="link-snapshots-list">{t('nav.snapshots')}</Link>
      </p>
    );
  }

  const change = (v: FiguresState) => { setFigs(v); setPreview(null); previewM.reset(); };
  const runPreview = () => {
    if (!figures) return;
    previewM.mutate({ data: { a, b, figures } }, { onSuccess: (r) => setPreview(r) });
  };
  const titleOk = title.trim().length > 0;
  const save = () => {
    setTouched(true);
    if (!titleOk || invalid.length > 0) return;
    saveM.mutate({ data: { a, b, expectedImportA, expectedImportB, title: title.trim(), note: note.trim(), ...(figures ? { figures } : {}) } }, {
      onSuccess: (snap) => {
        qc.invalidateQueries({ queryKey: [getListSnapshotsQueryKey()[0]] });
        setOpen(false);
        toast({ title: t('snp.save.done'), description: snap.snapshot.title });
        navigate(`/snapshots/${snap.snapshot.id}`);
      },
    });
  };

  return (
    <section className="rounded-xl border bg-card shadow-[var(--shadow-sm)]" aria-labelledby="snap-panel" data-testid="section-snapshot-panel">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <Archive className="size-4 text-primary" aria-hidden="true" />
        <h2 id="snap-panel" className="inline-flex items-center text-sm font-semibold">{t('snp.save.open')}<GlossaryTip term="snapshot" testId="button-glossary-snapshot" /></h2>
        <Button onClick={() => { setTouched(false); saveM.reset(); setOpen(true); }} disabled={invalid.length > 0} className="ms-auto min-h-11 gap-2" data-testid="button-open-save-snapshot">
          <Archive className="size-4" aria-hidden="true" />{t('snp.save.open')}
        </Button>
      </header>
      <div className="space-y-4 p-4">
        <div>
          <h3 className="inline-flex items-center text-sm font-semibold">{t('snp.fig.title')}<GlossaryTip term="reconciliation" testId="button-glossary-reconciliation" /></h3>
          <p className="text-xs text-muted-foreground">{t('snp.fig.lead')}</p>
        </div>
        <FiguresForm value={figs} onChange={change} disabled={saveM.isPending || previewM.isPending} />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={runPreview} disabled={!figures || previewM.isPending} className="min-h-11 gap-2" data-testid="button-preview-reconciliation">
            <Scale className="size-4" aria-hidden="true" />{previewM.isPending ? t('snp.fig.previewing') : t('snp.fig.preview')}
          </Button>
          <Button variant="ghost" disabled={saveM.isPending || previewM.isPending} onClick={() => change(emptyFigures())} className="min-h-11 gap-2" data-testid="button-reset-figures"><RotateCcw className="size-4" aria-hidden="true" />{t('snp.fig.reset')}</Button>
          {!figures && invalid.length === 0 && <span className="text-xs text-muted-foreground">{t('snp.fig.nothing')}</span>}
        </div>
        {previewM.isError && <p role="alert" className="text-sm text-status-red" data-testid="error-preview-reconciliation">{localizeError(t, previewM.error)}</p>}
        {preview && (
          <div className="fade-up space-y-2">
            <p className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs font-medium text-status-amber" data-testid="text-preview-unsaved">
              <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />{t('snp.fig.unsaved')}
            </p>
            <ReconciliationTable result={preview} testId="table-reconciliation-preview" />
          </div>
        )}
      </div>

      <AlertDialog open={open} onOpenChange={(o) => !saveM.isPending && setOpen(o)}>
        <AlertDialogContent data-testid="dialog-save-snapshot">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('snp.save.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('snp.save.lead')}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="snap-title">{t('snp.save.fTitle')}</Label>
              <Input id="snap-title" value={title} maxLength={160} required aria-invalid={touched && !titleOk || undefined} aria-describedby="snap-title-hint"
                onChange={(e) => setTitle(e.target.value)} className="mt-1 min-h-11" data-testid="input-snapshot-title" />
              <p id="snap-title-hint" className={cn('mt-1 text-xs', touched && !titleOk ? 'text-status-red' : 'text-muted-foreground')} data-testid="text-snapshot-title-hint">
                {touched && !titleOk ? t('snp.save.titleRequired') : t('snp.save.fTitleHint')}
              </p>
            </div>
            <div>
              <Label htmlFor="snap-note">{t('snp.save.fNote')}</Label>
              <Textarea id="snap-note" value={note} maxLength={2000} rows={3} onChange={(e) => setNote(e.target.value)} className="mt-1" data-testid="input-snapshot-note" />
            </div>
            {figures && <p className="text-xs text-muted-foreground" data-testid="text-snapshot-with-figures">{t('snp.save.withFigures')}</p>}
            <p role="note" className="flex items-start gap-2 rounded-md border border-[color-mix(in_srgb,var(--status-amber)_40%,transparent)] bg-[color-mix(in_srgb,var(--status-amber)_7%,var(--card))] px-3 py-2 text-sm font-medium" data-testid="text-snapshot-immutable">
              <Lock className="mt-0.5 size-4 shrink-0 text-status-amber" aria-hidden="true" />{t('snp.save.warn')}
            </p>
            {saveM.isError && <p role="alert" className="text-sm text-status-red" data-testid="error-save-snapshot">{localizeError(t, saveM.error)}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saveM.isPending} className="min-h-11" data-testid="button-cancel-save-snapshot">{t('p13.common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); save(); }} disabled={saveM.isPending} className="min-h-11" data-testid="button-confirm-save-snapshot">
              {saveM.isPending ? t('snp.save.saving') : t('snp.save.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/* ---------------- snapshot: add record ---------------- */

export function AddReconciliationPanel({ snapshotId }: { snapshotId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [figs, setFigs] = useState<FiguresState>(emptyFigures);
  const [open, setOpen] = useState(false);
  const request = useCsrfRequest();
  const addM = useAddReconciliation({ request });
  const { figures, invalid } = buildFigures(figs);
  const submit = () => {
    if (!figures) return;
    addM.mutate({ id: snapshotId, data: figures }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: [getListReconciliationsQueryKey()[0]] });
        qc.invalidateQueries({ queryKey: getGetSnapshotQueryKey(snapshotId) });
        setOpen(false);
        setFigs(emptyFigures());
        toast({ title: t('snp.fig.added') });
      },
    });
  };
  return (
    <section className="rounded-xl border bg-card p-4 shadow-[var(--shadow-sm)]" aria-labelledby="rec-add" data-testid="section-add-reconciliation">
      <h2 id="rec-add" className="inline-flex items-center text-sm font-semibold">{t('snp.rec.addTitle')}<GlossaryTip term="reconciliation" testId="button-glossary-reconciliation-add" /></h2>
      <p className="mb-3 text-xs text-muted-foreground">{t('snp.fig.lead')}</p>
      <FiguresForm value={figs} onChange={setFigs} disabled={addM.isPending} />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => { addM.reset(); setOpen(true); }} disabled={!figures} className="min-h-11 gap-2" data-testid="button-open-add-reconciliation">
          <History className="size-4" aria-hidden="true" />{t('snp.fig.add')}
        </Button>
        {!figures && invalid.length === 0 && <span className="text-xs text-muted-foreground">{t('snp.fig.nothing')}</span>}
      </div>
      <AlertDialog open={open} onOpenChange={(o) => !addM.isPending && setOpen(o)}>
        <AlertDialogContent data-testid="dialog-add-reconciliation">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('snp.fig.add')}</AlertDialogTitle>
            <AlertDialogDescription data-testid="text-reconciliation-immutable">{t('snp.fig.addConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          {addM.isError && <p role="alert" className="text-sm text-status-red" data-testid="error-add-reconciliation">{localizeError(t, addM.error)}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={addM.isPending} className="min-h-11" data-testid="button-cancel-add-reconciliation">{t('p13.common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); submit(); }} disabled={addM.isPending} className="min-h-11" data-testid="button-confirm-add-reconciliation">
              {addM.isPending ? t('snp.fig.adding') : t('snp.fig.add')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/* ---------------- changes ---------------- */

export function ChangesPanel({ changes }: { changes: SnapshotChange[] }) {
  const { t } = useTranslation();
  const val = (v: string | null, testId: string, status: boolean): ReactNode =>
    v == null ? <span className="italic text-muted-foreground" data-testid={testId}>{t('snp.changes.empty')}</span>
    : status && (v === 'green' || v === 'yellow' || v === 'red')
      ? <QualityStatusBadge status={v} testId={testId} />
      : <span className="num font-medium break-all" data-testid={testId}>{v}</span>;
  const changeLabel = (c: SnapshotChange) => c.kind === 'metric' ? t(`rc.metric.${c.key}`)
    : t(`snp.changes.keys.${c.key}`);
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="snap-changes" data-testid="section-snapshot-changes">
      <h2 id="snap-changes" className="flex items-center gap-2 text-sm font-semibold">
        <History className="size-4 text-primary" aria-hidden="true" />{t('snp.changes.title')}
      </h2>
      <p className="text-[11px] text-muted-foreground">{t('snp.changes.lead')}</p>
      {changes.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-sm" data-testid="text-snapshot-no-changes"><CheckCircle2 className="size-4 text-status-green" aria-hidden="true" />{t('snp.changes.none')}</p>
      ) : (
        <ul className="mt-3 divide-y rounded-lg border">
          {changes.map((c, i) => (
            <li key={`${c.side}-${c.kind}-${c.key}-${i}`} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center" data-testid={`row-change-${i}`}>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-status-amber">{t(`snp.changes.kind.${c.kind}`)}</p>
                <p className="text-sm font-medium">{c.side === 'a' ? t('rc.cmp.runA') : t('rc.cmp.runB')} · {changeLabel(c)}</p>
              </div>
              <div className="min-w-0 text-sm"><span className="block text-[11px] text-muted-foreground">{t('snp.changes.before')}</span>{val(c.before, `text-change-before-${i}`, c.kind === 'status')}</div>
              <div className="min-w-0 text-sm"><span className="block text-[11px] text-muted-foreground">{t('snp.changes.after')}</span>{val(c.after, `text-change-after-${i}`, c.kind === 'status')}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Pager({ page, total, onPage, testId }: { page: number; total: number; onPage: (p: number) => void; testId: string }) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / SNAP_PAGE));
  if (pages <= 1) return null;
  return (
    <nav className="flex flex-wrap items-center justify-between gap-2 pt-3" aria-label={t('snp.page', { page, pages })} data-testid={testId}>
      <Button variant="outline" className="min-h-11" disabled={page <= 1} onClick={() => onPage(page - 1)} data-testid={`${testId}-prev`}>{t('snp.prev')}</Button>
      <span className="text-xs text-muted-foreground" data-testid={`${testId}-label`}>{t('snp.page', { page, pages })}</span>
      <Button variant="outline" className="min-h-11" disabled={page >= pages} onClick={() => onPage(page + 1)} data-testid={`${testId}-next`}>{t('snp.next')}</Button>
    </nav>
  );
}
