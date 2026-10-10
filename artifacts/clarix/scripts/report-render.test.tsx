import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neutralize, renderReportHtml, safeFilename, isEmbeddedFont, type SnapshotReportPayload, type ReportLabels } from '../src/lib/report/render';

const F = `data:font/woff2;base64,${'A'.repeat(5000)}`;
const fonts = { inter: F, arabic400: F, arabic600: F };
const L: ReportLabels = { metric: (k) => `M:${k}`, issue: (c) => `I:${c}`, unit: (u) => u };
const SID = '11111111-2222-4333-8444-555555555555';
const RUN_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ISSUE_ID = 'ffffffff-0000-4000-8000-000000000001';
const REC_ID = 'ffffffff-0000-4000-8000-000000000002';
const bi = (s: string) => ({ en: s, ar: s });
const m = (key: string, unit: string, display: string | null, available = true) => ({ key, unit, status: 'green', value: display, display, hours: null, available, noEvents: false, alternatives: [], refs: [{ runId: RUN_ID, importId: 'imp-1', sourceName: 'x', orderId: 'o', file: '=evil.xlsx', line: 12, column: 'C', kind: 'value' }] });
const run = (orderId: string, extra: object = {}) => ({ id: RUN_ID, orderId, sourceName: '@src', importId: 'imp-1', date: '2024-03-01', capabilityLevel: 3, overall: 'green', groups: { volume: 'green', changeover: 'green', downtime: 'green' }, metrics: [m('scrap_rate_pct', 'pct', '5'), m('changeover_min', 'min', '240')], issues: [{ id: ISSUE_ID, code: 'E1', severity: 'error', group: 'volume', orderId: null, sourceName: 's' }], ...extra });

function sample(over: Partial<SnapshotReportPayload> = {}, groups: Record<string, string> = { volume: 'green', changeover: 'green', downtime: 'green' }): SnapshotReportPayload {
  return {
    filename: `clarix-najm-${SID}-en.pdf`, language: 'en', exportedAt: '2025-01-02T10:00:00Z', factoryName: '+Najm <b>Plant</b>',
    snapshot: { id: SID, title: '=HYPERLINK("x")<script>alert(1)</script>', note: '\tnote', author: '-Mona', createdAt: '2025-01-01T09:00:00Z', overall: 'green', changed: false },
    definitionsVersion: 'v1',
    comparison: {
      chart_spec: [{ key: 'scrap_rate_pct', kind: 'bars', title: bi('Scrap rate'), unit: 'pct', status: 'green', caption: bi('cap'), howToRead: bi(''), direction: 'higher', changeText: bi('Up by +5 pp'), axisMin: 0, axisMax: 20,
        difference: m('scrap_rate_pct', 'pp', '+5'),
        series: [{ key: 'a', label: '@ORD-1', display: '5', hours: null, plotValue: 5, available: true, reason: bi(''), noEvents: false, sourceName: null }, { key: 'b', label: 'ORD-2', display: '10', hours: null, plotValue: 10, available: true, reason: bi(''), noEvents: false, sourceName: null }] }],
      indicators: [], a: run('=ORD-1'), b: run('ORD-2', { metrics: [m('scrap_rate_pct', 'pct', '10'), m('changeover_min', 'min', '360')] }),
      differences: [m('scrap_rate_pct', 'pp', '+5'), m('changeover_min', 'min', '+120'), m('downtime_min', 'min', '-45')],
      overall: 'green', groups, summary: { en: 'Scrap rose from 5% to 10%, +5 pp. Changeover +120 minutes.', ar: 'ارتفع الهدر بمقدار +5 نقطة مئوية. الدفعة أ كلاريكس' }, questions: [],
    },
    provenance: [{ importId: 'imp-1', files: [{ name: '\rfile.csv', sha256: 'ab'.repeat(32) }] }],
    reconciliations: [{ id: REC_ID, author: '@auditor', createdAt: '2025-01-03T00:00:00Z', result: { origin: '=SUM(A1)', figures: [
      { side: 'a', runId: RUN_ID, key: 'input_kg', unit: 'kg', clarix: '100', reported: null, difference: null, result: 'not_provided', reason: bi(''), sentence: bi('') },
      { side: 'a', runId: RUN_ID, key: 'good_kg', unit: 'kg', clarix: null, reported: '50', difference: null, result: 'unavailable', reason: bi('-blocked reason'), sentence: bi('') },
    ] } }] as never,
    ...over,
  } as SnapshotReportPayload;
}
const text = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, '');

test('neutralize prefixes = + - @ TAB CR only', () => {
  for (const p of ['=', '+', '-', '@', '\t', '\r']) assert.equal(neutralize(`${p}x`), `'${p}x`);
  assert.equal(neutralize('plain'), 'plain');
  assert.equal(neutralize(''), '');
});

