import i18n from '@/lib/i18n';

/** Phase 12 chart, indicator and glossary strings. All numbers come from the server. */
const en = {
  ch: {
    chartsTitle: 'At a glance',
    chartsLead: 'Charts show the same server values as the tables below.',
    kpiTitle: 'Key figures',
    kpiLead: 'Run B, with the change from Run A.',
    kpiSr: '{{run}}, {{label}}: {{value}}',
    howToRead: 'How to read this',
    howCalc: 'How was this calculated?',
    showTable: 'Show data table',
    hideTable: 'Hide data table',
    tableCaption: 'Data table: {{title}}',
    colItem: 'Item',
    colValue: 'Value',
    colStatus: 'Status',
    colNote: 'Note',
    na: 'Not available',
    naReason: 'Reason',
    openQuality: 'Open Data Quality',
    noEvents: 'No events recorded',
    difference: 'Difference (B minus A)',
    runA: 'Run A',
    runB: 'Run B',
    vsA: 'Run A',
    axisZero: '0',
    dir: { higher: 'Higher', lower: 'Lower', same: 'Same', unavailable: 'Not available' },
    unit: { pct: '%', min: 'min', count: 'orders', pp: 'pp' },
    stack: { green: 'OK', yellow: 'Check', red: 'Blocked', openRuns: 'Open production runs' },
    statusChartTitle: 'Current orders by status',
    pairTitle: 'Suggested pair: key figures',
    pairLead: 'These figures are for two orders only, {{a}} and {{b}}. They are not factory totals.',
    pairFew: 'Key figures appear when at least two current orders exist.',
    openSource: 'Open source rows',
    chartError: 'This chart could not be shown.',
    chartEmpty: 'No data to chart yet.',
  },
  gl: {
    open: 'What is {{term}}?',
    listTitle: 'Glossary',
    listLead: 'Short meanings of the words used on figures and charts.',
    terms: {
      scrap_rate: { term: 'Scrap rate', def: 'Scrap weight divided by input weight, shown as a percent.' },
      good_rate: { term: 'Good rate', def: 'Good output weight divided by input weight, shown as a percent.' },
      material_balance: { term: 'Material balance', def: 'Input minus good output minus scrap. It shows weight that is not accounted for.' },
      changeover: { term: 'Changeover', def: 'Time spent switching the line from one order to the next, in minutes.' },
      downtime: { term: 'Unplanned downtime', def: 'Time the line stopped without a plan. Shown separately. It is never treated as a cause.' },
      pp: { term: 'Percentage point', def: 'The plain difference between two percents. 10% minus 5% is 5 percentage points (pp).' },
      na: { term: 'Not available', def: 'The data needed is missing or not reliable. Clarix never shows a guess or a zero instead.' },
      ok: { term: 'OK', def: 'The data behind this figure passed every check.' },
      check: { term: 'Check', def: 'The figure was calculated, but some rows had problems. Read the warning first.' },
      blocked: { term: 'Blocked', def: 'A serious data problem. The figure is not shown until it is fixed.' },
    },
  },
};

