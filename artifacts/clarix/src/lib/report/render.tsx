/**
 * Phase 15 — pure, static print renderer for a frozen snapshot report.
 *
 * Input is the stored SnapshotReport payload returned by the server. Nothing
 * here calculates a metric: every number is a stored display string, shown
 * exactly (a leading "-" becomes U+2212, number and unit are joined with NBSP).
 * Chart `plotValue` / `axisMin` / `axisMax` are used only for bar geometry.
 *
 * Output is a complete HTML document string produced by React's static
 * renderer (every user string is escaped by React). The document contains no
 * <script>, no links, no network URLs (fonts are inline data: URLs) and a CSP
 * that forbids scripts and remote loads. No i18n / DOM / Vite imports so this
 * module can be unit-tested and used by a sample-generation driver.
 * (React default import: required for the classic JSX transform used by tsx in Node tests.)
 */
import React, { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NBSP, isUnitKey, normalizeFixedText, normalizeSign, splitSignedNumbers, unitWord } from '../number-format';

export type ReportLang = 'en' | 'ar';
type Status = 'green' | 'yellow' | 'red';
type Group = 'volume' | 'changeover' | 'downtime';
type Bi = { en: string; ar: string };

/* ---------- structural payload types (match the generated SnapshotReport) ---------- */
export interface ReportRef { file: string; line: number; column?: string | null; importId?: string; sourceName?: string; orderId?: string; kind?: string }
export interface ReportMetric { refs?: ReportRef[]; key: string; unit: string; status: string; value: string | null; display: string | null; hours: string | null; available: boolean; noEvents: boolean; alternatives?: { key: string; display: string | null }[] }
export interface ReportIssue { code: string; severity: string; group: string; orderId: string | null; sourceName: string; refs?: { file: string; line: number; column?: string | null }[] }
export interface ReportRun { orderId: string; sourceName: string; importId: string; date: string | null; capabilityLevel: number; overall: string; groups: Record<string, string>; metrics: ReportMetric[]; issues: ReportIssue[] }
export interface ReportPoint { key: string; label: string; display: string | null; hours: string | null; plotValue: number | null; available: boolean; reason: Bi; noEvents: boolean; sourceName: string | null }
export interface ReportChart { key: string; kind: string; title: Bi; unit: string; status: string; caption: Bi; howToRead: Bi; series: ReportPoint[]; difference?: ReportMetric; direction: string; changeText: Bi; axisMax: number; axisMin: number }
export interface ReportComparison { chart_spec: ReportChart[]; indicators: ReportChart[]; a: ReportRun; b: ReportRun; differences: ReportMetric[]; overall: string; groups: Record<string, string>; summary: Bi; questions: { key: string; en: string; ar: string }[] }
export interface ReportFigure { side: string; key: string; unit: string; clarix: string | null; reported: string | null; difference: string | null; result: string; reason: Bi; sentence: Bi }
export interface ReportReconciliation { author: string; createdAt: string; result: { origin: string; figures: ReportFigure[] } }
export interface SnapshotReportPayload {
  filename: string; language: ReportLang; exportedAt: string; factoryName: string;
  snapshot: { id: string; title: string; note: string; author: string; createdAt: string; overall: string; changed: boolean };
  comparison: ReportComparison; definitionsVersion: string;
  provenance: { importId: string; files: { name: string; sha256: string }[] }[];
  reconciliations: ReportReconciliation[];
  /** Snapshot-time issues with immutable file/line refs (preferred over comparison.a/b.issues). */
  issues?: ReportIssue[];
}

/** Localised labels from the app's i18n (metric names, issue messages, units). Injected so this module stays pure. */
export interface ReportLabels { metric: (key: string) => string; issue: (code: string) => string; unit: (unit: string) => string }
export interface ReportFonts { inter: string; arabic400: string; arabic600: string }

/* ---------- safety helpers ---------- */

/** Formula/injection neutralisation for untrusted text: prefix an apostrophe when it starts with = + - @ TAB or CR. */
export function neutralize(s: string | null | undefined): string {
  const v = s ?? '';
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

/** Predictable, sanitised file name. Uses the server name when it is already safe. */
export function safeFilename(name: string, fallback: string): string {
  const ok = /^[a-z0-9][a-z0-9._-]{0,150}\.pdf$/i;
  if (ok.test(name)) return name;
  const base = (name || fallback).toLowerCase().replace(/\.pdf$/i, '').replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 150);
  return `${base || 'clarix-report'}.pdf`;
}
export const docTitleOf = (filename: string) => filename.replace(/\.pdf$/i, '');

/** A data: URL font, verified to be actual bytes rather than a path. */
export function isEmbeddedFont(u: string): boolean {
  return /^data:[a-z0-9.+/-]*;base64,[A-Za-z0-9+/=]{4000,}$/i.test(u);
}

