/**
 * Pure presentation helpers for numbers + units (Arabic and English).
 * Display only: the numeric string received from the server is never parsed
 * into a float and never changed, except that a leading ASCII hyphen-minus is
 * shown as a real minus sign (U+2212). No quantity arithmetic happens here.
 *
 * A byte-identical copy lives in artifacts/api-server/src/metrics/number-format.ts
 * so the fixed server templates use the same words. A test keeps them equal.
 */
export type Lang = 'en' | 'ar';
export type UnitKey = 'pp' | 'h' | 'min' | 'kg' | 'pct' | 'count';
export type GrammaticalCase = 'nom' | 'gen';
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

export const NBSP = '\u00A0';
export const MINUS = '\u2212';

const NUM_RE = /^([+\-\u2212]?)(\d+)(?:\.(\d+))?$/;

/** Shows a leading "-" as U+2212. Keeps "+" and all digits exactly. Non-numbers are returned unchanged. */
export function normalizeSign(value: string): string {
  const s = value.trim();
  return NUM_RE.test(s) && s.startsWith('-') ? MINUS + s.slice(1) : s;
}

/**
 * CLDR plural category from the decimal string (no float conversion).
 * Uses the absolute value. Any non-zero fraction is "other" (Arabic) / plural (English).
 */
export function pluralCategory(value: string, lang: Lang): PluralCategory {
  const m = NUM_RE.exec(value.trim());
  if (!m) return 'other';
  const int = m[2].replace(/^0+(?=\d)/, '');
  const frac = (m[3] ?? '').replace(/0+$/, '');
  if (frac) return 'other';
  if (lang === 'en') return int === '1' ? 'one' : 'other';
  if (int === '0') return 'zero';
  if (int === '1') return 'one';
  if (int === '2') return 'two';
  const last2 = Number(int.slice(-2)); // two-digit index for the grammar rule only
  if (last2 >= 3 && last2 <= 10) return 'few';
  if (last2 >= 11 && last2 <= 99) return 'many';
  return 'other';
}

type ArForms = { one: string; twoNom: string; twoGen: string; few: string; many: string; other: string };
const AR: Record<Exclude<UnitKey, 'pct'>, ArForms> = {
  pp: { one: 'نقطة مئوية', twoNom: 'نقطتان مئويتان', twoGen: 'نقطتين مئويتين', few: 'نقاط مئوية', many: 'نقطة مئوية', other: 'نقطة مئوية' },
  h: { one: 'ساعة', twoNom: 'ساعتان', twoGen: 'ساعتين', few: 'ساعات', many: 'ساعة', other: 'ساعة' },
  min: { one: 'دقيقة', twoNom: 'دقيقتان', twoGen: 'دقيقتين', few: 'دقائق', many: 'دقيقة', other: 'دقيقة' },
  kg: { one: 'كغ', twoNom: 'كغ', twoGen: 'كغ', few: 'كغ', many: 'كغ', other: 'كغ' },
  count: { one: 'طلب', twoNom: 'طلبان', twoGen: 'طلبين', few: 'طلبات', many: 'طلبًا', other: 'طلب' },
};
const EN_LONG: Record<Exclude<UnitKey, 'pct'>, [string, string]> = {
  pp: ['percentage point', 'percentage points'],
  h: ['hour', 'hours'],
  min: ['minute', 'minutes'],
  kg: ['kg', 'kg'],
  count: ['order', 'orders'],
};
const EN_SHORT: Record<Exclude<UnitKey, 'pct'>, [string, string]> = {
  pp: ['pp', 'pp'],
  h: ['h', 'h'],
  min: ['min', 'min'],
  kg: ['kg', 'kg'],
  count: ['order', 'orders'],
};

export function isUnitKey(u: string): u is UnitKey {
  return u === 'pp' || u === 'h' || u === 'min' || u === 'kg' || u === 'pct' || u === 'count';
}

/** The unit word that agrees with the number. English "short" keeps compact abbreviations (pp, h, min, kg). */
export function unitWord(value: string, unit: UnitKey, lang: Lang, opts: { style?: 'short' | 'long'; case?: GrammaticalCase } = {}): string {
  if (unit === 'pct') return opts.style === 'long' ? (lang === 'ar' ? 'بالمئة' : 'percent') : '%';
  const cat = pluralCategory(value, lang);
  if (lang === 'en') {
    const pair = (opts.style ?? 'short') === 'long' ? EN_LONG[unit] : EN_SHORT[unit];
    return cat === 'one' ? pair[0] : pair[1];
  }
  const f = AR[unit];
  switch (cat) {
    case 'one': return f.one;
    case 'two': return opts.case === 'gen' ? f.twoGen : f.twoNom;
    case 'few': return f.few;
    case 'many': return f.many;
    default: return f.other;
  }
}

