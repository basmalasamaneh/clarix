/**
 * Sample-generation driver (Phase 15). Usage:
 *   pnpm --filter @workspace/clarix exec tsx scripts/report-sample.tsx <report.json> <out.html>
 * report.json = the exact SnapshotReport body from POST /api/snapshots/:id/report.
 * Writes the same static print document the app prints. Open it in Chrome 131+
 * (e.g. headless `--print-to-pdf --no-pdf-header-footer`) to produce the sample PDF.
 * Fonts are read from the same bundled @fontsource files and inlined as data: URLs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const g = globalThis as unknown as { localStorage?: unknown };
g.localStorage ??= { getItem: () => null, setItem: () => undefined };
const { renderReportHtml } = await import('../src/lib/report/render');
const { reportLabels } = await import('../src/lib/report/labels');
const req = createRequire(import.meta.url);
const font = (p: string) => `data:font/woff2;base64,${readFileSync(req.resolve(p)).toString('base64')}`;
const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) { console.error('usage: report-sample.tsx <report.json> <out.html>'); process.exit(2); }
const report = JSON.parse(readFileSync(inPath, 'utf8'));
const html = renderReportHtml(report, reportLabels(report.language === 'ar' ? 'ar' : 'en'), {
  inter: font('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'),
  arabic400: font('@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2'),
  arabic600: font('@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2'),
});
writeFileSync(outPath, html);
console.log(`wrote ${outPath} (${html.length} bytes)`);