/** CSS string literal with every non-alphanumeric code point escaped (used only for fixed copy + ids). */
function cssStr(s: string): string {
  return `"${Array.from(s).map((c) => (/[A-Za-z0-9 ]/.test(c) ? c : `\\${c.codePointAt(0)!.toString(16).padStart(6, '0')}`)).join('')}"`;
}

/* ---------- fixed copy ---------- */

const COPY = {
  en: {
    header: 'Clarix - Snapshot report', page: 'Page ', of: ' of ',
    title: 'Snapshot report', factory: 'Factory', snapshot: 'Snapshot', savedOn: 'Saved on', savedBy: 'Saved by', snapshotId: 'Snapshot ID', exported: 'Exported on', language: 'Language', langValue: 'English (left to right)', defs: 'Definitions version',
    frozen: 'Frozen snapshot. These figures are exactly as they were when the snapshot was saved. They are not recalculated, and later imports do not change them.',
    changed: 'Note: newer imports exist for these orders. This report still shows the frozen figures.',
    note: 'Note',
    howTitle: 'How to read this report',
    how: ['Run A and Run B are the two production runs that were compared.', 'Every status is shown with a word and a symbol: OK (check mark), Check (triangle), Blocked (octagon with a cross). Colour is never the only signal.', '"Not available" means the figure could not be calculated from the data. It is never shown as zero.', 'Difference is Run B minus Run A, exactly as stored.'],
    runs: 'The two runs', side: 'Run', order: 'Order', source: 'Source', importId: 'Import ID', date: 'Date', overall: 'Overall', groups: 'Status by group', runA: 'Run A', runB: 'Run B',
    status: { green: 'OK', yellow: 'Check', red: 'Blocked' } as Record<string, string>,
    group: { volume: 'Volume', changeover: 'Changeover', downtime: 'Downtime' } as Record<string, string>,
    summary: 'Summary', overallStatus: 'Overall status',
    downtimeSentence: 'Downtime is recorded separately and is not assumed to explain the difference.',
    kpis: 'Key figures', metric: 'Figure', diff: 'Difference (B - A)', na: 'Not available', noEvents: 'no events recorded',
    blocked: (g: string) => `${g}: some figures cannot be calculated`, blockedBody: 'Data problems block some figures in this group. Affected figures show "Not available"; figures that could still be calculated are shown as stored.', reasons: 'Reasons',
    charts: 'Charts', chartNa: 'Not available - no bar is drawn.', axis: 'Scale',
    downtime: 'Downtime (shown separately)',
    sentences: 'Plain-language notes saved with the snapshot', questions: 'Questions to ask',
    issues: 'Issues present when the snapshot was saved', noIssues: 'No issues were recorded.', code: 'Code', message: 'Message', group_: 'Group', where: 'Source file and line', severity: { info: 'Info', warning: 'Warning', error: 'Error' } as Record<string, string>, line: 'line', column: 'column', lineMissing: 'line not stored',
    recs: 'Reconciliation records', noRecs: 'No reconciliation was recorded for this snapshot.', recBy: (a: string, d: string) => `Recorded by ${a} on ${d}`, origin: 'Where do these numbers come from', reported: 'Report value', clarix: 'Clarix value', result: 'Result', notProvided: 'Not provided',
    res: { matches: 'Matches', differs: 'Differs', unavailable: 'Cannot be reconciled', not_provided: 'Not provided' } as Record<string, string>,
    trace: 'Appendix: where each number comes from', traceLead: 'Source rows stored with the snapshot for each figure (file and physical line).', noRefs: 'No source rows were stored.',
    prov: 'Approved imports used', files: 'Files', sha: 'SHA-256',
    methodTitle: 'Method',
    method: 'Numbers are calculated by code from the approved imports listed above. Nothing in this report was typed in by hand, estimated or written by AI. Every number can be traced in Clarix to its file and line.',
  },
  ar: {
    header: 'Clarix - تقرير لقطة', page: 'صفحة ', of: ' من ',
    title: 'تقرير لقطة', factory: 'المصنع', snapshot: 'اللقطة', savedOn: 'تاريخ الحفظ', savedBy: 'حفظها', snapshotId: 'معرّف اللقطة', exported: 'تاريخ التصدير', language: 'اللغة', langValue: 'العربية (من اليمين إلى اليسار)', defs: 'إصدار التعريفات',
    frozen: 'لقطة مجمّدة. هذه الأرقام كما كانت تمامًا عند حفظ اللقطة. لا يُعاد حسابها، ولا تغيّرها عمليات الاستيراد اللاحقة.',
    changed: 'ملاحظة: توجد عمليات استيراد أحدث لهذه الطلبات. يعرض هذا التقرير الأرقام المجمّدة.',
    note: 'ملاحظة',
    howTitle: 'كيف تقرأ هذا التقرير',
    how: ['التشغيلة أ والتشغيلة ب هما تشغيلتا الإنتاج اللتان قورنتا.', 'كل حالة تظهر بكلمة ورمز: سليم (علامة صح)، تحقّق (مثلث)، محجوب (مثمّن عليه علامة خطأ). اللون ليس الإشارة الوحيدة أبدًا.', '"غير متاح" يعني أن الرقم لم يمكن حسابه من البيانات، ولا يظهر أبدًا كصفر.', 'الفرق هو التشغيلة ب ناقص التشغيلة أ، كما هو محفوظ.'],
    runs: 'التشغيلتان', side: 'التشغيلة', order: 'الطلب', source: 'المصدر', importId: 'معرّف الاستيراد', date: 'التاريخ', overall: 'الحالة العامة', groups: 'الحالة حسب المجموعة', runA: 'التشغيلة أ', runB: 'التشغيلة ب',
    status: { green: 'سليم', yellow: 'تحقّق', red: 'محجوب' } as Record<string, string>,
    group: { volume: 'الكميات', changeover: 'تغيير الإعداد', downtime: 'التوقف' } as Record<string, string>,
    summary: 'الملخص', overallStatus: 'الحالة العامة',
    downtimeSentence: 'يُسجَّل التوقف بشكل منفصل ولا يُفترض أنه يفسّر الفرق.',
    kpis: 'الأرقام الرئيسية', metric: 'الرقم', diff: 'الفرق (ب - أ)', na: 'غير متاح', noEvents: 'لم تُسجَّل أحداث',
    blocked: (g: string) => `${g}: بعض الأرقام لا يمكن حسابها`, blockedBody: 'مشكلات في البيانات تحجب بعض أرقام هذه المجموعة. الأرقام المتأثرة تظهر "غير متاح"، والأرقام التي أمكن حسابها تظهر كما حُفظت.', reasons: 'الأسباب',
    charts: 'الرسوم البيانية', chartNa: 'غير متاح - لا يُرسم عمود.', axis: 'المقياس',
    downtime: 'التوقف (يُعرض منفصلًا)',
    sentences: 'الجمل الواضحة المحفوظة مع اللقطة', questions: 'أسئلة للمتابعة',
    issues: 'المشكلات الموجودة عند حفظ اللقطة', noIssues: 'لم تُسجَّل مشكلات.', code: 'الرمز', message: 'الرسالة', group_: 'المجموعة', where: 'الملف والسطر', severity: { info: 'معلومة', warning: 'تحذير', error: 'خطأ' } as Record<string, string>, line: 'السطر', column: 'العمود', lineMissing: 'السطر غير محفوظ',
    recs: 'سجلات المطابقة', noRecs: 'لم تُسجَّل مطابقة لهذه اللقطة.', recBy: (a: string, d: string) => `سجّلها ${a} في ${d}`, origin: 'من أين تأتي هذه الأرقام', reported: 'قيمة التقرير', clarix: 'قيمة Clarix', result: 'النتيجة', notProvided: 'لم تُقدَّم',
    res: { matches: 'متطابق', differs: 'مختلف', unavailable: 'لا يمكن المطابقة', not_provided: 'لم تُقدَّم' } as Record<string, string>,
    trace: 'ملحق: من أين يأتي كل رقم', traceLead: 'صفوف المصدر المحفوظة مع اللقطة لكل رقم (الملف والسطر الفعلي).', noRefs: 'لم تُحفظ صفوف مصدر.',
    prov: 'عمليات الاستيراد المعتمدة المستخدمة', files: 'الملفات', sha: 'SHA-256',
    methodTitle: 'المنهجية',
    method: 'تُحسب الأرقام برمجيًا من عمليات الاستيراد المعتمدة المذكورة أعلاه. لا شيء في هذا التقرير أُدخل يدويًا أو قُدّر أو كتبه ذكاء اصطناعي. يمكن تتبّع كل رقم في Clarix إلى ملفه وسطره.',
  },
};
type Copy = typeof COPY.en;

