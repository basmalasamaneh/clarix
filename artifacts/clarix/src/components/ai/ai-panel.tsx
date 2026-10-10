import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ListChecks, RotateCcw, ShieldCheck, Sparkles, FileSearch } from 'lucide-react';
import {
  getGetAiConsentQueryKey,
  useExplainAi,
  useGetAiConsent,
  type AiExplanation,
  type AiFact,
  type Session,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { NumText, Qty, useLang } from '@/components/num-text';
import { QualityStatusBadge } from '@/components/quality/status-badge';
import { useSource } from '@/components/source/source-context';
import { localizeError, useCsrfRequest } from '@/lib/session';
import '@/lib/phase16-i18n';

type Ctx = { snapshotId: string; a?: never; b?: never } | { a: string; b: string; snapshotId?: never };
type Props = Ctx & { session: Session };

const btn = 'min-h-11 gap-2';

/** Reusable AI explanation panel. Keyed by context/language/user/factory so state never leaks between them. */
export function AIPanel(props: Props) {
  const lang = useLang();
  const ctxKey = props.snapshotId ? `s:${props.snapshotId}` : `c:${props.a}:${props.b}`;
  return <Inner key={`${ctxKey}|${lang}|${props.session.user?.id}|${props.session.activeFactoryId}`} {...props} />;
}

function Shell({ children, state }: { children: React.ReactNode; state: string }) {
  const { t } = useTranslation();
  return (
    <section className="fade-up rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="ai-title" data-testid="panel-ai" data-state={state}>
      <h2 id="ai-title" className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" aria-hidden="true" />{t('ai.title')}</h2>
      <p className="text-[11px] text-muted-foreground">{t('ai.lead')}</p>
      <div className="mt-3 space-y-3">{children}</div>
      <p className="mt-3 border-s-2 border-[var(--series-stop)] ps-3 text-xs text-muted-foreground" data-testid="text-ai-downtime-note">{t('ai.downtime')}</p>
    </section>
  );
}

function Inner(props: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const request = useCsrfRequest();
  const consent = useGetAiConsent({ query: {
    queryKey: [...getGetAiConsentQueryKey(), props.session.activeFactoryId, props.session.user?.id],
    staleTime: 0,
    refetchOnWindowFocus: 'always',
    retry: false,
  }, request: { credentials: 'include' } });
  const explain = useExplainAi({ mutation: { gcTime: 0 }, request });

  const run = () => {
    const ctx = props.snapshotId ? { snapshotId: props.snapshotId } : { a: props.a, b: props.b };
    explain.mutate({ data: { language: lang, ...ctx } });
  };

  if (consent.isLoading) {
    return <Shell state="loading"><div role="status" aria-busy="true" className="space-y-2" data-testid="state-ai-loading"><div className="h-4 w-2/3 animate-pulse rounded bg-muted" /><div className="h-11 w-48 animate-pulse rounded-md bg-muted" /></div></Shell>;
  }
  if (consent.isError || !consent.data) {
    return (
      <Shell state="consent-error">
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm" data-testid="state-ai-consent-error">
          <AlertTriangle className="size-4 text-status-red" aria-hidden="true" /><span className="flex-1">{t('ai.consentError')} {localizeError(t, consent.error)}</span>
          <Button variant="outline" onClick={() => consent.refetch()} disabled={consent.isFetching} className={btn} data-testid="button-ai-retry-consent"><RotateCcw className="size-4" aria-hidden="true" />{t('ai.retry')}</Button>
        </div>
      </Shell>
    );
  }
  if (!consent.data.configured) {
    return <Shell state="unconfigured"><p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground" data-testid="state-ai-unconfigured">{t('ai.unconfigured')}</p></Shell>;
  }
  if (!consent.data.enabled) {
    return (
      <Shell state="off">
        <div className="rounded-lg border border-dashed p-3 text-sm" data-testid="state-ai-off">
          <p>{t('ai.off')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('ai.offManager')}</p>
        </div>
      </Shell>
    );
  }

  const res = explain.data;
  return (
    <Shell state={explain.isPending ? 'working' : explain.isError ? 'error' : res ? `result-${res.status}` : 'ready'}>
      {explain.isPending ? (
        <div role="status" aria-busy="true" className="space-y-2" data-testid="state-ai-working">
          <p className="text-xs text-muted-foreground">{t('ai.working')}</p>
          {[0, 1, 2].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-muted" style={{ width: `${88 - i * 14}%` }} />)}
        </div>
      ) : explain.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm" data-testid="state-ai-request-error">
          <AlertTriangle className="size-4 text-status-red" aria-hidden="true" /><span className="flex-1">{t('ai.requestError')} {localizeError(t, explain.error)}</span>
          <Button variant="outline" onClick={run} className={btn} data-testid="button-ai-retry"><RotateCcw className="size-4" aria-hidden="true" />{t('ai.retry')}</Button>
        </div>
      ) : res ? (
        <ResultView res={res} onAgain={run} />
      ) : (
        <Button onClick={run} className={btn} data-testid="button-ai-explain"><Sparkles className="size-4" aria-hidden="true" />{t('ai.explain')}</Button>
      )}
    </Shell>
  );
}

function ResultView({ res, onAgain }: { res: AiExplanation; onAgain: () => void }) {
  const { t } = useTranslation();
  const [showFacts, setShowFacts] = useState(false);
  const factById = new Map(res.facts.map((f) => [f.id, f]));

  if (res.status !== 'verified') {
    return (
      <div className="rounded-lg border bg-muted/40 p-3" data-testid={`state-ai-${res.status}`}>
        <p className="text-xs font-medium text-status-amber" data-testid="text-ai-reason">{t(`ai.reason.${res.status}`)}</p>
        {res.retryAfter > 0 && <p className="mt-1 text-xs text-muted-foreground" data-testid="text-ai-retry-after">{t('ai.retryAfter', { count: res.retryAfter })}</p>}
        {res.fallback && (
          <>
            <p className="mt-2 text-xs font-semibold">{t('ai.fallbackTitle')}</p>
            <p className="mt-1 text-sm leading-relaxed" data-testid="text-ai-fallback"><NumText text={res.fallback} /></p>
          </>
        )}
        {res.status !== 'off' && <Button variant="outline" onClick={onAgain} className={`${btn} mt-3`} data-testid="button-ai-again"><RotateCcw className="size-4" aria-hidden="true" />{t('ai.again')}</Button>}
      </div>
    );
  }

  return (
    <div data-testid="state-ai-verified">
      <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-accent px-2.5 py-1 text-xs font-medium text-primary" data-testid="badge-ai-verified">
        <ShieldCheck className="size-3.5" aria-hidden="true" />{t('ai.badge')}
      </p>
      {res.cached && <p className="mt-1 text-[11px] text-muted-foreground" data-testid="text-ai-cached">{t('ai.cached')}</p>}
      <ol className="mt-3 space-y-2.5" data-testid="list-ai-statements">
        {res.statements.map((s, i) => (
          <li key={i} className="rounded-lg border p-3" data-testid={`card-ai-statement-${i}`}>
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground" data-testid={`text-ai-type-${i}`}>{t(`ai.type.${s.type}`)}</span>
            <p className="mt-1 text-sm leading-relaxed" data-testid={`text-ai-statement-${i}`}><NumText text={s.text} /></p>
            {s.refs.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {s.refs.map((r) => { const f = factById.get(r); return f ? <SourceBtn key={r} fact={f} testId={`button-ai-source-${i}-${r}`} /> : null; })}
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        {res.facts.length > 0 && (
          <Button variant="outline" onClick={() => setShowFacts((v) => !v)} aria-expanded={showFacts} aria-controls="ai-facts" className={btn} data-testid="button-ai-toggle-facts">
            <ListChecks className="size-4" aria-hidden="true" />{showFacts ? t('ai.hideFacts') : t('ai.showFacts')}
          </Button>
        )}
        <Button variant="ghost" onClick={onAgain} className={btn} data-testid="button-ai-again"><RotateCcw className="size-4" aria-hidden="true" />{t('ai.again')}</Button>
      </div>
      {showFacts && (
        <div id="ai-facts" className="mt-3 rounded-lg border" data-testid="list-ai-facts">
          <p className="border-b bg-muted px-3 py-2 text-xs font-semibold">{t('ai.factsTitle')}</p>
          <ul className="divide-y">
            {res.facts.filter(f=>res.statements.some(s=>s.refs.includes(f.id))).map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm" data-testid={`row-ai-fact-${f.id}`}>
                <span className="flex-1 min-w-40" dir="auto">{f.label}</span>
                <span data-testid={`text-ai-fact-value-${f.id}`}>{f.value === null ? <span className="text-muted-foreground">{t('ai.na')}</span> : <Qty value={f.value} unit={f.unit} fallbackUnit={f.unit} />}</span>
                <QualityStatusBadge status={f.status} size="sm" testId={`status-ai-fact-${f.id}`} />
                <SourceBtn fact={f} testId={`button-ai-fact-source-${f.id}`} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SourceBtn({ fact, testId }: { fact: AiFact; testId: string }) {
  const { t } = useTranslation();
  const { openSource } = useSource();
  return (
    <Button variant="outline" size="sm" className="min-h-11 gap-1.5"
      onClick={(e) => openSource({ kind: 'metric', id: fact.source.runId, metric: fact.source.metric, snapshot: fact.source.snapshotId }, e.currentTarget)}
      aria-label={`${t('ai.showSource')}: ${fact.label}`} data-testid={testId}>
      <FileSearch className="size-4" aria-hidden="true" />{t('ai.showSource')}
    </Button>
  );
}
