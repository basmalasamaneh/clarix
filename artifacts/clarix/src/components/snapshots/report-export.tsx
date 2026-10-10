import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, FileDown, Loader2, Printer, RotateCcw, Snowflake, X } from 'lucide-react';
import { usePrepareSnapshotReport, type SnapshotReport } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { useCsrfRequest, localizeError } from '@/lib/session';
import { cn } from '@/lib/utils';
import { docTitleOf, isEmbeddedFont, renderReportHtml, safeFilename, type ReportLang, type SnapshotReportPayload } from '@/lib/report/render';
import { reportLabels } from '@/lib/report/labels';
import { REPORT_FONTS } from '@/lib/report/fonts';
import '@/lib/phase15-i18n';

const MAX_HTML_BYTES = 12_000_000; // fonts (~0.4 MB) + 2 MB JSON rendered
const LAYOUT_TIMEOUT_MS = 15_000;

type Phase = { k: 'idle' } | { k: 'preparing' } | { k: 'rendering' } | { k: 'ready'; filename: string } | { k: 'error'; msg: string };

/** Builds the print document for a stored report payload. Exported for the sample driver / tests. */
export function buildPrintDocument(report: SnapshotReport) {
  const r = report as unknown as SnapshotReportPayload;
  const lang: ReportLang = r.language === 'ar' ? 'ar' : 'en';
  const filename = safeFilename(r.filename, `clarix-${r.snapshot.id}-${lang}`);
  return { html: renderReportHtml(r, reportLabels(lang), REPORT_FONTS), filename, title: docTitleOf(filename) };
}

/**
 * Download PDF = prepare stored payload on the server, render a static print
 * document into a sandboxed hidden iframe (no scripts, CSP, inline fonts), and open
 * the browser print window. Data lives only in memory and is destroyed on close,
 * unmount, or factory/user change (parent remounts with a key).
 */
