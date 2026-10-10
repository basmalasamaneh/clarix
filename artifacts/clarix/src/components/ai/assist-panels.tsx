import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Compass, ListOrdered, MessageSquareText, SendHorizontal, Sparkles, Stethoscope, X } from 'lucide-react';
import { useAssistAi, type AiAssistInput } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Pager } from '@/components/imports/shared';
import { useLang } from '@/components/num-text';
import { useCsrfRequest } from '@/lib/session';
import { cn } from '@/lib/utils';
import {
  AssistFrame, AssistResultView, ConsentNote, RequestError, WorkingState, btn44, useAiConsentState,
} from '@/components/ai/assist-common';

type Params = Omit<AiAssistInput, 'task' | 'language' | 'question' | 'useAi'>;
export type AskChip = { key: string; label: string; params: Params };
/** Entity context sent with a typed question (never an intent). */
export type AskContext = Pick<AiAssistInput, 'a' | 'b' | 'runId' | 'snapshotId'>;
const MAX = 500;

/** Code chips that work with AI off. */
export function useBaseChips(): AskChip[] {
  const { t } = useTranslation();
  return [
    { key: 'counts', label: t('as.ask.chip.counts'), params: { intent: 'counts' } },
    { key: 'highest-scrap', label: t('as.ask.chip.highestScrap'), params: { intent: 'extreme', metric: 'scrap_rate_pct', direction: 'highest' } },
    { key: 'longest-changeover', label: t('as.ask.chip.longestChangeover'), params: { intent: 'extreme', metric: 'changeover_min', direction: 'highest' } },
    { key: 'blocked', label: t('as.ask.chip.blocked'), params: { intent: 'runs', status: 'red' } },
  ];
}

/** One question, no history. Remounted by scope + language so state clears on change. */
export function AskBox(props: { scope: string; chips: AskChip[]; context?: AskContext }) {
  const lang = useLang();
  const { scope } = useAiConsentState();
  return <AskInner key={`${props.scope}|${lang}|${scope}`} {...props} />;
}

function AskInner({ chips, context }: { scope: string; chips: AskChip[]; context?: AskContext }) {
  const { t } = useTranslation();
  const lang = useLang();
  const request = useCsrfRequest();
  const consent = useAiConsentState();
  const assist = useAssistAi({ mutation: { gcTime: 0 }, request });
  const [question, setQuestion] = useState('');
  const [last, setLast] = useState<AiAssistInput | null>(null);
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const typedOn = consent.state === 'on';
  const tooLong = question.length > MAX;

  const send = (input: AiAssistInput) => { setLast(input); assist.mutate({ data: input }); };
  const ask = (e: FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || tooLong || !typedOn) return;
    setActiveChip(null);
    const ctx: AskContext = {};
    if (context?.a) ctx.a = context.a;
    if (context?.b) ctx.b = context.b;
    if (context?.runId) ctx.runId = context.runId;
    if (context?.snapshotId) ctx.snapshotId = context.snapshotId;
    send({ task: 'ask', language: lang, question: q, ...ctx, useAi: true });
  };
  const chip = (c: AskChip) => { setActiveChip(c.key); send({ task: 'ask', language: lang, ...c.params, useAi: false }); };
  const clear = () => { setQuestion(''); setLast(null); setActiveChip(null); assist.reset(); };

  return (
    <AssistFrame title={t('as.ask.title')} lead={t('as.ask.lead')} icon={MessageSquareText} testId="panel-ask" state={assist.isPending ? 'working' : assist.data ? `result-${assist.data.status}` : 'ready'}>
      {chips.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground" id="ask-chips-label">{t('as.ask.examples')}</p>
          <div className="mt-1.5 flex flex-wrap gap-2" role="group" aria-labelledby="ask-chips-label">
            {chips.map((c) => (
              <button key={c.key} type="button" onClick={() => chip(c)} disabled={assist.isPending} aria-pressed={activeChip === c.key}
                className={cn('min-h-11 rounded-full border px-3.5 text-start text-sm transition-colors hover-elevate disabled:opacity-60',
                  activeChip === c.key ? 'border-primary bg-accent font-medium text-primary' : 'bg-background')}
                data-testid={`chip-ask-${c.key}`}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={ask} className="space-y-2" data-testid="form-ask">
        <label htmlFor="ask-input" className="text-xs font-semibold">{t('as.ask.inputLabel')}</label>
        <Textarea id="ask-input" value={question} onChange={(e) => setQuestion(e.target.value.slice(0, MAX + 50))} rows={2} dir="auto"
          placeholder={t('as.ask.placeholder')} disabled={!typedOn} aria-invalid={tooLong} aria-describedby="ask-help"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(e); } }}
          autoComplete="off" className="min-h-11 resize-none" data-testid="input-ask" />
        <div id="ask-help" className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>{typedOn ? t('as.ask.providerNote') : t('as.ask.disabledHint')}</span>
          <span className={cn('num', tooLong && 'font-semibold text-status-red')} data-testid="text-ask-count">{t('as.ask.count', { count: question.length })}</span>
        </div>
        {tooLong && <p role="alert" className="text-xs text-status-red" data-testid="error-ask-too-long">{t('as.ask.tooLong')}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!typedOn || !question.trim() || tooLong || assist.isPending} className={btn44} data-testid="button-ask-submit">
            <SendHorizontal className="size-4 rtl-flip" aria-hidden="true" />{t('as.ask.submit')}
          </Button>
          {(question || last) && <Button type="button" variant="ghost" onClick={clear} className={btn44} data-testid="button-ask-clear"><X className="size-4" aria-hidden="true" />{t('as.ask.clear')}</Button>}
        </div>
      </form>

      <ConsentNote state={consent.state} onRetry={() => consent.q.refetch()} />

      <div aria-live="polite">
        {assist.isPending ? <WorkingState testId="state-ask-working" />
          : assist.isError ? <RequestError error={assist.error} onRetry={() => last && send(last)} testId="state-ask-error" />
          : assist.data ? <AssistResultView res={assist.data} prefix="ask" onRetry={() => last && send(last)} /> : null}
      </div>
    </AssistFrame>
  );
}

