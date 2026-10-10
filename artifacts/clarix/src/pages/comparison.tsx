import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearch } from 'wouter';
import { AlertTriangle, ArrowLeft, Calendar, Layers, Link2Off, OctagonX, RotateCcw, Scale, SearchX, Timer, TriangleAlert } from 'lucide-react';
import {
  getGetRunComparisonQueryKey,
  useGetRunComparison,
    type ProductionRun,
  type RunComparison,
  type RunIssue,
  type RunMetric,
  type Session,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/empty-page';
import { PAGE_ICONS } from '@/components/app-shell';
import { StateScreen } from '@/components/state-screen';
import { Raw } from '@/components/imports/shared';
import { QualityStatusBadge } from '@/components/quality/status-badge';
import { MetricValue, SourceChip, UUID_RE, VOLUME_KEYS, metricOf, qualityHref } from '@/components/runs/shared';
import { RefPanel, SourceLink, useRefPanels, type RefPanels } from '@/components/runs/refs';
import { ForbiddenState } from '@/pages/tenant-page';
import { errorCode, errorStatus, localizeError } from '@/lib/session';
import { issueText } from '@/lib/import-model';
import { cn } from '@/lib/utils';
import '@/lib/runs-i18n';
import '@/lib/quality-i18n';

type Side = 'a' | 'b' | 'd';
type Group = 'volume' | 'changeover' | 'downtime';
const anchorId = (side: Side, key: string) => `src-${side}-${key}`;

/** Remembers which factory the comparison URL was opened in, so a factory switch clears the stale pair. */
let lastFactory: string | null = null;

const linkBtn = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium hover-elevate';

/* ---------------- source references ---------------- */

function ValueLink({ side, m, panels, testId, data }: { side: Side; m: RunMetric | undefined; panels: RefPanels; testId: string; data?: RunComparison }) {
  const { t } = useTranslation();
  if (!m) return <MetricValue m={undefined} testId={testId} />;
  if (!m.available && m.group === 'volume' && data) {
    const reasons=issuesOf(data,i=>i.severity==='error' && inGroup(i,'volume'))
      .filter(item=>side==='d'||item.side===side);
    return <div><MetricValue m={m} testId={testId} />
      <IssueLinks items={reasons} testId={`${testId}-reasons`} />
    </div>;
  }
  return (
    <SourceLink target={anchorId(side, m.key)} panels={panels} label={t(`rc.metric.${m.key}`)} testId={`link-source-${side}-${m.key}`}>
      <MetricValue m={m} testId={testId} />
    </SourceLink>
  );
}

function Alternatives({ m, side, panels }: { m: RunMetric | undefined; side: 'a' | 'b'; panels: RefPanels }) {
  const { t } = useTranslation();
  const alts = m?.alternatives ?? [];
  if (alts.length === 0) return null;
  return (
    <div className="mt-1 rounded-md border border-dashed bg-muted px-2 py-1.5" data-testid={`alternatives-${side}-${m!.key}`} title={t('rc.cmp.alternativesHint')}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('rc.cmp.alternatives')}</p>
      {alts.map((a) => (
        <p key={a.key} className="text-xs">
          <Raw className="text-[11px] text-muted-foreground">{a.key}</Raw>{' '}
          {a.display == null ? <span className="italic text-muted-foreground">{t('rc.na')}</span> : <span className="num font-medium" data-testid={`text-alt-${side}-${m!.key}-${a.key}`}>{a.display}</span>}
          {' '}<span className="text-[11px] text-muted-foreground">{t(`rc.unit.${m!.unit}`)}</span>
        </p>
      ))}
      <SourceLink target={anchorId(side, m!.key)} panels={panels} label={`${t('rc.cmp.alternatives')} · ${t(`rc.metric.${m!.key}`)}`} testId={`link-source-alt-${side}-${m!.key}`} showHint={false} className="px-0 text-xs text-primary underline-offset-2 hover:underline">
        {t('rc.cmp.showSource')}
      </SourceLink>
    </div>
  );
}