/**
 * Plain-text "number + NBSP + unit" for every unit, including "5 %".
 * style "long" spells units out (for screen readers: "10 بالمئة", "10 percent").
 * Plain text carries no invisible bidi characters; in the UI the number is
 * isolated with <bdi dir="ltr"> instead, so copied text stays clean.
 */
export function formatQuantity(value: string, unit: UnitKey, lang: Lang, opts: { style?: 'short' | 'long'; case?: GrammaticalCase } = {}): string {
  const n = normalizeSign(value);
  return `${n}${NBSP}${unitWord(value, unit, lang, opts)}`;
}

/* ---------- display-time formatting of fixed server sentences ---------- */

export type TextPart = { kind: 'text'; value: string } | { kind: 'signed'; value: string };

const UNIT_WORDS = [
  'percentage points', 'percentage point', 'minutes', 'minute', 'hours', 'hour', 'min', 'kg', 'pp', 'h',
  'نقطتان مئويتان', 'نقطتين مئويتين', 'نقطة مئوية', 'نقاط مئوية', 'دقيقتان', 'دقيقتين', 'دقيقة', 'دقائق',
  'ساعتان', 'ساعتين', 'ساعة', 'ساعات', 'كغ',
];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const UNIT_SPACE_RE = new RegExp(`(\\d) (${UNIT_WORDS.map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
const PCT_RE = /(\d)[ \u00A0]?%/g;
// A sign directly before digits, not glued to a letter/digit (keeps "E-02", dates, "a-b" intact).
const SIGNED_RE = /(?<![\p{L}\p{N}_.\-\u2212])[+\-\u2212]\d+(?:\.\d+)?(?![\p{L}\p{N}])/gu;

/** One NBSP between a number and a known unit word. Text only; digits untouched. */
export function bindUnits(text: string): string {
  return text.replace(UNIT_SPACE_RE, `$1${NBSP}$2`).replace(PCT_RE, `$1${NBSP}%`);
}

/**
 * Splits a sentence so signed numbers can be isolated left-to-right in RTL text.
 * Signed tokens get U+2212 for "-". Used only at display; stored text is not modified.
 */
export function splitSignedNumbers(text: string): TextPart[] {
  const src = bindUnits(text);
  const out: TextPart[] = [];
  let last = 0;
  for (const m of src.matchAll(SIGNED_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ kind: 'text', value: src.slice(last, i) });
    out.push({ kind: 'signed', value: normalizeSign(m[0]) });
    last = i + m[0].length;
  }
  if (last < src.length) out.push({ kind: 'text', value: src.slice(last) });
  return out;
}

/** Same as splitSignedNumbers, joined back to plain text (for aria-labels / titles). */
export function formatSentence(text: string): string {
  return splitSignedNumbers(text).map((p) => p.value).join('');
}

/* ---------- display-only normalisation of fixed server templates ---------- */

/**
 * Older saved snapshots carry template text written before the wording fix.
 * Only fixed template phrases are rewritten, and only at display time. Never
 * apply this to raw uploaded cells, identifiers or file names.
 */
const AR_TERMS: Array<[RegExp, string]> = [
  [/كلاريكس/g, 'Clarix'],
  [/الدفعة (أ|ب)(?![\p{L}])/gu, 'التشغيلة $1'],
  [/التشغيل (أ|ب)(?![\p{L}])/gu, 'التشغيلة $1'],
];
const AR_UNIT_PHRASE = /(بمقدار )?([+\-\u2212]?\d+(?:\.\d+)?)[ \u00A0](نقطتان مئويتان|نقطتين مئويتين|نقطة مئوية|نقاط مئوية|دقيقتان|دقيقتين|دقيقة|دقائق|ساعتان|ساعتين|ساعة|ساعات)(?![\p{L}])/gu;
function arUnitOf(word: string): UnitKey {
  if (word.includes('نق')) return 'pp';
  if (word.startsWith('دق')) return 'min';
  return 'h';
}
export function normalizeFixedText(text: string, lang: Lang): string {
  if (lang !== 'ar') return text.replace(
    /(?<![\p{L}\p{N}_.])([+\-\u2212]?\d+(?:\.\d+)?)[ \u00A0]+(percentage points?|hours?|minutes?)(?![\p{L}])/gu,
    (_m, num: string, word: string) => `${num}${NBSP}${unitWord(num, word.startsWith('percentage') ? 'pp' : word.startsWith('hour') ? 'h' : 'min', 'en', { style: 'long' })}`,
  );
  let out = text;
  for (const [re, to] of AR_TERMS) out = out.replace(re, to);
  return out.replace(AR_UNIT_PHRASE, (_m, pre: string | undefined, num: string, word: string) =>
    `${pre ?? ''}${num}${NBSP}${unitWord(num, arUnitOf(word), 'ar', { case: pre ? 'gen' : 'nom' })}`);
}
