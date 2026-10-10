import { useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowRight, FileSpreadsheet, FileUp, Loader2, RotateCcw, Upload, X } from 'lucide-react';
import {
  getGetImportQueryKey,
  getListImportsQueryKey,
  useCreateImport,
  useFinalizeImport,
  useGetImportConfig,
  getGetImportConfigQueryKey,
  type ImportDetail,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useCsrfRequest } from '@/lib/session';
import { formatBytes } from '@/lib/import-model';
import { ErrorNote, Raw, Section } from './shared';

type Phase = { kind: 'idle' } | { kind: 'creating' } | { kind: 'sending'; name: string; done: number; total: number } | { kind: 'reading' };

class UploadError extends Error {
  constructor(public fileName: string) {
    super('upload');
  }
}

export function NewImport({ onCreated }: { onCreated: (d: ImportDetail) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const req = useCsrfRequest();
  const cfg = useGetImportConfig({ query: { queryKey: getGetImportConfigQueryKey(), staleTime: 300_000 }, request: { credentials: 'include' } });
  const create = useCreateImport({ request: req });
  const finalize = useFinalizeImport({ request: req });
  const inputRef = useRef<HTMLInputElement>(null);
  const [sourceName, setSourceName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);
  const [over, setOver] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<unknown>(null);
  const [draft, setDraft] = useState<ImportDetail | null>(null);

  const maxFiles = cfg.data?.maxFiles ?? 4;
  const maxFile = cfg.data?.maxFileBytes;
  const maxTotal = cfg.data?.maxTotalBytes;
  const busy = phase.kind !== 'idle';

  function addFiles(list: FileList | null) {
    if (!list) return;
    const msgs: string[] = [];
    const next = [...files];
    for (const f of Array.from(list)) {
      const isCsv = /\.(csv|txt)$/i.test(f.name) || f.type === 'text/csv';
      if (!isCsv) msgs.push(t('imp.upload.notCsv', { name: f.name }));
      else if (f.size === 0) msgs.push(t('imp.upload.empty', { name: f.name }));
      else if (maxFile && f.size > maxFile) msgs.push(t('imp.upload.tooBig', { name: f.name, limit: formatBytes(maxFile) }));
      else if (next.some((x) => x.name === f.name)) msgs.push(t('imp.upload.duplicateName', { name: f.name }));
      else if (next.length >= maxFiles) msgs.push(t('imp.upload.tooMany', { max: maxFiles }));
      else next.push(f);
    }
    setFiles(next);
    setProblems(msgs);
    setDraft(null);
  }

  const total = files.reduce((s, f) => s + f.size, 0);
  const blocking: string[] = [];
  if (files.length < 2) blocking.push(t('imp.upload.tooFew'));
  if (maxTotal && total > maxTotal) blocking.push(t('imp.upload.totalTooBig', { limit: formatBytes(maxTotal) }));
  const sourceMissing = !sourceName.trim();

  async function sendAll(d: ImportDetail) {
    const targets = d.files.filter((f) => f.uploadUrl);
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const file = files.find((f) => f.name === target.name);
      if (!file || !target.uploadUrl) throw new UploadError(target.name);
      setPhase({ kind: 'sending', name: target.name, done: i, total: targets.length });
      let ok = false;
      try {
        const res = await fetch(target.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'text/csv' } });
        ok = res.ok;
      } catch {
        ok = false;
      }
      if (!ok) throw new UploadError(target.name);
    }
  }

  async function start() {
    setTouched(true);
    if (blocking.length || sourceMissing || busy) return;
    setError(null);
    try {
      let d = draft;
      if (!d) {
        setPhase({ kind: 'creating' });
        d = await create.mutateAsync({
          data: { sourceName: sourceName.trim(), files: files.map((f) => ({ name: f.name, size: f.size, mime: f.type || 'text/csv' })) },
        });
        setDraft(d);
      }
      await sendAll(d);
      setPhase({ kind: 'reading' });
      const fin = await finalize.mutateAsync({ id: d.id });
      qc.setQueryData(getGetImportQueryKey(fin.id), fin);
      void qc.invalidateQueries({ queryKey: getListImportsQueryKey() });
      onCreated(fin);
    } catch (e) {
      setError(e);
    } finally {
      setPhase({ kind: 'idle' });
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!busy) addFiles(e.dataTransfer.files);
  };

  return (
    <Section title={t('imp.upload.title')} body={t('imp.upload.body', { max: maxFiles })} testId="section-upload">
      <div className="space-y-5">
        <div className="max-w-md space-y-1.5">
          <Label htmlFor="source-name">{t('imp.upload.sourceName')}</Label>
          <Input
            id="source-name"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            maxLength={120}
            disabled={busy}
            className="h-11"
            aria-invalid={touched && sourceMissing ? true : undefined}
            aria-describedby="source-hint"
            data-testid="input-source-name"
          />
          <p id="source-hint" className={cn('text-xs', touched && sourceMissing ? 'text-status-red' : 'text-muted-foreground')}>
            {touched && sourceMissing ? t('imp.upload.sourceRequired') : t('imp.upload.sourceHint')}
          </p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          data-testid="dropzone"
          className={cn(
            'ledger-grid relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors',
            over ? 'border-primary bg-accent' : 'border-border bg-muted/40',
          )}
        >
          <div className="flex size-12 items-center justify-center rounded-full border bg-card text-primary shadow-sm">
            <FileUp className="size-5" aria-hidden="true" />
          </div>
          <p className="font-medium">{t('imp.upload.drop')}</p>
          <p className="text-xs text-muted-foreground">{t('imp.upload.or')}</p>
          <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={() => inputRef.current?.click()} disabled={busy} data-testid="button-pick-files">
            <Upload className="size-4" aria-hidden="true" />
            {t('imp.upload.pick')}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv,.txt"
            multiple
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
            data-testid="input-files"
          />
          {maxFile && maxTotal && <p className="num text-xs text-muted-foreground">{t('imp.upload.limits', { file: formatBytes(maxFile), total: formatBytes(maxTotal) })}</p>}
        </div>

        {problems.length > 0 && (
          <ul className="space-y-1 text-sm text-status-red" role="alert" data-testid="list-file-problems">
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}

        {files.length > 0 && (
          <ul className="divide-y rounded-lg border" data-testid="list-selected-files">
            {files.map((f, i) => {
              const sending = phase.kind === 'sending' && phase.name === f.name;
              return (
                <li key={f.name} className="flex min-w-0 items-center gap-3 px-3 py-2">
                  <FileSpreadsheet className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <Raw className="min-w-0 flex-1 truncate">{f.name}</Raw>
                  {sending && <Loader2 className="size-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />}
                  <span className="num shrink-0 text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0"
                    disabled={busy}
                    onClick={() => {
                      setFiles(files.filter((_, j) => j !== i));
                      setDraft(null);
                    }}
                    aria-label={t('imp.upload.remove', { name: f.name })}
                    data-testid={`button-remove-file-${i}`}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {touched && blocking.length > 0 && (
          <ul className="space-y-1 text-sm text-status-red">
            {blocking.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}

        {error != null && (
          error instanceof UploadError ? (
            <div role="alert" className="rounded-lg border border-[color-mix(in_srgb,var(--status-red)_35%,transparent)] p-4 text-sm" data-testid="status-upload-failed">
              {t('imp.upload.uploadFailed', { name: error.fileName })}
            </div>
          ) : (
            <ErrorNote error={error} />
          )
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-h-5 text-sm text-muted-foreground" aria-live="polite" data-testid="status-upload-phase">
            {phase.kind === 'creating' && t('imp.upload.creating')}
            {phase.kind === 'sending' && (
              <span>
                {t('imp.upload.sending', { name: phase.name })} <span className="num">({phase.done + 1}/{phase.total})</span>
              </span>
            )}
            {phase.kind === 'reading' && t('imp.upload.reading')}
          </p>
          <Button className="min-h-11 gap-2" onClick={start} disabled={busy} data-testid="button-start-upload">
            {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : error ? <RotateCcw className="size-4" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
            {error && !busy ? t('imp.errors.retry') : t('imp.upload.start')}
          </Button>
        </div>
      </div>
    </Section>
  );
}

export function UploadReview({ detail, onContinue, canEdit }: { detail: ImportDetail; onContinue: () => void; canEdit: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const req = useCsrfRequest();
  const finalize = useFinalizeImport({ request: req });
  const [active, setActive] = useState(0);

  if (!detail.finalized) {
    return (
      <Section title={t('imp.upload.interruptedTitle')} body={t('imp.upload.interruptedBody')} testId="section-interrupted">
        {finalize.error != null && <div className="mb-4"><ErrorNote error={finalize.error} /></div>}
        <div className="flex flex-col gap-3 sm:flex-row">
          {canEdit && (
            <Button
              className="min-h-11 gap-2"
              disabled={finalize.isPending}
              onClick={() =>
                finalize.mutate(
                  { id: detail.id },
                  {
                    onSuccess: (d) => {
                      qc.setQueryData(getGetImportQueryKey(d.id), d);
                      void qc.invalidateQueries({ queryKey: getListImportsQueryKey() });
                    },
                  },
                )
              }
              data-testid="button-finish-finalize"
            >
              {finalize.isPending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RotateCcw className="size-4" aria-hidden="true" />}
              {t('imp.upload.finish')}
            </Button>
          )}
          <Link href="/imports?id=new" className="inline-flex min-h-11 items-center justify-center rounded-md border px-4 text-sm font-medium hover-elevate" data-testid="link-new-import">
            {t('imp.newImport')}
          </Link>
        </div>
      </Section>
    );
  }

  const file = detail.files[Math.min(active, detail.files.length - 1)];
  const preview = file?.preview ?? [];
  const header = file?.header ?? [];

  return (
    <Section
      title={t('imp.upload.filesTitle')}
      testId="section-upload-review"
      aside={
        <Button className="min-h-11 gap-2" onClick={onContinue} data-testid="button-continue-map">
          {t('imp.upload.continue')}
          <ArrowRight className="size-4 rtl-flip" aria-hidden="true" />
        </Button>
      }
    >
      <div className="flex gap-2 overflow-x-auto pb-2" role="tablist">
        {detail.files.map((f, i) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            data-testid={`tab-file-${i}`}
            className={cn(
              'flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm transition-colors',
              i === active ? 'border-primary bg-accent text-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            <FileSpreadsheet className="size-4 text-primary" aria-hidden="true" />
            <Raw className="max-w-[14rem] truncate">{f.name}</Raw>
          </button>
        ))}
      </div>

      {file && (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4" data-testid="file-meta">
            <div className="rounded-md bg-muted px-3 py-2">
              <dt className="text-xs text-muted-foreground">{t('imp.upload.encoding')}</dt>
              <dd className="num font-mono" data-testid="text-encoding">{file.encoding ?? '—'}</dd>
            </div>
            <div className="rounded-md bg-muted px-3 py-2">
              <dt className="text-xs text-muted-foreground">{t('imp.upload.delimiter')}</dt>
              <dd data-testid="text-delimiter">
                {file.delimiter ? t(`imp.upload.delims.${file.delimiter === '\t' ? '\t' : file.delimiter}`, { defaultValue: file.delimiter }) : '—'}
              </dd>
            </div>
            <div className="rounded-md bg-muted px-3 py-2">
              <dt className="text-xs text-muted-foreground">{t('imp.upload.rows')}</dt>
              <dd className="num" data-testid="text-row-count">{file.rowCount ?? '—'}</dd>
            </div>
            <div className="min-w-0 rounded-md bg-muted px-3 py-2">
              <dt className="text-xs text-muted-foreground">{t('imp.upload.hash')}</dt>
              <dd className="num break-all font-mono text-xs leading-5" title={file.sha256} data-testid="text-sha256">
                {file.sha256 ? `${file.sha256.slice(0, 12)}…` : '—'}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">{t('imp.upload.previewOf', { count: preview.length, name: file.name })}</p>
          {preview.length === 0 ? (
            <p className="mt-2 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{t('imp.upload.noPreview')}</p>
          ) : (
            <div className="mt-2 min-w-0 overflow-x-auto rounded-lg border" data-testid="table-preview">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="sticky start-0 bg-muted px-3 py-2 text-start font-medium">{t('imp.upload.line')}</th>
                    {header.map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-2 text-start font-medium">
                        <Raw>{h}</Raw>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.map((r) => (
                    <tr key={r.start_line}>
                      <td className="num sticky start-0 bg-card px-3 py-1.5 text-xs text-muted-foreground">
                        {r.start_line}
                      </td>
                      {header.map((h) => (
                        <td key={h} className="whitespace-nowrap px-3 py-1.5">
                          <Raw>{r.cells[h] ?? ''}</Raw>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Section>
  );
}
