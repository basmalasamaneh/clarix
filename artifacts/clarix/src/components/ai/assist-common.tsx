import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowUpRight, ChevronDown, FileSearch, Lightbulb, RotateCcw, ShieldCheck, Sparkles, Cpu } from 'lucide-react';
import {
  getGetAiConsentQueryKey,
  getGetSessionQueryKey,
  useGetAiConsent,
  type AiAssistBlock,
  type AiAssistResult,
  type AiConsent,
  type AiFact,
  type Session,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { NumText, Qty } from '@/components/num-text';
import { QualityStatusBadge } from '@/components/quality/status-badge';
import { useSource } from '@/components/source/source-context';
import { localizeError } from '@/lib/session';
import { cn } from '@/lib/utils';
import '@/lib/phase17-i18n';

export const btn44 = 'min-h-11 gap-2';
export const CONSENT_VERSION = 2;

export type ConsentState = 'loading' | 'error' | 'unconfigured' | 'off' | 'reconfirm' | 'on';

export function consentStateOf(c: AiConsent | undefined): Exclude<ConsentState, 'loading' | 'error'> {
  if (!c || !c.configured) return 'unconfigured';
  if (!c.enabled) return 'off';
  const required = c.requiredVersion ?? CONSENT_VERSION;
  if ((c.version ?? 1) < required) return 'reconfirm';
  return 'on';
}

/** Consent for the signed-in user/factory. Session is read from the cache, same as the CSRF helper. */
export function useAiConsentState() {
  const qc = useQueryClient();
  const session = qc.getQueryData<Session>(getGetSessionQueryKey());
  const q = useGetAiConsent({ query: {
    queryKey: [...getGetAiConsentQueryKey(), session?.activeFactoryId, session?.user?.id],
    staleTime: 0,
    refetchOnWindowFocus: 'always',
    retry: false,
  }, request: { credentials: 'include' } });
  const state: ConsentState = q.isLoading ? 'loading' : q.isError || !q.data ? 'error' : consentStateOf(q.data);
  return { q, state, scope: `${session?.activeFactoryId ?? ''}|${session?.user?.id ?? ''}` };
}

export function ConsentNote({ state, onRetry }: { state: ConsentState; onRetry: () => void }) {
  const { t } = useTranslation();
  if (state === 'on' || state === 'loading') return null;
  if (state === 'error') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-xs" data-testid="state-assist-consent-error">
        <AlertTriangle className="size-4 text-status-red" aria-hidden="true" /><span className="flex-1">{t('as.consent.error')}</span>
        <Button variant="outline" size="sm" onClick={onRetry} className="min-h-11 gap-1.5" data-testid="button-assist-consent-retry"><RotateCcw className="size-4" aria-hidden="true" />{t('as.retry')}</Button>
      </div>
    );
  }
  return (
    <p className={cn('rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground', state === 'reconfirm' && 'border-[color-mix(in_srgb,var(--status-amber)_45%,var(--border))] text-foreground')} data-testid={`state-assist-consent-${state}`}>
      {t(`as.consent.${state}`)}
    </p>
  );
}