/** Data-quality guidance. Code guidance needs no AI; explain / rank are explicit AI actions. */
type QualityScope = Pick<AiAssistInput,'source'|'order'|'severity'|'group'|'includeArchived'>;
type QualityProps = { issueId?: string; importId?: string; testId?: string; filters?: QualityScope };
export function QualityAssistant(props: QualityProps) {
  const lang = useLang();
  const { scope } = useAiConsentState();
  return <QualityInner key={`${props.issueId ?? ''}|${props.importId ?? ''}|${lang}|${scope}|${JSON.stringify(props.filters)}`} {...props} />;
}

function QualityInner({ issueId, importId, filters, testId = 'panel-quality-assistant' }: QualityProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const request = useCsrfRequest();
  const consent = useAiConsentState();
  const assist = useAssistAi({ mutation: { gcTime: 0 }, request });
  const [last, setLast] = useState<AiAssistInput | null>(null);
  const aiOn = consent.state === 'on';

  const send = (useAi: boolean, page = 1) => {
    const input: AiAssistInput = { task: 'quality', language: lang, useAi, page, ...filters, ...(issueId ? { issueId } : {}), ...(importId ? { importId } : {}) };
    setLast(input);
    assist.mutate({ data: input });
  };
  const started = useRef(false);
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    sendRef.current(false);
  }, []);
  const res = assist.data;

  return (
    <AssistFrame title={t('as.quality.title')} lead={t('as.quality.lead')} icon={Stethoscope} testId={testId} state={assist.isPending ? 'working' : res ? `result-${res.status}` : 'ready'}>
      <div className="flex flex-wrap gap-2">
        <Button variant={res ? 'outline' : 'default'} onClick={() => send(false)} disabled={assist.isPending} className={btn44} data-testid={`${testId}-guidance`}>
          <ListOrdered className="size-4" aria-hidden="true" />{res ? t('as.quality.refresh') : t('as.quality.guidance')}
        </Button>
        <Button variant="outline" onClick={() => send(true)} disabled={!aiOn || assist.isPending} className={btn44} data-testid={`${testId}-ai`}>
          <Sparkles className="size-4" aria-hidden="true" />{issueId ? t('as.quality.explain') : t('as.quality.first')}
        </Button>
      </div>
      {aiOn ? <p className="text-[11px] text-muted-foreground">{t('as.quality.aiNote')}</p> : <ConsentNote state={consent.state} onRetry={() => consent.q.refetch()} />}
      <div aria-live="polite">
        {assist.isPending ? <WorkingState testId={`${testId}-working`} />
          : assist.isError ? <RequestError error={assist.error} onRetry={() => last && assist.mutate({ data: last })} testId={`${testId}-error`} />
          : res ? (
            <AssistResultView res={res} prefix={testId} onRetry={() => last && assist.mutate({ data: last })}
              footer={<Pager page={res.page || 1} total={res.total} onPage={(p) => send(!!last?.useAi, p)} testId={`${testId}-pager`} />} />
          ) : null}
      </div>
    </AssistFrame>
  );
}

/** Overview next steps: code first, optional AI ranking. At most three. */
export function NextActions() {
  const lang = useLang();
  const { scope } = useAiConsentState();
  return <NextInner key={`${lang}|${scope}`} />;
}

function NextInner() {
  const { t } = useTranslation();
  const lang = useLang();
  const request = useCsrfRequest();
  const consent = useAiConsentState();
  const assist = useAssistAi({ mutation: { gcTime: 0 }, request });
  const [useAi, setUseAi] = useState(false);
  const send = (ai: boolean) => { setUseAi(ai); assist.mutate({ data: { task: 'next', language: lang, useAi: ai } }); };
  const started = useRef(false);
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    sendRef.current(false);
  }, []);
  const res = assist.data;
  return (
    <AssistFrame title={t('as.next.title')} lead={t('as.next.lead')} icon={Compass} testId="panel-next" state={assist.isPending ? 'working' : res ? `result-${res.status}` : 'ready'}>
      <div className="flex flex-wrap gap-2">
        <Button variant={res ? 'outline' : 'default'} onClick={() => send(false)} disabled={assist.isPending} className={btn44} data-testid="button-next-show">
          <ListOrdered className="size-4" aria-hidden="true" />{t('as.next.refresh')}
        </Button>
        {consent.state === 'on' && (
          <Button variant="outline" onClick={() => send(true)} disabled={assist.isPending} className={btn44} data-testid="button-next-rank">
            <Sparkles className="size-4" aria-hidden="true" />{t('as.next.rank')}
          </Button>
        )}
      </div>
      <div aria-live="polite">
        {assist.isPending ? <WorkingState testId="state-next-working" />
          : assist.isError ? <RequestError error={assist.error} onRetry={() => send(useAi)} testId="state-next-error" />
          : res ? <AssistResultView res={res} prefix="next" max={3} onRetry={() => send(useAi)} /> : null}
      </div>
    </AssistFrame>
  );
}