const VOLUME_KEYS = ['input_kg', 'good_kg', 'scrap_kg', 'scrap_rate_pct', 'good_rate_pct', 'material_balance_kg'];
const GROUP_KEYS: Record<Group, string[]> = { volume: VOLUME_KEYS, changeover: ['changeover_min'], downtime: ['downtime_min'] };
const GROUPS: Group[] = ['volume', 'changeover', 'downtime'];

/* ---------- small static components ---------- */

function StatusIcon({ s }: { s: string }) {
  if (s === 'green') return <svg className="ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M5 8.3l2 2 4-4.4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>;
  if (s === 'yellow') return <svg className="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l6.6 12H1.4z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M8 6v4M8 11.6v.8" stroke="currentColor" strokeWidth="1.8" /></svg>;
  return <svg className="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.2 1.5h5.6l3.7 3.7v5.6l-3.7 3.7H5.2l-3.7-3.7V5.2z" fill="currentColor" /><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="#fff" strokeWidth="1.8" /></svg>;
}
function StatusWord({ s, c, label }: { s: string; c: Copy; label?: string }) {
  return <span className={`st st-${s}`}><StatusIcon s={s} /><span>{label ? `${label}: ` : ''}{c.status[s] ?? s}</span></span>;
}
const Num = ({ v }: { v: string }) => <bdi dir="ltr" className="num">{normalizeSign(v)}</bdi>;
function Qty({ v, unit, lang, L }: { v: string; unit: string; lang: ReportLang; L: ReportLabels }) {
  const word = isUnitKey(unit) ? unitWord(v, unit, lang) : L.unit(unit);
  return <span className="nw"><Num v={v} />{word ? <>{NBSP}<span className="unit">{word}</span></> : null}</span>;
}
/** Fixed server sentence: signed numbers isolated LTR; text not changed except display wording rules. */
function Sentence({ text, lang }: { text: string; lang: ReportLang }) {
  return <>{splitSignedNumbers(normalizeFixedText(text, lang)).map((p, i) => (p.kind === 'signed' ? <bdi key={i} dir="ltr" className="num nw">{p.value}</bdi> : <span key={i}>{p.value}</span>))}</>;
}
const U = ({ children }: { children: string }) => <bdi dir="auto">{neutralize(children)}</bdi>;
const Sec = ({ title, children, cls }: { title: string; children: ReactNode; cls?: string }) => <section className={`sec ${cls ?? ''}`}><h2>{title}</h2>{children}</section>;

