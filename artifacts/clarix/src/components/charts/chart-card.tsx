import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { motion, useReducedMotion } from 'framer-motion';
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { ArrowDown, ArrowRight, ArrowUp, Equal, Info, Minus, Table2 } from 'lucide-react';
import type { ChartPoint, ChartSpec, ChartText } from '@workspace/api-client-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { QualityStatusBadge } from '@/components/quality/status-badge';
import { SourceLink } from '@/components/runs/refs';
import { useSource } from '@/components/source/source-context';
import { GlossaryTip, MetricTerm, StatusTip } from '@/components/charts/glossary';
import { cn } from '@/lib/utils';
import '@/lib/charts-i18n';
import '@/lib/quality-i18n';

/* ---------- helpers (display only, no business arithmetic) ---------- */

function useText() {
  const { i18n } = useTranslation();
  const ar = i18n.language.startsWith('ar');
  return { ar, tx: (x: ChartText | undefined) => (x ? (ar ? x.ar : x.en) : '') };
}

const SERIES_COLOR: Record<string, string> = {
  scrap_rate_pct: 'var(--series-scrap)',
  good_rate_pct: 'var(--series-good)',
  changeover_min: 'var(--series-changeover)',
  downtime_min: 'var(--series-stop)',
};
const colorOf = (key: string) => SERIES_COLOR[key] ?? 'var(--primary)';

/** Pattern B: same colour with diagonal stripes, so A/B differ by more than colour. */
const patternB = (c: string): CSSProperties => ({
  backgroundColor: c,
  backgroundImage: 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--card) 55%, transparent) 0 3px, transparent 3px 8px)',
});
const STATUS_FILL: Record<string, CSSProperties> = {
  green: { backgroundColor: 'var(--status-green)' },
  yellow: { backgroundColor: 'var(--status-amber)', backgroundImage: 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--card) 45%, transparent) 0 3px, transparent 3px 8px)' },
  red: { backgroundColor: 'var(--status-red)', backgroundImage: 'repeating-linear-gradient(45deg, color-mix(in srgb, var(--card) 45%, transparent) 0 2px, transparent 2px 6px), repeating-linear-gradient(135deg, color-mix(in srgb, var(--card) 45%, transparent) 0 2px, transparent 2px 6px)' },
};

function UnitText({ unit }: { unit: string }) {
  const { t } = useTranslation();
  return <span className="text-[0.7em] font-medium text-muted-foreground">{' '}{t(`ch.unit.${unit}`, { defaultValue: unit })}</span>;
}

function ValueText({ p, unit, className }: { p: ChartPoint; unit: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-1.5', className)}>
      <span className="num font-semibold">{p.display}<UnitText unit={unit} /></span>
      {p.hours && <span className="num text-[0.75em] text-muted-foreground">({t('rc.hoursOf', { h: p.hours })})</span>}
      {p.noEvents && <span className="text-[0.7em] italic text-muted-foreground">{t('ch.noEvents')}</span>}
    </span>
  );
}

/** Not available: words + reason + Data Quality link. Never a zero. */
export function NotAvailable({ reason, testId, compact }: { reason?: ChartText; testId: string; compact?: boolean }) {
  const { t } = useTranslation();
  const { tx } = useText();
  const r = tx(reason);
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-0.5', compact ? 'text-xs' : 'text-sm')} data-testid={testId}>
      <span className="inline-flex items-center font-medium italic text-muted-foreground">
        <Minus className="me-1 size-3.5" aria-hidden="true" />{t('ch.na')}<GlossaryTip term="na" testId={`${testId}-glossary`} />
      </span>
      {r && <span className="text-muted-foreground" data-testid={`${testId}-reason`}><span className="sr-only">{t('ch.naReason')}: </span>{r}</span>}
      <Link href="/quality" className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline" data-testid={`${testId}-quality`}>
        {t('ch.openQuality')}<ArrowRight className="rtl-flip size-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

function HowToRead({ text, testId }: { text: string; testId: string }) {
  const { t } = useTranslation();
  if (!text) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-primary hover-elevate" data-testid={testId}>
          <Info className="size-3.5" aria-hidden="true" />{t('ch.howToRead')}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 text-sm leading-relaxed">{text}</PopoverContent>
    </Popover>
  );
}