export function ReportExport({ snapshotId }: { snapshotId: string }) {
  const { t, i18n } = useTranslation();
  const [lang, setLang] = useState<ReportLang>(i18n.language.startsWith('ar') ? 'ar' : 'en');
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const titleRef = useRef<string | null>(null);
  const runRef = useRef(0);
  const prepare = usePrepareSnapshotReport({ request: useCsrfRequest() });

  const destroy = () => {
    runRef.current += 1;
    frameRef.current?.remove();
    frameRef.current = null;
    if (titleRef.current != null) { document.title = titleRef.current; titleRef.current = null; }
  };
  useEffect(() => destroy, []);

  const print = (title: string) => {
    const w = frameRef.current?.contentWindow;
    if (!w) return;
    if (titleRef.current == null) titleRef.current = document.title;
    document.title = title; // Chrome suggests "<title>.pdf" in Save as PDF
    const restore = () => { if (titleRef.current != null) { document.title = titleRef.current; titleRef.current = null; } };
    w.addEventListener('afterprint', restore, { once: true });
    w.focus();
    w.print();
    setTimeout(restore, 1000); // print() is blocking in Chrome; this runs after the dialog closes
  };

  const layout = async (report: SnapshotReport, run: number) => {
    if (report.snapshot.id !== snapshotId) throw new Error(t('rpt.mismatch'));
    if (![REPORT_FONTS.inter, REPORT_FONTS.arabic400, REPORT_FONTS.arabic600].every(isEmbeddedFont)) throw new Error(t('rpt.fontError'));
    const doc = buildPrintDocument(report);
    if (doc.html.length > MAX_HTML_BYTES) throw new Error(t('rpt.tooBig'));
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-same-origin allow-modals');
    f.setAttribute('aria-hidden', 'true');
    f.setAttribute('tabindex', '-1');
    f.setAttribute('data-testid', 'frame-report-print');
    f.style.cssText = 'position:fixed;inset-inline-end:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
    const loaded = new Promise<void>((res) => f.addEventListener('load', () => res(), { once: true }));
    f.srcdoc = doc.html;
    frameRef.current?.remove();
    frameRef.current = f;
    document.body.appendChild(f);
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error(t('rpt.timeout'))), LAYOUT_TIMEOUT_MS));
    await Promise.race([(async () => {
      await loaded;
      const fd = f.contentDocument;
      if (!fd) throw new Error(t('rpt.fontError'));
      await Promise.all(['Clarix Inter', 'Clarix Plex Arabic'].map((fam) => fd.fonts.load(`16px '${fam}'`, fam.includes('Arabic') ? 'عربي' : 'Aa1')));
      await fd.fonts.ready;
      if (!fd.fonts.check("16px 'Clarix Inter'") || !fd.fonts.check("16px 'Clarix Plex Arabic'", 'عربي')) throw new Error(t('rpt.fontError'));
    })(), timeout]);
    if (run !== runRef.current) return;
    setPhase({ k: 'ready', filename: doc.filename });
    print(doc.title);
  };

  const start = () => {
    destroy();
    const run = runRef.current;
    setPhase({ k: 'preparing' });
    prepare.mutate({ id: snapshotId, data: { language: lang } }, {
      onSuccess: (report) => {
        if (run !== runRef.current) return;
        setPhase({ k: 'rendering' });
        layout(report, run).catch((e: unknown) => {
          if (run !== runRef.current) return;
          destroy();
          setPhase({ k: 'error', msg: e instanceof Error ? e.message : t('rpt.errorTitle') });
        });
      },
      onError: (e) => { if (run === runRef.current) setPhase({ k: 'error', msg: localizeError(t, e) }); },
    });
  };

  const close = () => { destroy(); setPhase({ k: 'idle' }); };
  const busy = phase.k === 'preparing' || phase.k === 'rendering';

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="rpt-title" data-testid="section-report-export">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 max-w-xl">
          <h2 id="rpt-title" className="flex items-center gap-2 text-sm font-semibold"><FileDown className="size-4 text-primary" aria-hidden="true" />{t('rpt.title')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('rpt.lead')}</p>
          <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-primary" data-testid="text-report-frozen-note"><Snowflake className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{t('rpt.frozen')}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end md:shrink-0">
          <fieldset disabled={busy}>
            <legend className="mb-1 text-[11px] font-medium text-muted-foreground">{t('rpt.language')}</legend>
            <div role="radiogroup" aria-label={t('rpt.language')} className="inline-flex rounded-md border bg-background p-0.5" data-testid="radiogroup-report-language">
              {(['en', 'ar'] as const).map((l) => (
                <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => setLang(l)}
                  onKeyDown={(e) => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); setLang(l === 'en' ? 'ar' : 'en'); } }}
                  tabIndex={lang === l ? 0 : -1} lang={l}
                  className={cn('min-h-11 min-w-20 rounded px-3 text-sm font-medium transition-colors', lang === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover-elevate')}
                  data-testid={`radio-report-language-${l}`}>{t(`rpt.${l}`)}</button>
              ))}
            </div>
          </fieldset>
          <Button onClick={start} disabled={busy} className="min-h-11 gap-2" data-testid="button-download-pdf">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Printer className="size-4" aria-hidden="true" />}{t('rpt.download')}
          </Button>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground" data-testid="text-report-dialog-note">{t('rpt.dialogNote')} {t('rpt.browserNote')}</p>

      <div aria-live="polite" className="mt-3 empty:hidden">
        {busy && <p role="status" className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm" data-testid="state-report-loading"><Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />{phase.k === 'preparing' ? t('rpt.preparing') : t('rpt.rendering')}</p>}
        {phase.k === 'ready' && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-accent p-3 text-sm" data-testid="state-report-ready">
            <span className="flex-1 min-w-48">{t('rpt.ready')} <span className="block text-xs text-muted-foreground">{t('rpt.filename')}: <bdi dir="ltr" className="break-all font-mono" data-testid="text-report-filename">{phase.filename}</bdi></span></span>
            <Button variant="outline" onClick={() => print(docTitleOf(phase.filename))} className="min-h-11 gap-2" data-testid="button-report-print-again"><Printer className="size-4" aria-hidden="true" />{t('rpt.printAgain')}</Button>
            <Button variant="ghost" onClick={close} className="min-h-11 gap-2" data-testid="button-report-close"><X className="size-4" aria-hidden="true" />{t('rpt.close')}</Button>
          </div>
        )}
        {phase.k === 'error' && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-[color-mix(in_srgb,var(--status-red)_40%,transparent)] p-3 text-sm" data-testid="state-report-error">
            <AlertTriangle className="size-4 text-status-red" aria-hidden="true" />
            <span className="flex-1 min-w-48"><span className="font-medium">{t('rpt.errorTitle')}</span> <span data-testid="text-report-error">{phase.msg}</span></span>
            <Button variant="outline" onClick={start} className="min-h-11 gap-2" data-testid="button-report-retry"><RotateCcw className="size-4" aria-hidden="true" />{t('rpt.retry')}</Button>
          </div>
        )}
      </div>
    </section>
  );
}