function MetricCell({ m, lang, L, c }: { m: ReportMetric | undefined; lang: ReportLang; L: ReportLabels; c: Copy }) {
  if (!m || !m.available || m.display == null) return <span className="na">{c.na}</span>;
  return <span><Qty v={m.display} unit={m.unit} lang={lang} L={L} />{m.hours ? <> <span className="muted">(<Qty v={m.hours} unit="h" lang={lang} L={L} />)</span></> : null}{m.noEvents ? <span className="muted"> · {c.noEvents}</span> : null}</span>;
}

const inGroup = (i: ReportIssue, g: Group) => i.group.split(',').map((x) => x.trim()).some((x) => x === g || x === 'all');

function BlockedBox({ g, d, c, L }: { g: Group; d: ReportComparison; c: Copy; L: ReportLabels }) {
  const reasons = [...d.a.issues.map((i) => ({ i, s: c.runA })), ...d.b.issues.map((i) => ({ i, s: c.runB }))].filter(({ i }) => i.severity === 'error' && inGroup(i, g));
  return (
    <div className="blocked avoid">
      <p className="bh"><StatusIcon s="red" /> {c.blocked(c.group[g])}</p>
      <p className="muted">{c.blockedBody}</p>
      {reasons.length > 0 && <><p className="small strong">{c.reasons}</p><ul className="small">{reasons.map(({ i, s }, k) => <li key={k}><span className="mono">{i.code}</span> · {L.issue(i.code)} · {s} · <U>{i.sourceName}</U></li>)}</ul></>}
    </div>
  );
}

function MetricTable({ keys, d, lang, L, c }: { keys: string[]; d: ReportComparison; lang: ReportLang; L: ReportLabels; c: Copy }) {
  const of = (arr: ReportMetric[], k: string) => arr.find((m) => m.key === k);
  return (
    <table className="tbl avoid">
      <thead><tr><th>{c.metric}</th><th>{c.runA}</th><th>{c.runB}</th><th className="hl">{c.diff}</th></tr></thead>
      <tbody>{keys.map((k) => (
        <tr key={k}><th scope="row">{L.metric(k)}</th><td><MetricCell m={of(d.a.metrics, k)} lang={lang} L={L} c={c} /></td><td><MetricCell m={of(d.b.metrics, k)} lang={lang} L={L} c={c} /></td><td className="hl"><MetricCell m={of(d.differences, k)} lang={lang} L={L} c={c} /></td></tr>
      ))}</tbody>
    </table>
  );
}