function pointLabel(t: (k: string) => string, spec: ChartSpec, p: ChartPoint) {
  if (spec.kind === 'status_stack') return t(`ch.stack.${p.key}`);
  return p.label;
}

/** Visually hidden (toggle-visible) table with the exact same values. */
function DataTable({ spec, visible, testId }: { spec: ChartSpec; visible: boolean; testId: string }) {
  const { t } = useTranslation();
  const { tx } = useText();
  return (
    <table className={cn(visible ? 'mt-3 w-full text-sm' : 'sr-only')} data-testid={testId}>
      <caption className={cn(visible ? 'mb-1 text-start text-xs text-muted-foreground' : '')}>{t('ch.tableCaption', { title: tx(spec.title) })}</caption>
      <thead>
        <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
          <th scope="col" className="py-1.5 text-start">{t('ch.colItem')}</th>
          <th scope="col" className="py-1.5 text-start">{t('ch.colValue')}</th>
          <th scope="col" className="py-1.5 text-start">{t('ch.colStatus')}</th>
          <th scope="col" className="py-1.5 text-start">{t('ch.colNote')}</th>
        </tr>
      </thead>
      <tbody>
        {spec.series.map((p) => (
          <tr key={p.key} className="border-b last:border-0" data-testid={`${testId}-row-${p.key}`}>
            <th scope="row" className="py-1.5 text-start font-medium">
              {spec.kind === 'bars' || spec.kind === 'indicator' ? `${p.key === 'a' ? t('ch.runA') : p.key === 'b' ? t('ch.runB') : ''} ` : ''}
              <span dir="auto">{pointLabel(t, spec, p)}</span>
              {p.sourceName && spec.kind !== 'status_stack' && <span className="text-muted-foreground"> · <span dir="auto">{p.sourceName}</span></span>}
            </th>
            <td className="py-1.5">{p.available && p.display != null ? <ValueText p={p} unit={spec.unit} /> : <span className="italic text-muted-foreground">{t('ch.na')}</span>}</td>
            <td className="py-1.5">{t(`q.status.${p.status}`)}</td>
            <td className="py-1.5 text-muted-foreground">{p.available ? '' : tx(p.reason)}</td>
          </tr>
        ))}
        {spec.kind !== 'status_stack' && spec.difference && (
          <tr>
            <th scope="row" className="py-1.5 text-start font-medium">{t('ch.difference')}</th>
            <td className="py-1.5">{spec.difference?.display != null && spec.direction !== 'unavailable' ? <span className="num">{spec.difference?.display} {t(`ch.unit.${spec.difference?.unit}`, { defaultValue: spec.difference?.unit ?? '' })}</span> : <span className="italic text-muted-foreground">{t('ch.na')}</span>}</td>
            <td className="py-1.5">{t(`ch.dir.${spec.direction}`)}</td>
            <td className="py-1.5 text-muted-foreground">{tx(spec.changeText)}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function Shell({ spec, testId, children, head }: { spec: ChartSpec; testId: string; children: ReactNode; head?: ReactNode }) {
  const { t } = useTranslation();
  const { tx, ar } = useText();
  const [showTable, setShowTable] = useState(false);
  return (
    <figure className="fade-up flex min-w-0 flex-col rounded-xl border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-5" data-testid={testId} data-chart-key={spec.key} aria-labelledby={`${testId}-title`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={`${testId}-title`} className="flex items-center text-sm font-semibold" dir={ar ? 'rtl' : 'ltr'}>
          <MetricTerm metric={spec.key}>{tx(spec.title)}</MetricTerm>
        </h3>
        <span className="inline-flex items-center">
          <QualityStatusBadge status={spec.status} size="sm" testId={`${testId}-status`} /><StatusTip status={spec.status} />
        </span>
      </div>
      {head}
      <div>{children}</div>
      <figcaption className="mt-3 text-sm leading-relaxed" dir={ar ? 'rtl' : 'ltr'} data-testid={`${testId}-caption`}>{tx(spec.caption)}</figcaption>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <HowToRead text={tx(spec.howToRead)} testId={`${testId}-how-to-read`} />
        <button type="button" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable} className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover-elevate" data-testid={`${testId}-toggle-table`}>
          <Table2 className="size-3.5" aria-hidden="true" />{showTable ? t('ch.hideTable') : t('ch.showTable')}
        </button>
      </div>
      <DataTable spec={spec} visible={showTable} testId={`${testId}-table`} />
    </figure>
  );
}

/* ---------- direction chip: arrow + sign (from server display) + words ---------- */

export function ChangeChip({ spec, testId }: { spec: ChartSpec; testId: string }) {
  const { t } = useTranslation();
  const { tx } = useText();
  const d = spec.direction;
  const Icon = d === 'higher' ? ArrowUp : d === 'lower' ? ArrowDown : d === 'same' ? Equal : Minus;
  const has = d !== 'unavailable' && spec.difference?.display != null;
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs" data-testid={testId} data-direction={d}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="font-medium" data-testid={has ? `${testId}-value` : undefined}>{tx(spec.changeText) || t(`ch.dir.${d}`)}</span>
    </span>
  );
}

function diffSource(spec: ChartSpec) {
  const a = spec.series.find((p) => p.key === 'a');
  const b = spec.series.find((p) => p.key === 'b');
  if (a?.runId && b?.runId) return { kind: 'metric' as const, id: a.runId, metric: spec.difference?.key || spec.key, other: b.runId };
  const any = spec.series.find((p) => p.runId);
  return any?.runId ? { kind: 'metric' as const, id: any.runId, metric: spec.key } : null;
}

/* ---------- bars (comparison): Recharts geometry from server plotValue ---------- */

/** Chart coordinates are supplied by the server, never metric calculations. */
const axisMinOf = (spec: ChartSpec) => spec.axisMin;

function PointBar({ value, min, max, color, patterned, reversed, animate, delay }: { value: number | null; min: number; max: number; color: string; patterned: boolean; reversed: boolean; animate: boolean; delay: number }) {
  const pid = `patB-${useId().replace(/:/g, '')}`;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart layout="vertical" data={[{ v: value }]} margin={{ top: 8, bottom: 8, left: 0, right: 0 }} barCategoryGap={0}>
        <defs>
          <pattern id={pid} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill={color} />
            <rect width="3" height="8" fill="var(--card)" fillOpacity={0.55} />
          </pattern>
        </defs>
        <XAxis type="number" domain={[min, max]} reversed={reversed} hide allowDataOverflow />
        <YAxis type="category" hide />
        <ReferenceLine x={0} stroke="var(--foreground)" strokeOpacity={0.45} strokeWidth={2} ifOverflow="extendDomain" />
        <Bar dataKey="v" isAnimationActive={animate} animationDuration={500} animationBegin={delay} radius={2}>
          <Cell fill={patterned ? `url(#${pid})` : color} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Geometry only: server-normalised width, clamped to a valid CSS range. Never a business value. */
const barPct = (w: string | null) => {
  const n = Number(w);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
};

export function BarsChart({ spec, testId }: { spec: ChartSpec; testId: string }) {
  const { t } = useTranslation();
  const { ar } = useText();
  const reduce = useReducedMotion();
  const { openSource } = useSource();
  const color = colorOf(spec.key);
  const src = diffSource(spec);
  const axisMin = axisMinOf(spec);
  return (
    <Shell spec={spec} testId={testId} head={
      <div className="mt-2 flex flex-wrap items-center gap-2" data-testid={`${testId}-difference`}>
        <span className="text-xs text-muted-foreground">{t('ch.difference')}</span>
        {src ? (
          <SourceLink source={src} label={t('ch.difference')} testId={`${testId}-link-difference`} showHint={false} className="px-0">
            <ChangeChip spec={spec} testId={`${testId}-change`} />
          </SourceLink>
        ) : <ChangeChip spec={spec} testId={`${testId}-change`} />}
        {spec.difference?.unit === 'pp' && <GlossaryTip term="pp" testId={`${testId}-change-glossary-pp`} />}
      </div>
    }>
      {null}
      <div className="mt-4 space-y-3" dir={ar ? 'rtl' : 'ltr'}>
        {spec.series.map((p, i) => {
          const side = p.key === 'a' ? t('ch.runA') : p.key === 'b' ? t('ch.runB') : '';
          const ok = p.available && p.display != null && p.plotValue != null;
          return (
            <div key={p.key} className="min-w-0" data-testid={`${testId}-point-${p.key}`} data-available={ok ? 'true' : 'false'}>
              <p className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                  <span className="font-semibold">{side}</span>
                  <span className="num min-w-0 text-muted-foreground [overflow-wrap:anywhere]" dir="auto">{p.label}</span>
                </span>
                {ok && p.runId && <SourceLink source={{kind:'metric',id:p.runId,metric:spec.key}} label={`${side} ${p.label}`} testId={`${testId}-value-${p.key}`} showHint={false} className="px-0 text-sm"><ValueText p={p} unit={spec.unit} /></SourceLink>}
              </p>
              {ok ? (
                <button
                  type="button"
                  onClick={(e) => p.runId && openSource({ kind: 'metric', id: p.runId, metric: spec.key }, e.currentTarget)}
                  disabled={!p.runId}
                  aria-haspopup="dialog"
                  aria-label={`${side} ${p.label}: ${p.display} ${t(`ch.unit.${spec.unit}`)} · ${t('ch.openSource')}`}
                  className="group relative block h-11 w-full rounded-md hover-elevate"
                  data-testid={`${testId}-bar-${p.key}`}
                >
                  <span className="absolute inset-0" aria-hidden="true">
                    <PointBar value={p.plotValue} min={axisMin} max={spec.axisMax} color={color} patterned={p.key === 'b'} reversed={ar} animate={!reduce} delay={i * 60} />
                  </span>
                </button>
              ) : (
                <div className="rounded-md border border-dashed px-3 py-1">
                  <NotAvailable reason={p.reason} compact testId={`${testId}-na-${p.key}`} />
                </div>
              )}
              {p.sourceName && <span className="sr-only">{p.sourceName}</span>}
            </div>
          );
        })}
        <div className={cn('flex justify-between text-[10px] text-muted-foreground', ar && 'flex-row-reverse')} aria-hidden="true">
          <span className="num">{axisMin}<UnitText unit={spec.unit} /></span>
          <span className="num">{spec.axisMax}<UnitText unit={spec.unit} /></span>
        </div>
      </div>
    </Shell>
  );
}

/* ---------- status stack (overview) ---------- */

export function StatusStackChart({ spec, testId }: { spec: ChartSpec; testId: string }) {
  const { t } = useTranslation();
  const { ar } = useText();
  const reduce = useReducedMotion();
  const shown = spec.series.filter((p) => p.available && barPct(p.width) > 0);
  return (
    <Shell spec={spec} testId={testId}>
      {null}
      <div className="mt-4" dir={ar ? 'rtl' : 'ltr'}>
        {shown.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground" data-testid={`${testId}-empty`}>{t('ch.chartEmpty')}</p>
        ) : (
          <motion.div
            className="flex h-11 w-full overflow-hidden rounded-md border"
            style={{ transformOrigin: ar ? 'right' : 'left' }}
            initial={reduce ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
          >
            {shown.map((p) => (
              <span key={p.key} aria-hidden="true"
                className="block h-full border-e-2 border-card last:border-e-0" style={{ width: `${barPct(p.width)}%`, ...STATUS_FILL[p.status] }} data-testid={`${testId}-segment-${p.key}`} />
            ))}
          </motion.div>
        )}
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {spec.series.map((p) => (
            <li key={p.key} className="flex min-w-0 flex-col gap-1 rounded-lg border bg-background px-2 py-2" data-testid={`${testId}-label-${p.key}`}>
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <span className="size-3 shrink-0 rounded-sm" style={STATUS_FILL[p.status]} aria-hidden="true" />{t(`ch.stack.${p.key}`)}
              </span>
              {p.available && p.display != null
                ? <Link href={`/runs?status=${p.key}`} aria-label={`${t(`ch.stack.${p.key}`)}: ${p.display} · ${t('ch.stack.openRuns')}`} className="num inline-flex min-h-11 min-w-11 items-center rounded text-xl font-semibold hover-elevate" data-testid={`${testId}-value-${p.key}`}>{p.display}</Link>
                : <span className="text-xs italic text-muted-foreground" data-testid={`${testId}-value-${p.key}`}>{t('ch.na')}</span>}
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  );
}

/* ---------- cosmetic count-up from server frames (index only) ---------- */

function CountUp({ p, unit }: { p: ChartPoint; unit: string }) {
  const reduce = useReducedMotion();
  const frames = p.frames ?? [];
  const [i, setI] = useState(reduce || frames.length === 0 ? -1 : 0);
  useEffect(() => {
    if (reduce || frames.length === 0) { setI(-1); return; }
    const step = 450 / frames.length;
    let k = 0;
    const id = window.setInterval(() => { k += 1; if (k >= frames.length) { window.clearInterval(id); setI(-1); } else setI(k); }, step);
    return () => window.clearInterval(id);
  }, [reduce, frames.length]);
  if (i < 0) return <ValueText p={p} unit={unit} />;
  return (
    <>
      <span aria-hidden="true" className="num font-semibold">{frames[i]}<UnitText unit={unit} /></span>
      <span className="sr-only"><ValueText p={p} unit={unit} /></span>
    </>
  );
}

/* ---------- KPI indicator ---------- */

export function KpiCard({ spec, testId }: { spec: ChartSpec; testId: string }) {
  const { t } = useTranslation();
  const { tx, ar } = useText();
  const a = spec.series.find((p) => p.key === 'a');
  const b = spec.series.find((p) => p.key === 'b') ?? spec.series[spec.series.length - 1];
  const src = diffSource(spec);
  const bOk = !!b && b.available && b.display != null;
  return (
    <article className="flex min-w-0 flex-col rounded-xl border bg-card p-4 shadow-[var(--shadow-sm)]" data-testid={testId} data-kpi-key={spec.key} aria-labelledby={`${testId}-title`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={`${testId}-title`} className="flex items-center text-xs font-semibold text-muted-foreground" dir={ar ? 'rtl' : 'ltr'}>
          <MetricTerm metric={spec.key}>{tx(spec.title)}</MetricTerm>
        </h3>
        <span className="inline-flex items-center"><QualityStatusBadge status={spec.status} size="sm" testId={`${testId}-status`} /><StatusTip status={spec.status} /></span>
      </div>
      <div className="mt-2 min-h-12">
        {bOk && b ? (
          b.runId ? (
            <SourceLink source={{ kind: 'metric', id: b.runId, metric: spec.key }} label={`${t('ch.runB')} ${tx(spec.title)}`} testId={`${testId}-link-value`} showHint={false} className="px-0">
              <span className="block text-3xl leading-none tracking-tight" data-testid={`${testId}-value`} data-final={b.display ?? ''}>
                <CountUp p={b} unit={spec.unit} />
              </span>
            </SourceLink>
          ) : <span className="block text-3xl leading-none" data-testid={`${testId}-value`}><ValueText p={b} unit={spec.unit} /></span>
        ) : <NotAvailable reason={b?.reason} testId={`${testId}-na`} />}
        {b && <p className="mt-1 text-[11px] text-muted-foreground"><span className="font-semibold">{t('ch.runB')}</span> · <span dir="auto">{b.label}</span>{bOk && <span aria-hidden="true"> · <span className="num" data-testid={`${testId}-final`}>{b.display}</span></span>}</p>}
      </div>
      {a && (
        <p className="mt-2 text-xs text-muted-foreground" data-testid={`${testId}-a`}>
          {t('ch.vsA')} (<span dir="auto">{a.label}</span>):{' '}
          {a.available && a.display != null ? <ValueText p={a} unit={spec.unit} className="text-foreground" /> : <span className="italic">{t('ch.na')}</span>}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center"><ChangeChip spec={spec} testId={`${testId}-change`} />{spec.difference?.unit === 'pp' && <GlossaryTip term="pp" testId={`${testId}-change-glossary-pp`} />}</div>
      <div className="mt-auto pt-2">
        {src ? (
          <SourceLink source={src} label={`${t('ch.howCalc')} ${tx(spec.title)}`} testId={`${testId}-how-calc`} showHint={false} className="px-0 text-xs font-medium text-primary underline-offset-2 hover:underline">
            {t('ch.howCalc')}
          </SourceLink>
        ) : null}
      </div>
    </article>
  );
}

export function ChartSkeleton({ n = 2 }: { n?: number }) {
  return <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: n }).map((_, i) => <div key={i} className="h-64 animate-pulse rounded-xl bg-muted" />)}</div>;
}