const ar: typeof en = {
  ch: {
    chartsTitle: 'نظرة سريعة',
    chartsLead: 'تعرض الرسوم قيم الخادم نفسها الموجودة في الجداول أدناه.',
    kpiTitle: 'الأرقام الرئيسية',
    kpiLead: 'التشغيلة ب، مع التغيّر عن التشغيلة أ.',
    kpiSr: '{{run}}، {{label}}: {{value}}',
    howToRead: 'كيف تقرأ هذا',
    howCalc: 'كيف حُسب هذا؟',
    showTable: 'عرض جدول البيانات',
    hideTable: 'إخفاء جدول البيانات',
    tableCaption: 'جدول البيانات: {{title}}',
    colItem: 'البند',
    colValue: 'القيمة',
    colStatus: 'الحالة',
    colNote: 'ملاحظة',
    na: 'غير متاح',
    naReason: 'السبب',
    openQuality: 'فتح جودة البيانات',
    noEvents: 'لا توجد أحداث مسجّلة',
    difference: 'الفرق (ب ناقص أ)',
    runA: 'التشغيلة أ',
    runB: 'التشغيلة ب',
    vsA: 'التشغيلة أ',
    axisZero: '0',
    dir: { higher: 'أعلى', lower: 'أقل', same: 'مماثل', unavailable: 'غير متاح' },
    unit: { pct: '%', min: 'دقيقة', count: 'طلبات', pp: 'نقطة مئوية' },
    stack: { green: 'سليم', yellow: 'تحقق', red: 'محظور', openRuns: 'فتح عمليات الإنتاج' },
    statusChartTitle: 'الطلبات الحالية حسب الحالة',
    pairTitle: 'الزوج المقترح: الأرقام الرئيسية',
    pairLead: 'هذه الأرقام لطلبين فقط، {{a}} و{{b}}. وليست إجماليات المصنع.',
    pairFew: 'تظهر الأرقام الرئيسية عند وجود طلبين حاليين على الأقل.',
    openSource: 'فتح صفوف المصدر',
    chartError: 'تعذّر عرض هذا الرسم.',
    chartEmpty: 'لا توجد بيانات للرسم بعد.',
  },
  gl: {
    open: 'ما معنى {{term}}؟',
    listTitle: 'مسرد المصطلحات',
    listLead: 'معانٍ قصيرة للكلمات المستخدمة في الأرقام والرسوم.',
    terms: {
      scrap_rate: { term: 'نسبة الهالك', def: 'وزن الهالك مقسومًا على وزن المدخلات، كنسبة مئوية.' },
      good_rate: { term: 'نسبة الإنتاج السليم', def: 'وزن الإنتاج السليم مقسومًا على وزن المدخلات، كنسبة مئوية.' },
      material_balance: { term: 'توازن المواد', def: 'المدخلات ناقص الإنتاج السليم ناقص الهالك. يُظهر الوزن غير المحسوب.' },
      changeover: { term: 'التبديل', def: 'الوقت المستغرق لتحويل الخط من طلب إلى الطلب التالي، بالدقائق.' },
      downtime: { term: 'التوقف غير المخطط', def: 'وقت توقف الخط دون تخطيط. يُعرض منفصلًا ولا يُعامل أبدًا كسبب.' },
      pp: { term: 'نقطة مئوية', def: 'الفرق المباشر بين نسبتين. 10% ناقص 5% يساوي 5 نقاط مئوية.' },
      na: { term: 'غير متاح', def: 'البيانات اللازمة مفقودة أو غير موثوقة. لا يعرض Clarix تخمينًا أو صفرًا بدلًا منها.' },
      ok: { term: 'سليم', def: 'اجتازت البيانات خلف هذا الرقم كل الفحوص.' },
      check: { term: 'تحقق', def: 'حُسب الرقم لكن بعض الصفوف فيها مشكلات. اقرأ التحذير أولًا.' },
      blocked: { term: 'محظور', def: 'مشكلة خطيرة في البيانات. لا يُعرض الرقم حتى تُصلح.' },
    },
  },
};

i18n.addResourceBundle('en', 'translation', en, true, true);
i18n.addResourceBundle('ar', 'translation', ar, true, true);

export const GLOSSARY_KEYS = ['scrap_rate', 'good_rate', 'material_balance', 'changeover', 'downtime', 'pp', 'na', 'ok', 'check', 'blocked', 'snapshot', 'reconciliation', 'frozen'] as const;
export type GlossaryKey = (typeof GLOSSARY_KEYS)[number];

/** Map metric keys and status values to glossary entries. */
export const METRIC_GLOSSARY: Record<string, GlossaryKey> = {
  scrap_rate_pct: 'scrap_rate',
  good_rate_pct: 'good_rate',
  material_balance_kg: 'material_balance',
  changeover_min: 'changeover',
  downtime_min: 'downtime',
};
export const STATUS_GLOSSARY: Record<string, GlossaryKey> = { green: 'ok', yellow: 'check', red: 'blocked' };
