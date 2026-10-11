/**
 * Build-failing i18n checks (run via `pnpm run check:i18n`, also before `build`).
 * 1. Parity: every key in EN exists in AR and vice versa (plural suffixes normalised).
 * 2. Static keys: every literal t('a.b') / i18nKey="a.b" in src resolves in EN and AR.
 * 3. Hardcoded-string audit (report only): JSX text nodes with Latin letters.
 * Limitations: dynamic keys (template literals, variables) are not verified;
 * the hardcoded audit is a regex heuristic and does not fail the build.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const g = globalThis as unknown as { localStorage?: unknown };
g.localStorage ??= { getItem: () => null, setItem: () => undefined };

const root = new URL('..', import.meta.url).pathname;
const src = join(root, 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

const PLURAL = /_(zero|one|two|few|many|other)$/;
function flatten(o: unknown, prefix = '', out = new Set<string>()): Set<string> {
  if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else out.add(prefix.replace(PLURAL, ''));
  return out;
}

const { default: i18n } = await import('../src/lib/i18n');
for (const f of readdirSync(join(src, 'lib')).filter((f) => /i18n.*\.ts$/.test(f) && f !== 'i18n.ts').sort()) {
  await import(join(src, 'lib', f));
}

const en = flatten(i18n.getResourceBundle('en', 'translation'));
const ar = flatten(i18n.getResourceBundle('ar', 'translation'));
const errors: string[] = [];
for (const k of en) if (!ar.has(k)) errors.push(`missing in AR: ${k}`);
for (const k of ar) if (!en.has(k)) errors.push(`missing in EN: ${k}`);

const prefixes = new Set<string>();
for (const k of en) {
  const parts = k.split('.');
  for (let n = 1; n < parts.length; n++) prefixes.add(parts.slice(0, n).join('.'));
}
const keyRe = /\bt\(\s*'([a-zA-Z0-9_.]+)'|i18nKey=["']([a-zA-Z0-9_.]+)["']/g;
const textRe = />\s*([\p{L}][\p{L}\p{M} ,.'!?؟-]{2,})\s*</gu;
const hardcoded: string[] = [];
for (const file of walk(src)) {
  if (file.includes(`${join('src', 'components', 'ui')}`) || /i18n.*\.ts$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  const rel = relative(root, file);
  for (const m of text.matchAll(keyRe)) {
    const key = m[1] ?? m[2];
    if (!key.includes('.')) continue;
    if (!en.has(key) && !prefixes.has(key)) errors.push(`unknown key ${key} in ${rel}`);
    else if (en.has(key) && !ar.has(key)) errors.push(`key ${key} in ${rel} has no AR`);
  }
  if (file.endsWith('.tsx')) for (const m of text.matchAll(textRe)) hardcoded.push(`${rel}: "${m[1].trim()}"`);
}

if (hardcoded.length) {
  console.warn(`[i18n] hardcoded-string audit (report only, ${hardcoded.length}):`);
  for (const h of hardcoded) console.warn(`  ${h}`);
}
// Heuristic review findings, not a claim of complete rendered-screen coverage.
function auditMessages(o:unknown,path=""){
  if(!o||typeof o!=="object")return;
  for(const [key,value] of Object.entries(o)){
    const p=path?`${path}.${key}`:key;
    if(typeof value!=="string"){auditMessages(value,p);continue;}
    if(/هالك|الهالك|كلاريكس/.test(value))errors.push(`inconsistent Arabic terminology: ${p}`);
    const latin=value.replace(/{{.*?}}/g,"").match(/[A-Za-z]{3,}/g)??[];
    const allowed=new Set(["Clarix","DEMO","CSV","PDF","ERP","API","Gemini","Google","TOTP","UTC","SHA","UTF","CHG","UDT","MFA","ISBN"]);
    if(latin.some(w=>!allowed.has(w)))console.warn(`[i18n] review mixed-language AR: ${p}`);
    if(/{{count}}.*(?:ساعات|دقائق|نقاط مئوية)/.test(value)&&!PLURAL.test(key))
      console.warn(`[i18n] review number agreement: ${p}`);
  }
}
auditMessages(i18n.getResourceBundle('ar','translation'));
if (errors.length) {
  console.error(`[i18n] ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`[i18n] OK: ${en.size} keys, EN/AR parity and static keys verified.`);