function MetricRows({ keys, data, panels }: { keys: readonly string[]; data: RunComparison; panels: RefPanels }) {
  const { t } = useTranslation();
  return (
    <>
      {/* table md+ */}
      <table className="hidden w-full text-sm md:table">
        <thead>
          <tr className="border-b bg-muted text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="w-[26%] px-4 py-2.5 text-start">{t('rc.cmp.metric')}</th>
            <th className="px-3 py-2.5 text-start">{t('rc.cmp.runA')}</th>
            <th className="px-3 py-2.5 text-start">{t('rc.cmp.runB')}</th>
            <th className="bg-accent px-3 py-2.5 text-start">{t('rc.cmp.difference')} <span className="font-normal normal-case">({t('rc.cmp.diffHint')})</span></th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => {
            const ma = metricOf(data.a.metrics, k);
            const mb = metricOf(data.b.metrics, k);
            const md = metricOf(data.differences, k);
            return (
              <tr key={k} className="border-b align-top last:border-0" data-testid={`row-metric-${k}`}>
                <th scope="row" className="px-4 py-3 text-start font-medium">{t(`rc.metric.${k}`)}</th>
                <td className="px-2 py-1.5"><ValueLink data={data} side="a" m={ma} panels={panels} testId={`text-a-${k}`} /><Alternatives m={ma} side="a" panels={panels} /></td>
                <td className="px-2 py-1.5"><ValueLink data={data} side="b" m={mb} panels={panels} testId={`text-b-${k}`} /><Alternatives m={mb} side="b" panels={panels} /></td>
                <td className="bg-[color-mix(in_srgb,var(--accent)_60%,transparent)] px-2 py-1.5"><ValueLink data={data} side="d" m={md} panels={panels} testId={`text-diff-${k}`} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* cards mobile */}
      <ul className="divide-y md:hidden">
        {keys.map((k) => {
          const ma = metricOf(data.a.metrics, k);
          const mb = metricOf(data.b.metrics, k);
          const md = metricOf(data.differences, k);
          return (
            <li key={k} className="p-3" data-testid={`card-metric-${k}`}>
              <h4 className="text-sm font-semibold">{t(`rc.metric.${k}`)}</h4>
              <dl className="mt-2 grid grid-cols-2 gap-2">
                <div className="min-w-0 rounded-md border p-1.5">
                  <dt className="px-1.5 text-[11px] text-muted-foreground">{t('rc.cmp.runA')}</dt>
                  <dd><ValueLink data={data} side="a" m={ma} panels={panels} testId={`text-card-a-${k}`} /><Alternatives m={ma} side="a" panels={panels} /></dd>
                </div>
                <div className="min-w-0 rounded-md border p-1.5">
                  <dt className="px-1.5 text-[11px] text-muted-foreground">{t('rc.cmp.runB')}</dt>
                  <dd><ValueLink data={data} side="b" m={mb} panels={panels} testId={`text-card-b-${k}`} /><Alternatives m={mb} side="b" panels={panels} /></dd>
                </div>
                <div className="col-span-2 rounded-md border bg-accent p-1.5">
                  <dt className="px-1.5 text-[11px] text-muted-foreground">{t('rc.cmp.difference')} ({t('rc.cmp.diffHint')})</dt>
                  <dd><ValueLink data={data} side="d" m={md} panels={panels} testId={`text-card-diff-${k}`} /></dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/* ---------------- issues ---------------- */

function IssueLinks({ items, testId }: { items: { issue: RunIssue; side: 'a' | 'b' }[]; testId: string }) {
  const { t } = useTranslation();
  return (
    <ul className="mt-2 space-y-1.5" data-testid={testId}>
      {items.map(({ issue, side }) => (
        <li key={`${side}-${issue.id}`}>
          <Link href={qualityHref(issue)} className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border bg-card px-3 py-2 text-sm hover-elevate" data-testid={`link-issue-${issue.id}`}>
            <QualityStatusBadge status={issue.severity === 'error' ? 'red' : issue.severity === 'warning' ? 'yellow' : 'green'} label={t(`imp.check.severity.${issue.severity}`, { defaultValue: issue.severity })} size="sm" />
            <Raw className="text-[11px] font-semibold text-muted-foreground">{issue.code}</Raw>
            <span className="min-w-0 flex-1">{issueText(t, issue.code)}</span>
            <span className="text-xs text-muted-foreground">
              {t('rc.cmp.issueIn', { run: side === 'a' ? t('rc.cmp.runA') : t('rc.cmp.runB'), source: issue.sourceName })}
              {issue.orderId && <> · <Raw className="text-xs">{issue.orderId}</Raw></>}
            </span>
            <span className="text-xs font-medium text-primary">{t('rc.cmp.openIssue')}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const issuesOf = (d: RunComparison, pred: (i: RunIssue) => boolean) => [
  ...d.a.issues.filter(pred).map((issue) => ({ issue, side: 'a' as const })),
  ...d.b.issues.filter(pred).map((issue) => ({ issue, side: 'b' as const })),
];
const inGroup = (i: RunIssue, g: Group) => i.group.split(',').map((x) => x.trim()).some((x) => x === g || x === 'all');

const GROUP_KEYS: Record<Group, readonly string[]> = { volume: VOLUME_KEYS, changeover: ['changeover_min'], downtime: ['downtime_min'] };

function BlockedGroup({ group, data, panels }: { group: Group; data: RunComparison; panels: RefPanels }) {
  const { t } = useTranslation();
  const reasons = issuesOf(data, (i) => i.severity === 'error' && inGroup(i, group));
  return (
    <div role="note" className="rounded-xl border border-[color-mix(in_srgb,var(--status-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--status-red)_5%,var(--card))] p-4" data-testid={`state-group-blocked-${group}`}>
      <div className="flex flex-wrap items-center gap-2">
        <OctagonX className="size-5 text-status-red" aria-hidden="true" />
        <h3 className="text-sm font-semibold">{t('rc.cmp.blockedGroup', { group: t(`rc.groups.${group}`) })}</h3>
        <QualityStatusBadge status="red" size="sm" />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t('rc.cmp.blockedGroupBody')}</p>
      {reasons.length > 0 && <IssueLinks items={reasons} testId={`list-blocked-reasons-${group}`} />}
      {(() => {
        const rows = GROUP_KEYS[group].flatMap((k) => (['a', 'b'] as const).map((side) => ({ k, side, m: metricOf((side === 'a' ? data.a : data.b).metrics, k) }))).filter((x) => (x.m?.alternatives.length ?? 0) > 0);
        if (rows.length === 0) return null;
        return (
          <div className="mt-3 border-t pt-3" data-testid={`blocked-alternatives-${group}`}>
            <p className="text-xs font-medium text-muted-foreground">{t('rc.cmp.blockedAlts')}</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {rows.map(({ k, side, m }) => (
                <li key={`${side}-${k}`} className="min-w-0">
                  <p className="text-xs font-semibold">{t(`rc.metric.${k}`)} · {side === 'a' ? t('rc.cmp.runA') : t('rc.cmp.runB')} <span className="font-normal text-muted-foreground">({(side === 'a' ? data.a : data.b).sourceName})</span></p>
                  <Alternatives m={m} side={side} panels={panels} />
                </li>
              ))}
            </ul>
          </div>
        );
      })()}
    </div>
  );
}

/* ---------------- run identity ---------------- */

function RunCard({ run, side, panels }: { run: ProductionRun; side: 'a' | 'b'; panels: RefPanels }) {
  const { t } = useTranslation();
  const label = side === 'a' ? t('rc.cmp.runA') : t('rc.cmp.runB');
  const dateId = anchorId(side, 'date');
  return (
    <article className="min-w-0 rounded-xl border bg-card p-4 shadow-[var(--shadow-sm)]" data-testid={`card-run-${side}`} aria-label={label}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">{side === 'a' ? t('rc.cmp.sideA') : t('rc.cmp.sideB')}</span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <Raw className="block truncate text-lg font-semibold" >{run.orderId}</Raw>
          </div>
        </div>
        <QualityStatusBadge status={run.overall} testId={`status-run-${side}`} />
      </div>
      <div className="mt-3"><SourceChip run={run} testId={`text-run-${side}-source`} /></div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-[11px] text-muted-foreground">{t('rc.cmp.date')}</dt>
          <dd>
            <SourceLink target={dateId} panels={panels} label={t('rc.cmp.date')} testId={`link-source-${side}-date`}>
              <span className="inline-flex items-center gap-1">
                <Calendar className="size-3.5 text-muted-foreground" aria-hidden="true" />
                {run.date ? <span className="num">{run.date}</span> : <span className="italic text-muted-foreground">{t('rc.na')}</span>}
              </span>
            </SourceLink>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted-foreground">{t('rc.cmp.capability')}</dt>
          <dd className="mt-1" title={t(`rc.cmp.cap${run.capabilityLevel}`, { defaultValue: '' })}>
            <span className="inline-flex items-center gap-1"><Layers className="size-3.5 text-primary" aria-hidden="true" />{t('rc.cmp.capabilityLevel', { n: run.capabilityLevel })}</span>
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[11px] text-muted-foreground">{t('rc.cmp.importId')}</dt>
          <dd><Raw className="break-all text-[11px] text-muted-foreground">{run.importId}</Raw></dd>
        </div>
      </dl>
      {[1, 2, 3].includes(run.capabilityLevel) && <p className="mt-2 text-xs text-muted-foreground" data-testid={`text-capability-${side}`}>{t(`rc.cmp.cap${run.capabilityLevel}`)}</p>}
      <ul className="mt-3 flex flex-wrap gap-1.5 border-t pt-3" aria-label={t('rc.cmp.groupStatus')}>
        {(['volume', 'changeover', 'downtime'] as Group[]).map((g) =>
          run.groups[g] ? <li key={g}><QualityStatusBadge status={run.groups[g]} label={t(`rc.groups.${g}`)} size="sm" testId={`status-run-${side}-${g}`} /></li> : null,
        )}
      </ul>
    </article>
  );
}

/* ---------------- result ---------------- */

function Result({ data }: { data: RunComparison }) {
  const { t, i18n } = useTranslation();
  const panels = useRefPanels();
  const blocked = (g: Group) => data.groups[g] === 'red';
  const ar = i18n.language.startsWith('ar');
  const warnings = issuesOf(data, (i) => i.severity === 'warning');
  const mainGroups: { g: Group; keys: readonly string[]; icon: typeof Scale }[] = [
    { g: 'volume', keys: VOLUME_KEYS, icon: Scale },
    { g: 'changeover', keys: ['changeover_min'], icon: Timer },
  ];
  const allKeys = [...VOLUME_KEYS, 'changeover_min', 'downtime_min'];
  const diffRefs = (k: string) => {
    const d = metricOf(data.differences, k);
    return d && d.refs.length > 0 ? d.refs : [...(metricOf(data.a.metrics, k)?.refs ?? []), ...(metricOf(data.b.metrics, k)?.refs ?? [])];
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <RunCard run={data.a} side="a" panels={panels} />
        <RunCard run={data.b} side="b" panels={panels} />
      </div>

      <section className="fade-up rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="cmp-summary" data-testid="section-summary">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="cmp-summary" className="text-sm font-semibold">{t('rc.cmp.summary')}</h2>
          <span className="text-xs text-muted-foreground">· {t('rc.cmp.overall')}</span>
          <QualityStatusBadge status={data.overall} testId="status-comparison-overall" />
          <span className="mx-1 hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
          {(['volume', 'changeover', 'downtime'] as Group[]).map((g) =>
            data.groups[g] ? <QualityStatusBadge key={g} status={data.groups[g]} label={t(`rc.groups.${g}`)} size="sm" testId={`status-comparison-${g}`} /> : null,
          )}
        </div>
        <p className="mt-3 text-base font-medium leading-relaxed" dir={ar ? 'rtl' : 'ltr'} lang={ar ? 'ar' : 'en'} data-testid="text-summary">{ar ? data.summary.ar : data.summary.en}</p>
        <p className="mt-2 border-s-2 border-[var(--series-stop)] ps-3 text-sm text-muted-foreground" data-testid="text-downtime-separate">{t('rc.cmp.separateLine')}</p>
        <p className="mt-2 text-[11px] text-muted-foreground">{t('rc.cmp.summaryNote')}</p>
      </section>

      {data.questions.length > 0 && (
        <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="cmp-questions" data-testid="section-questions">
          <h2 id="cmp-questions" className="text-sm font-semibold">{t('rc.cmp.questionsTitle')}</h2>
          <p className="text-[11px] text-muted-foreground">{t('rc.cmp.questionsNote')}</p>
          <ul className="mt-3 grid gap-3 lg:grid-cols-3">
            {data.questions.map((qq) => (
              <li key={qq.key} className="flex min-w-0 flex-col rounded-lg border bg-background p-3" data-testid={`card-question-${qq.key}`}>
                <h3 className="text-xs font-semibold text-muted-foreground">{t(`rc.cmp.q.${qq.key}`, { defaultValue: qq.key })}</h3>
                <p className="mt-1 flex-1 text-sm leading-relaxed" dir={ar ? 'rtl' : 'ltr'} lang={ar ? 'ar' : 'en'} data-testid={`text-question-${qq.key}`}>{ar ? qq.ar : qq.en}</p>
                <SourceLink target={anchorId('d', qq.metricKey)} panels={panels} label={t(`rc.cmp.q.${qq.key}`, { defaultValue: qq.key })} testId={`link-question-source-${qq.key}`} showHint={false} className="mt-1 self-start px-0 text-xs font-medium text-primary underline-offset-2 hover:underline">
                  {t('rc.cmp.showSource')}
                </SourceLink>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.hasWarnings && warnings.length > 0 && (
        <section role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--status-amber)_40%,transparent)] bg-[color-mix(in_srgb,var(--status-amber)_7%,var(--card))] p-4" data-testid="banner-warnings">
          <p className="flex items-center gap-2 text-sm font-semibold text-status-amber"><TriangleAlert className="size-4" aria-hidden="true" />{t('rc.cmp.warnTitle')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('rc.cmp.warnBody')}</p>
          <IssueLinks items={warnings} testId="list-warning-issues" />
        </section>
      )}
      {data.hasBlockedGroups && (
        <p role="note" className="flex items-start gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm" data-testid="banner-blocked">
          <OctagonX className="mt-0.5 size-4 shrink-0 text-status-red" aria-hidden="true" />
          <span><strong className="font-semibold">{t('rc.cmp.blockedTitle')}.</strong> <span className="text-muted-foreground">{t('rc.cmp.blockedBody')}</span></span>
        </p>
      )}

      {mainGroups.map(({ g, keys, icon: Icon }) =>
        blocked(g) && g !== 'volume' ? (
          <BlockedGroup key={g} group={g} data={data} panels={panels} />
        ) : (
          <section key={g} className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-sm)]" aria-labelledby={`grp-${g}`} data-testid={`section-group-${g}`}>
            <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
              <Icon className="size-4 text-primary" aria-hidden="true" />
              <h3 id={`grp-${g}`} className="text-sm font-semibold">{t(`rc.groups.${g}`)}</h3>
              {data.groups[g] && <QualityStatusBadge status={data.groups[g]} size="sm" />}
            </header>
            <MetricRows keys={keys} data={data} panels={panels} />
          </section>
        ),
      )}

      <section className="rounded-xl border-2 border-dashed border-[color-mix(in_srgb,var(--series-stop)_40%,var(--border))] bg-card" aria-labelledby="grp-downtime" data-testid="section-downtime">
        <header className="border-b px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Timer className="size-4 text-[var(--series-stop)]" aria-hidden="true" />
            <h3 id="grp-downtime" className="text-sm font-semibold">{t('rc.cmp.downtimeTitle')}</h3>
            {data.groups.downtime && <QualityStatusBadge status={data.groups.downtime} size="sm" />}
          </div>
          <p className="mt-1 text-xs text-muted-foreground" data-testid="text-downtime-note">{t('rc.cmp.downtimeNote')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('rc.cmp.separateLine')}</p>
        </header>
        {blocked('downtime') ? <div className="p-3"><BlockedGroup group="downtime" data={data} panels={panels} /></div> : <MetricRows keys={['downtime_min']} data={data} panels={panels} />}
      </section>

      <section aria-labelledby="cmp-sources" className="space-y-3" data-testid="section-sources">
        <div>
          <h2 id="cmp-sources" className="text-sm font-semibold">{t('rc.cmp.sourcesTitle')}</h2>
          <p className="text-xs text-muted-foreground">{t('rc.cmp.sourcesLead')}</p>
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          {(['a', 'b'] as const).map((s) => {
            const id = anchorId(s, 'date');
            const run = s === 'a' ? data.a : data.b;
            return <RefPanel key={id} id={id} panels={panels} refs={run.dateRefs}
              title={t('rc.cmp.sourceFor', { metric: t('rc.cmp.dateRefs'), side: `${s === 'a' ? t('rc.cmp.runA') : t('rc.cmp.runB')} · ${run.orderId} · ${run.sourceName}` })} />;
          })}
          {allKeys.flatMap((k) =>
            (['a', 'b', 'd'] as Side[]).map((s) => {
              const id = anchorId(s, k);
              const refs = s === 'd' ? diffRefs(k) : metricOf((s === 'a' ? data.a : data.b).metrics, k)?.refs ?? [];
              const sideLabel = s === 'd' ? t('rc.cmp.sideD') : `${s === 'a' ? t('rc.cmp.runA') : t('rc.cmp.runB')} · ${(s === 'a' ? data.a : data.b).sourceName}`;
              return <RefPanel key={id} id={id} panels={panels} refs={refs} title={t('rc.cmp.sourceFor', { metric: t(`rc.metric.${k}`), side: sideLabel })} />;
            }),
          )}
        </div>
      </section>
    </div>
  );
}

function Skeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" className="space-y-4" data-testid="state-comparison-loading">
      <span className="sr-only">{t('rc.cmp.loading')}</span>
      <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <div key={i} className="h-52 animate-pulse rounded-xl bg-muted" />)}</div>
      <div className="h-28 animate-pulse rounded-xl bg-muted" />
      <div className="h-80 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}

/* ---------------- page ---------------- */

export default function ComparisonPage({ session }: { session: Session }) {
  const { t } = useTranslation();
  const search = useSearch();
  const [, navigate] = useLocation();
  const factoryId = session.activeFactoryId;
  const sp = new URLSearchParams(search);
  const a = sp.get('a')?.trim() ?? '';
  const b = sp.get('b')?.trim() ?? '';
  const hasPair = !!(a || b);
  const valid = UUID_RE.test(a) && UUID_RE.test(b) && a.toLowerCase() !== b.toLowerCase();
  const stale = hasPair && lastFactory !== null && lastFactory !== factoryId;

  useEffect(() => {
    if (stale) navigate('/comparison', { replace: true });
    lastFactory = factoryId;
  }, [stale, factoryId, navigate]);

  const params = { a, b };
  const q = useGetRunComparison(params, { query: {
    queryKey: [...getGetRunComparisonQueryKey(params), factoryId, session.user?.id],
    enabled: valid && !stale,
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false,
  } });

  const runsLink = (label: string, primary = true) => (
    <Link href="/runs" className={cn(linkBtn, primary ? 'bg-primary text-primary-foreground' : 'border bg-card')} data-testid="link-choose-runs">
      {label}
    </Link>
  );

  let body: ReactNode;
  if (!hasPair || stale) {
    body = <div className="rounded-xl border bg-card"><StateScreen icon={Scale} title={t('rc.cmp.noPairTitle')} body={t('rc.cmp.noPairBody')} testId="state-comparison-no-pair" actions={runsLink(t('rc.cmp.choose'))} /></div>;
  } else if (!valid) {
    const same = a && a.toLowerCase() === b.toLowerCase();
    body = <div className="rounded-xl border bg-card"><StateScreen icon={Link2Off} tone="amber" title={t('rc.cmp.badPairTitle')} body={same ? t('rc.cmp.samePairBody') : t('rc.cmp.badPairBody')} testId="state-comparison-invalid" actions={runsLink(t('rc.cmp.choose'))} /></div>;
  } else if (q.isLoading) {
    body = <Skeleton />;
  } else if (q.isError) {
    const st = errorStatus(q.error);
    if (st === 403) return <ForbiddenState session={session} />;
    if (st === 404 || st === 400 || st === 422) {
      body = <div className="rounded-xl border bg-card"><StateScreen icon={SearchX} tone="amber" title={t('rc.cmp.notFoundTitle')} body={t('rc.cmp.notFoundBody')}
        code={errorCode(q.error) ? t('states.code', { code: errorCode(q.error) }) : undefined} testId="state-comparison-not-found" actions={runsLink(t('rc.cmp.choose'))} /></div>;
    } else {
      body = <div className="rounded-xl border bg-card"><StateScreen icon={AlertTriangle} tone="red" title={t('rc.cmp.errorTitle')} body={localizeError(t, q.error)}
        code={errorCode(q.error) ? t('states.code', { code: errorCode(q.error) }) : undefined} testId="state-comparison-error"
        actions={<>
          <Button onClick={() => q.refetch()} disabled={q.isFetching} className="min-h-11 gap-2" data-testid="button-retry-comparison"><RotateCcw className="size-4" aria-hidden="true" />{t('common.retry')}</Button>
          {runsLink(t('rc.cmp.choose'), false)}
        </>} /></div>;
    }
  } else if (q.data) {
    body = <Result key={`${a}:${b}`} data={q.data} />;
  }

  return (
    <div data-testid="page-comparison">
      <PageHeader icon={PAGE_ICONS.comparison} title={t('rc.cmp.title')} lead={t('rc.cmp.lead')} />
      {valid && !stale && (
        <div className="mb-4">
          <Link href="/runs" className={cn(linkBtn, 'border bg-card px-3')} data-testid="link-back-runs">
            <ArrowLeft className="size-4 rtl-flip" aria-hidden="true" />{t('rc.cmp.change')}
          </Link>
        </div>
      )}
      {body}
    </div>
  );
}