/** Small frame shared by every Phase 17 assistant surface. */
export function AssistFrame({ title, lead, icon: Icon = Sparkles, children, testId, state, aside }: {
  title: string; lead?: string; icon?: typeof Sparkles; children: ReactNode; testId: string; state?: string; aside?: ReactNode;
}) {
  const id = `${testId}-title`;
  return (
    <section className="fade-up rounded-xl border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-5" aria-labelledby={id} data-testid={testId} data-state={state}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={id} className="flex items-center gap-2 text-sm font-semibold"><Icon className="size-4 text-primary" aria-hidden="true" />{title}</h2>
          {lead && <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{lead}</p>}
        </div>
        {aside}
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export function WorkingState({ testId }: { testId: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" className="space-y-2" data-testid={testId}>
      <p className="text-xs text-muted-foreground">{t('as.working')}</p>
      {[0, 1, 2].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-muted" style={{ width: `${86 - i * 15}%` }} />)}
    </div>
  );
}

export function RequestError({ error, onRetry, testId }: { error: unknown; onRetry: () => void; testId: string }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm" data-testid={testId}>
      <AlertTriangle className="size-4 text-status-red" aria-hidden="true" /><span className="flex-1">{t('as.requestError')} {localizeError(t, error)}</span>
      <Button variant="outline" onClick={onRetry} className={btn44} data-testid={`${testId}-retry`}><RotateCcw className="size-4" aria-hidden="true" />{t('as.retry')}</Button>
    </div>
  );
}

/** Maps a server href to an in-app route. Server may use /data-quality; the app route is /quality. */
export function appHref(href?: string): string | null {
  if (!href || !href.startsWith('/') || href.startsWith('//')) return null;
  return href.replace(/^\/data-quality(?=[/?#]|$)/, '/quality');
}

type SourceItem = { key: string; label: string; fact: AiFact };

/** Unique, labelled source targets for a block. Facts without a run id carry no source row. */
export function sourceItems(facts: AiFact[]): SourceItem[] {
  const seen = new Set<string>();
  const labels = new Map<string, number>();
  const out: SourceItem[] = [];
  for (const f of facts) {
    if (!f.source?.runId || !f.source.metric) continue;
    const key = `${f.source.runId}|${f.source.metric}|${f.source.snapshotId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const n = (labels.get(f.label) ?? 0) + 1;
    labels.set(f.label, n);
    out.push({ key, label: n > 1 ? `${f.label} (${n})` : f.label, fact: f });
  }
  return out;
}

/** One compact "Sources (n)" control listing n separately labelled links. */
export function SourcesMenu({ facts, title, testId }: { facts: AiFact[]; title: string; testId: string }) {
  const { t } = useTranslation();
  const { openSource } = useSource();
  const items = sourceItems(facts);
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-11 gap-1.5" aria-label={t('as.sourcesFor', { title })} data-testid={testId}>
          <FileSearch className="size-4" aria-hidden="true" />
          <span className="num">{t('as.sources', { count: items.length })}</span>
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-[min(22rem,calc(100vw-2rem))]">
        <DropdownMenuLabel className="text-[11px] text-muted-foreground">{t('as.sourcesList')}</DropdownMenuLabel>
        {items.map((it, i) => (
          <DropdownMenuItem key={it.key} className="min-h-11 cursor-pointer gap-2"
            onSelect={() => openSource({ kind: 'metric', id: it.fact.source.runId, metric: it.fact.source.metric, snapshot: it.fact.source.snapshotId })}
            aria-label={t('as.sourceItem', { label: it.label })} data-testid={`${testId}-item-${i}`}>
            <FileSearch className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate" dir="auto">{it.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const TYPE_TONE: Record<AiAssistBlock['type'], string> = {
  FACT: 'border-s-primary',
  HYPOTHESIS: 'border-s-[var(--status-amber)] border-dashed',
  SUGGESTION: 'border-s-[var(--series-good)]',
};

function BlockCard({ block, idx, prefix }: { block: AiAssistBlock; idx: number; prefix: string }) {
  const { t } = useTranslation();
  const shown = block.facts.filter((f) => f.value !== undefined);
  return (
    <li className={cn('rounded-lg border border-s-4 bg-background p-3', TYPE_TONE[block.type])} data-testid={`${prefix}-block-${idx}`} data-type={block.type}>
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {block.type === 'HYPOTHESIS' && <Lightbulb className="size-3.5" aria-hidden="true" />}
        {t(`as.blockType.${block.type}`)}
      </span>
      {block.title && <h3 className="mt-1 text-sm font-semibold" dir="auto" data-testid={`${prefix}-block-title-${idx}`}><NumText text={block.title} /></h3>}
      {block.text && <p className="mt-1 min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-relaxed" dir="auto" data-testid={`${prefix}-block-text-${idx}`}><NumText text={block.text} /></p>}
      {shown.length > 0 && (
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          {shown.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-x-2 gap-y-1" data-testid={`${prefix}-fact-${idx}-${f.id}`}>
              <dt className="text-muted-foreground" dir="auto">{f.label}</dt>
              <dd className="flex items-center gap-1.5 font-medium">
                {f.value === null ? <span className="text-muted-foreground">{t('as.na')}</span> : <Qty value={f.value} unit={f.unit} fallbackUnit={f.unit} />}
                <QualityStatusBadge status={f.status} size="sm" />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {(appHref(block.href) || sourceItems(block.facts).length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <SourcesMenu facts={block.facts} title={block.title || t(`as.blockType.${block.type}`)} testId={`${prefix}-sources-${idx}`} />
          {appHref(block.href) && (
            <Link href={appHref(block.href)!} className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-primary hover-elevate" aria-label={`${t('as.openLink')}: ${block.title}`} data-testid={`${prefix}-link-${idx}`}>
              {t('as.openLink')}<ArrowUpRight className="size-4 rtl-flip" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

/** Renders any AiAssistResult: server-authored blocks plus status reasons. Nothing is computed here. */
export function AssistResultView({ res, prefix, max, onRetry, footer }: { res: AiAssistResult; prefix: string; max?: number; onRetry?: () => void; footer?: ReactNode }) {
  const { t } = useTranslation();
  const blocks = max ? res.blocks.slice(0, max) : res.blocks;
  const ai = res.status === 'verified';
  const ok = res.status === 'code' || ai;
  return (
    <div className="space-y-3" data-testid={`${prefix}-result`} data-status={res.status}>
      {ok ? (
        <p className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium', ai ? 'border-primary/30 bg-accent text-primary' : 'text-muted-foreground')} data-testid={`${prefix}-badge`}>
          {ai ? <ShieldCheck className="size-3.5" aria-hidden="true" /> : <Cpu className="size-3.5" aria-hidden="true" />}
          {ai ? t('as.label') : t('as.codeLabel')}
        </p>
      ) : (
        <div className="rounded-lg border bg-muted/40 p-3" data-testid={`${prefix}-status-${res.status}`}>
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-xs font-medium text-status-amber" dir="auto">{res.status==='unsupported'&&res.message?res.message:t(`as.status.${res.status}`)}</p>
          {res.status!=='unsupported'&&res.message && <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere] text-xs text-muted-foreground" dir="auto">{res.message}</p>}
          {res.retryAfter > 0 && <p className="mt-1 text-xs text-muted-foreground">{t('as.retryAfter', { count: res.retryAfter })}</p>}
          {onRetry && (res.status === 'quota' || res.status === 'unavailable' || res.status === 'error') && (
            <Button variant="outline" onClick={onRetry} className={`${btn44} mt-2`} data-testid={`${prefix}-again`}><RotateCcw className="size-4" aria-hidden="true" />{t('as.retry')}</Button>
          )}
        </div>
      )}
      {blocks.length > 0 ? (
        <ol className="space-y-2.5" data-testid={`${prefix}-blocks`}>
          {blocks.map((b, i) => <BlockCard key={b.id || i} block={b} idx={i} prefix={prefix} />)}
        </ol>
      ) : ok ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground" data-testid={`${prefix}-empty`}>{t('as.empty')}</p>
      ) : null}
      {footer}
    </div>
  );
}