/** Vector bar chart. plotValue/axisMin/axisMax used for geometry only; every label is a stored display string. */
function Chart({ spec, lang, L, c }: { spec: ReportChart; lang: ReportLang; L: ReportLabels; c: Copy }) {
  const pick = (x: Bi) => (lang === 'ar' ? x.ar : x.en);
  const rtl = lang === 'ar';
  const W = 460, H = 18;
  const span = spec.axisMax - spec.axisMin;
  return (
    <figure className="chart avoid">
      <figcaption><span className="strong">{pick(spec.title)}</span> <StatusWord s={spec.status} c={c} /></figcaption>
      {spec.difference && <p className="small">{c.diff}: <MetricCell m={spec.difference} lang={lang} L={L} c={c} /></p>}
      {spec.series.map((p, idx) => {
        const side = p.key === 'a' ? c.runA : p.key === 'b' ? c.runB : '';
        const ok = p.available && p.display != null && p.plotValue != null && span > 0;
        const frac = ok ? Math.max(0, Math.min(1, (p.plotValue! - spec.axisMin) / span)) : 0;
        const w = Math.max(1, frac * W);
        const pid = `hatch-${spec.key}-${idx}`.replace(/[^a-z0-9-]/gi, '');
        return (
          <div key={p.key} className="bar">
            <p className="small"><span className="strong">{side}</span> <U>{p.label}</U>{ok && <> · <Qty v={p.display!} unit={spec.unit} lang={lang} L={L} /></>}{p.noEvents && <span className="muted"> · {c.noEvents}</span>}</p>
            {ok ? (
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden="true">
                <defs><pattern id={pid} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fff" /><rect width="3" height="6" fill="var(--report-brand)" /></pattern></defs>
                <rect x="0" y="0" width={W} height={H} fill="none" stroke="#c9d3ce" strokeWidth="0.8" />
                <rect x={rtl ? W - w : 0} y="2" width={w} height={H - 4} fill={p.key === 'b' ? `url(#${pid})` : 'var(--report-brand)'} stroke="var(--report-brand)" strokeWidth="0.8" />
              </svg>
            ) : (
              <p className="na-box"><StatusIcon s="red" /> {c.na}. {c.chartNa}{pick(p.reason) ? <> <U>{pick(p.reason)}</U></> : null}</p>
            )}
          </div>
        );
      })}
      <p className="axis small muted">{c.axis}: <Qty v={String(spec.axisMin)} unit={spec.unit} lang={lang} L={L} /> – <Qty v={String(spec.axisMax)} unit={spec.unit} lang={lang} L={L} /></p>
      {pick(spec.changeText) && <p className="small"><Sentence text={pick(spec.changeText)} lang={lang} /></p>}
      {pick(spec.caption) && <p className="small muted"><Sentence text={pick(spec.caption)} lang={lang} /></p>}
    </figure>
  );
}

function Loc({ f, c }: { f: { file: string; line: number; column?: string | null }; c: Copy }) {
  return <><U>{f.file}</U> · {c.line} <Num v={String(f.line)} />{f.column ? <> · {c.column} <U>{f.column}</U></> : null}</>;
}

function fmtDate(iso: string, lang: ReportLang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC', numberingSystem: 'latn' }).format(d) + ' UTC';
}

/* ---------- document ---------- */