test('untrusted strings neutralised and escaped; no scripts or links', () => {
  const html = renderReportHtml(sample(), L, fonts);
  assert.ok(!/<script/i.test(html.replace(/&lt;script/g, '')));
  assert.ok(html.includes("&#x27;=HYPERLINK") || html.includes("'=HYPERLINK"));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!/<a\s|href=|https?:\/\//i.test(html));
  const t = text(html);
  for (const s of ["'+Najm", "'-Mona", "'@auditor", "'=SUM(A1)", "'=ORD-1", "'@src", "'@ORD-1", "'-blocked reason", "'=evil.xlsx"]) assert.ok(t.includes(s.replace(/'/g, '&#x27;')) || t.includes(s), s);
  assert.ok(/&#x27;\tnote|'\tnote/.test(t));
  assert.ok(/&#x27;\rfile|'\rfile/.test(t));
});

test('signed computed metrics are not prefixed, use U+2212 and NBSP', () => {
  const t = text(renderReportHtml(sample(), L, fonts));
  assert.ok(t.includes('+5\u00A0pp'));
  assert.ok(t.includes('+120\u00A0min'));
  assert.ok(t.includes('\u221245\u00A0min'));
  assert.ok(!t.includes("'+5") && !t.includes("&#x27;+5") && !t.includes("&#x27;\u221245"));
  for (const v of ['5\u00A0%', '10\u00A0%', '240\u00A0min', '360\u00A0min']) assert.ok(t.includes(v), v);
  assert.ok(t.includes('Downtime is recorded separately and is not assumed to explain the difference.'));
});

test('no internal ids except snapshot and import ids', () => {
  const html = renderReportHtml(sample(), L, fonts);
  assert.ok(html.includes(SID));
  assert.ok(html.includes('imp-1'));
  for (const id of [RUN_ID, ISSUE_ID, REC_ID]) assert.ok(!html.includes(id), id);
});

test('not provided vs cannot be reconciled; blocked group shows no figures', () => {
  const t = text(renderReportHtml(sample({}, { volume: 'red', changeover: 'green', downtime: 'green' }), L, fonts));
  assert.ok(t.includes('Not provided'));
  assert.ok(t.includes('Cannot be reconciled'));
  assert.ok(t.includes('Volume: some figures cannot be calculated'));
});

test('report.issues with refs is preferred and printed with file/line', () => {
  const t = text(renderReportHtml(sample({ issues: [{ code: 'Q9', group: 'downtime', severity: 'warning', orderId: null, sourceName: 'stops.csv', refs: [{ file: '+stops.csv', line: 42, column: 'D' }] }] }), L, fonts));
  assert.ok(t.includes('I:Q9'));
  assert.ok(!t.includes('I:E1'));
  assert.ok(/(&#x27;|')\+stops\.csv · line 42 · column D/.test(t));
});

test('Arabic: rtl document, legacy wording normalised, Arabic numerals stay Latin', () => {
  const html = renderReportHtml(sample({ language: 'ar', filename: `clarix-najm-${SID}-ar.pdf` }), L, fonts);
  assert.ok(html.includes('dir="rtl"') && html.includes('lang="ar"'));
  const t = text(html);
  assert.ok(t.includes('التشغيلة أ Clarix'));
  assert.ok(t.includes('+5\u00A0نقاط مئوية') || t.includes('+5\u00A0نقطة مئوية'));
  assert.ok(t.includes('يُسجَّل التوقف بشكل منفصل'));
});

test('fonts must be embedded data, filename sanitised, CSP forbids scripts', () => {
  assert.throws(() => renderReportHtml(sample(), L, { ...fonts, inter: '/assets/inter.woff2' }));
  assert.equal(isEmbeddedFont('/x.woff2'), false);
  assert.equal(safeFilename('Bad Name/../x.PDF', 'f'), 'bad-name-..-x.pdf'.replace('-..-', '-..-'));
  assert.equal(safeFilename('clarix-a-1-en.pdf', 'f'), 'clarix-a-1-en.pdf');
  const html = renderReportHtml(sample(), L, fonts);
  assert.ok(html.includes("script-src 'none'"));
  assert.ok(html.includes(`<title>clarix-najm-${SID}-en</title>`));
  assert.ok(html.includes('counter(pages)') && html.includes('size:A4'));
});

test('scenario 07: blocked volume keeps available stored metrics, unavailable ones say Not available, charts omit blocked bars', () => {
  const vol = (scrap: string | null) => [m('input_kg', 'kg', '1000'), m('good_kg', 'kg', '950'), m('scrap_kg', 'kg', null, false), m('scrap_rate_pct', 'pct', scrap, scrap != null), m('changeover_min', 'min', '240')];
  const r = sample({}, { volume: 'red', changeover: 'green', downtime: 'green' });
  r.comparison.a.metrics = vol(null); r.comparison.b.metrics = vol('10');
  r.comparison.differences = [m('input_kg', 'kg', '0'), m('good_kg', 'kg', '0'), m('scrap_kg', 'kg', null, false), m('scrap_rate_pct', 'pp', null, false)];
  r.comparison.chart_spec[0].series[0] = { ...r.comparison.chart_spec[0].series[0], available: false, display: null, plotValue: null, reason: bi('Scrap not usable') };
  const html = renderReportHtml(r, L, fonts);
  const t = text(html);
  assert.ok(t.includes('Volume: some figures cannot be calculated'));
  assert.ok(t.includes('M:input_kg') && t.includes('1000\u00A0kg') && t.includes('950\u00A0kg'));
  assert.ok(t.includes('10\u00A0%'), 'fixture 05-style retained 10%');
  assert.ok(t.includes('Not available'));
  const noAxis = text(html.replace(/<p class="axis[^"]*">[\s\S]*?<\/p>/g, ''));
  assert.ok(!/(?<![\d.])0\u00A0%/.test(noAxis) && !/(?<![\d.])0\u00A0pp/.test(noAxis), 'no fake zero for blocked difference');
  assert.ok(t.includes('Scrap not usable'));
  assert.equal((html.match(/<rect x="[^"]*" y="2"/g) ?? []).length, 1, 'only the available bar is drawn');
});

test('reconciliation stays strict: unavailable figure shows no Clarix value or difference', () => {
  const r = sample({}, { volume: 'red', changeover: 'green', downtime: 'green' });
  (r.reconciliations[0].result.figures as unknown as Record<string, unknown>[])[1].clarix = '950';
  const t = text(renderReportHtml(r, L, fonts));
  const recPart = t.slice(t.indexOf('Reconciliation records'));
  assert.ok(recPart.includes('Cannot be reconciled'));
  assert.ok(!recPart.slice(0, recPart.indexOf('Approved imports')).includes('950'));
});