export function ReportDocument({ r, L }: { r: SnapshotReportPayload; L: ReportLabels }) {
  const lang = r.language === 'ar' ? 'ar' : 'en';
  const c = COPY[lang];
  const pick = (x: Bi) => (lang === 'ar' ? x.ar : x.en);
  const d = r.comparison;
  const s = r.snapshot;
  const blocked = (g: Group) => d.groups[g] === 'red';
  const bars = d.chart_spec.filter((x) => x.kind === 'bars');
  const mainCharts = bars.filter((x) => x.key !== 'downtime_min');
  const downChart = bars.find((x) => x.key === 'downtime_min');
  const issues = r.issues ?? [...d.a.issues, ...d.b.issues];
  const refRows = [['a', d.a.metrics], ['b', d.b.metrics], ['d', d.differences]].flatMap(([side, ms]) => (ms as ReportMetric[]).flatMap((m) => (m.refs ?? []).map((ref) => ({ side: side as string, key: m.key, ref }))));
  const runs: [string, ReportRun][] = [[c.runA, d.a], [c.runB, d.b]];
  return (
    <main>
      <header className="cover avoid">
        <p className="brand"><span className="mark" aria-hidden="true" />Clarix</p>
        <h1>{c.title}</h1>
        <p className="stitle"><U>{s.title}</U></p>
        <dl className="meta">
          <dt>{c.factory}</dt><dd><U>{r.factoryName}</U></dd>
          <dt>{c.savedOn}</dt><dd>{fmtDate(s.createdAt, lang)}</dd>
          <dt>{c.savedBy}</dt><dd><U>{s.author}</U></dd>
          <dt>{c.snapshotId}</dt><dd className="mono">{s.id}</dd>
          <dt>{c.exported}</dt><dd>{fmtDate(r.exportedAt, lang)}</dd>
          <dt>{c.language}</dt><dd>{c.langValue}</dd>
          <dt>{c.defs}</dt><dd className="mono"><U>{r.definitionsVersion}</U></dd>
        </dl>
        <p className="frozen"><span aria-hidden="true">&#10052;</span> {c.frozen}</p>
        {s.changed && <p className="small">{c.changed}</p>}
        {s.note && <p className="note"><span className="strong">{c.note}: </span><U>{s.note}</U></p>}
      </header>

      <aside className="how avoid"><h2>{c.howTitle}</h2><ul>{c.how.map((x, i) => <li key={i}>{x}</li>)}</ul></aside>

      <Sec title={c.runs}>
        <table className="tbl avoid">
          <thead><tr><th>{c.side}</th><th>{c.order}</th><th>{c.source}</th><th>{c.importId}</th><th>{c.date}</th><th>{c.overall}</th><th>{c.groups}</th></tr></thead>
          <tbody>{runs.map(([label, run]) => (
            <tr key={label}><th scope="row">{label}</th><td><U>{run.orderId}</U></td><td><U>{run.sourceName}</U></td><td className="mono xs">{run.importId}</td><td>{run.date ? <Num v={run.date} /> : <span className="na">{c.na}</span>}</td><td><StatusWord s={run.overall} c={c} /></td>
              <td>{GROUPS.filter((g) => run.groups[g]).map((g) => <div key={g}><StatusWord s={run.groups[g]} c={c} label={c.group[g]} /></div>)}</td></tr>
          ))}</tbody>
        </table>
      </Sec>

      <Sec title={c.summary}>
        <p><StatusWord s={d.overall} c={c} label={c.overallStatus} /> {GROUPS.filter((g) => d.groups[g]).map((g) => <span key={g}> <StatusWord s={d.groups[g]} c={c} label={c.group[g]} /></span>)}</p>
        <p className="lead"><Sentence text={pick(d.summary)} lang={lang} /></p>
        <p className="separate">{c.downtimeSentence}</p>
      </Sec>

      <Sec title={c.kpis}>
        {d.indicators.length > 0 && (
          <table className="tbl avoid">
            <thead><tr><th>{c.metric}</th><th>{c.runA}</th><th>{c.runB}</th><th className="hl">{c.diff}</th><th>{c.overall}</th></tr></thead>
            <tbody>{d.indicators.map((k) => {
              const pt = (key: string) => k.series.find((p) => p.key === key);
              const cell = (p: ReportPoint | undefined) => (p && p.available && p.display != null ? <Qty v={p.display} unit={k.unit} lang={lang} L={L} /> : <span className="na">{c.na}</span>);
              return <tr key={k.key}><th scope="row">{pick(k.title)}</th><td>{cell(pt('a'))}</td><td>{cell(pt('b'))}</td><td className="hl"><MetricCell m={k.difference} lang={lang} L={L} c={c} /></td><td><StatusWord s={k.status} c={c} /></td></tr>;
            })}</tbody>
          </table>
        )}
        {(['volume', 'changeover'] as Group[]).map((g) => (
          <div key={g} className="grp"><h3>{c.group[g]} <StatusWord s={d.groups[g] ?? 'green'} c={c} /></h3>{blocked(g) && <BlockedBox g={g} d={d} c={c} L={L} />}<MetricTable keys={GROUP_KEYS[g]} d={d} lang={lang} L={L} c={c} /></div>
        ))}
      </Sec>

      {mainCharts.length > 0 && <Sec title={c.charts}>{mainCharts.map((x) => <Chart key={x.key} spec={x} lang={lang} L={L} c={c} />)}</Sec>}

      <Sec title={c.downtime} cls="down">
        <p className="separate">{c.downtimeSentence}</p>
        {blocked('downtime') && <BlockedBox g="downtime" d={d} c={c} L={L} />}<MetricTable keys={GROUP_KEYS.downtime} d={d} lang={lang} L={L} c={c} />
        {downChart && <Chart spec={downChart} lang={lang} L={L} c={c} />}
      </Sec>

      <Sec title={c.sentences}>
        <p><Sentence text={pick(d.summary)} lang={lang} /></p>
        {d.questions.length > 0 && <><h3>{c.questions}</h3><ol>{d.questions.map((q) => <li key={q.key}><Sentence text={pick(q)} lang={lang} /></li>)}</ol></>}
      </Sec>

      <Sec title={c.issues}>
        {issues.length === 0 ? <p className="muted">{c.noIssues}</p> : (
          <table className="tbl">
            <thead><tr><th>{c.code}</th><th>{c.message}</th><th>{c.group_}</th><th>{c.where}</th></tr></thead>
            <tbody>{issues.map((i, k) => (
              <tr key={k} className="avoid"><td className="mono">{i.code}<div className="xs">{c.severity[i.severity] ?? i.severity}</div></td><td>{L.issue(i.code)}{i.orderId ? <div className="xs muted">{c.order}: <U>{i.orderId}</U></div> : null}</td>
                <td>{i.group.split(',').map((g) => c.group[g.trim()] ?? g.trim()).join(', ')}</td>
                <td><div><U>{i.sourceName}</U></div>{i.refs && i.refs.length > 0 ? i.refs.map((ref, n) => <div key={n} className="xs"><Loc f={ref} c={c} /></div>) : <span className="xs muted">{c.lineMissing}</span>}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Sec>

      <Sec title={c.recs}>
        {r.reconciliations.length === 0 ? <p className="muted">{c.noRecs}</p> : r.reconciliations.map((rec, n) => (
          <div key={n} className="rec">
            <p className="small strong">{c.recBy(neutralize(rec.author), fmtDate(rec.createdAt, lang))}</p>
            {rec.result.origin && <p className="small">{c.origin}: <U>{rec.result.origin}</U></p>}
            <table className="tbl">
              <thead><tr><th>{c.metric}</th><th>{c.reported}</th><th>{c.clarix}</th><th className="hl">{c.diff}</th><th>{c.result}</th></tr></thead>
              <tbody>{rec.result.figures.map((f, k) => {
                const unav = f.result === 'unavailable';
                return (
                  <tr key={k} className="avoid">
                    <th scope="row"><span className="xs muted">{f.side === 'a' ? c.runA : c.runB}</span><br />{L.metric(f.key)}</th>
                    <td>{f.reported == null ? <span className="na">{c.notProvided}</span> : <Qty v={f.reported} unit={f.unit} lang={lang} L={L} />}</td>
                    <td>{unav || f.clarix == null ? <span className="na">{c.na}</span> : <Qty v={f.clarix} unit={f.unit} lang={lang} L={L} />}</td>
                    <td className="hl">{unav || f.difference == null ? <span className="na">{c.na}</span> : <Qty v={f.difference} unit={f.unit} lang={lang} L={L} />}</td>
                    <td><span className={`st st-${unav ? 'red' : f.result === 'differs' ? 'yellow' : 'green'}`}><StatusIcon s={unav ? 'red' : f.result === 'differs' ? 'yellow' : 'green'} />{c.res[f.result] ?? f.result}</span>
                      {pick(f.sentence) && <div className="xs"><Sentence text={pick(f.sentence)} lang={lang} /></div>}
                      {unav && pick(f.reason) && <div className="xs muted"><U>{pick(f.reason)}</U></div>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        ))}
      </Sec>

      <Sec title={c.prov}>
        <ul className="prov">{r.provenance.map((p) => (
          <li key={p.importId} className="avoid"><span className="strong">{c.importId}: </span><span className="mono">{p.importId}</span>
            <ul>{p.files.map((f, k) => <li key={k}><U>{f.name}</U><br /><span className="mono xs">{c.sha} {f.sha256}</span></li>)}</ul></li>
        ))}</ul>
      </Sec>

      <Sec title={c.trace}>
        <p className="small muted">{c.traceLead}</p>
        {refRows.length === 0 ? <p className="muted">{c.noRefs}</p> : (
          <table className="tbl"><thead><tr><th>{c.metric}</th><th>{c.side}</th><th>{c.where}</th></tr></thead>
            <tbody>{refRows.map(({ side, key, ref }, k) => <tr key={k}><td>{L.metric(key)}</td><td>{side === 'a' ? c.runA : side === 'b' ? c.runB : c.diff}</td><td className="xs"><Loc f={ref} c={c} /></td></tr>)}</tbody></table>
        )}
      </Sec>

      <aside className="how method avoid"><h2>{c.methodTitle}</h2><p>{c.method}</p></aside>
    </main>
  );
}

function css(lang: ReportLang, f: ReportFonts, snapshotId: string): string {
  const c = COPY[lang];
  const family = lang === 'ar' ? "'Clarix Plex Arabic', 'Clarix Inter'" : "'Clarix Inter', 'Clarix Plex Arabic'";
  return `
@font-face{font-family:'Clarix Inter';src:url(${f.inter}) format('woff2');font-weight:100 900;font-style:normal}
@font-face{font-family:'Clarix Plex Arabic';src:url(${f.arabic400}) format('woff2');font-weight:400;unicode-range:U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200C-200F}
@font-face{font-family:'Clarix Plex Arabic';src:url(${f.arabic600}) format('woff2');font-weight:600 700;unicode-range:U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200C-200F}
@page{size:A4;margin:20mm 15mm 18mm;
 @top-left{content:${cssStr(lang === 'ar' ? '' : c.header)};font:600 8pt ${family};color:#1f5c46}
 @top-right{content:${cssStr(lang === 'ar' ? c.header : '')};font:600 8pt ${family};color:#1f5c46}
 @bottom-left{content:${cssStr(lang === 'ar' ? '' : `${c.snapshotId} ${snapshotId}`)};font:7pt ${family};color:#4a5a53}
 @bottom-right{content:${cssStr(lang === 'ar' ? `${c.snapshotId} ${snapshotId}` : '')};font:7pt ${family};color:#4a5a53}
 @bottom-center{content:${cssStr(c.page)} counter(page) ${cssStr(c.of)} counter(pages);font:8pt ${family};color:#22302a}}
*{box-sizing:border-box}
html{background:#fff;color:#16211c;font-family:${family};font-size:9.5pt;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-variant-numeric:tabular-nums lining-nums}
body{margin:0}main{max-width:180mm;margin:0 auto}
h1{font-size:20pt;margin:2mm 0 1mm;letter-spacing:-0.01em}h2{font-size:12pt;margin:0 0 2mm;color:#1f5c46;border-bottom:1.2pt solid #1f5c46;padding-bottom:1mm;break-after:avoid}h3{font-size:10pt;margin:3mm 0 1.5mm;break-after:avoid}
.sec{margin-top:6mm}.avoid{break-inside:avoid}
.brand{display:flex;align-items:center;gap:2mm;font-weight:700;color:#1f5c46;margin:0;letter-spacing:.06em;text-transform:uppercase;font-size:8.5pt}
.mark{display:inline-block;width:4mm;height:4mm;border:1.4pt solid #1f5c46;border-radius:1mm;background:linear-gradient(135deg,#1f5c46 50%,transparent 50%)}
.stitle{font-size:13pt;font-weight:600;margin:0 0 3mm}
.meta{display:grid;grid-template-columns:38mm 1fr;gap:1mm 4mm;margin:0;padding:3mm;border:0.8pt solid #c9d3ce;border-radius:2mm;background:#f4f8f6}.meta dt{color:#4a5a53}.meta dd{margin:0}
.frozen{margin:3mm 0 0;padding:2mm 3mm;border-inline-start:2.5pt solid #1f5c46;background:#eef5f1;font-weight:500}
.note{margin:2mm 0 0;padding:2mm 3mm;border:0.6pt dashed #9fb0a8}
.how{margin-top:5mm;padding:3mm 4mm;border:1pt solid #1f5c46;border-radius:2mm}.how ul{margin:0;padding-inline-start:5mm}.how h2{border:0;margin-bottom:1mm}
.method{margin-top:8mm}
.tbl{width:100%;border-collapse:collapse;margin:1mm 0 2mm;font-size:8.8pt}.tbl th,.tbl td{border:0.6pt solid #c9d3ce;padding:1.4mm 2mm;text-align:start;vertical-align:top}
.tbl thead th{background:#eef2f0;font-size:7.8pt;text-transform:uppercase;letter-spacing:.03em;color:#33433c}.tbl thead{display:table-header-group}.tbl tr{break-inside:avoid}
.hl{background:#f4f8f6}
.st{display:inline-flex;align-items:center;gap:1mm;font-weight:600;white-space:nowrap}.ico{width:3.4mm;height:3.4mm;flex:none}.st-green{color:#1f5c46}.st-yellow{color:#6b5310}.st-red{color:#8a1f1f}
.na{font-style:italic;color:#4a5a53}.muted{color:#4a5a53}.small{font-size:8.6pt;margin:1mm 0}.xs{font-size:7.6pt}.strong{font-weight:600}
.mono{font-family:'Clarix Inter',monospace;font-feature-settings:'tnum' 1;word-break:break-all}.num{unicode-bidi:isolate}.nw{white-space:nowrap}.unit{color:#33433c}
.lead{font-size:11pt;font-weight:500}.separate{padding-inline-start:3mm;border-inline-start:2pt dotted #4a5a53;color:#33433c}
.blocked{border:1pt solid #8a1f1f;border-radius:2mm;padding:2.5mm 3mm;margin:1mm 0}.bh{display:flex;align-items:center;gap:1.5mm;font-weight:700;color:#8a1f1f;margin:0}
.chart{margin:0 0 4mm;padding:3mm;border:0.6pt solid #c9d3ce;border-radius:2mm}.chart figcaption{display:flex;justify-content:space-between;gap:2mm}.bar{margin:1.5mm 0}.bar svg{display:block}
.na-box{display:flex;align-items:center;gap:1.5mm;border:0.8pt dashed #8a1f1f;padding:1mm 2mm;margin:0;font-size:8.4pt}
.rec{margin-bottom:4mm}.prov{padding-inline-start:4mm}.prov li{margin-bottom:1.5mm}
`;
}

/** Full static HTML document. Throws if the fonts are not embedded data. */
export function renderReportHtml(r: SnapshotReportPayload, L: ReportLabels, fonts: ReportFonts): string {
  if (![fonts.inter, fonts.arabic400, fonts.arabic600].every(isEmbeddedFont)) throw new Error('fonts_not_embedded');
  const lang: ReportLang = r.language === 'ar' ? 'ar' : 'en';
  const filename = safeFilename(r.filename, `clarix-${r.snapshot.id}-${lang}`);
  // The print theme always uses the spec's light brand token, never the
  // signed-in user's dark palette. SVG fills and CSS share this one token.
  const printBrand = '#0f766e';
  const body = renderToStaticMarkup(<ReportDocument r={r} L={L} />);
  const title = renderToStaticMarkup(<title>{docTitleOf(filename)}</title>);
  const csp = "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; script-src 'none'; base-uri 'none'; form-action 'none'";
  return `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer">${title}<style>:root{--report-brand:${printBrand}}${css(lang, fonts, r.snapshot.id.replace(/[^a-z0-9-]/gi, '')).replaceAll('#1f5c46', 'var(--report-brand)')}</style></head><body>${body}</body></html>`;
}
