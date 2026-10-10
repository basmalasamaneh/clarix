import i18n from './i18n';

/** Phase 15 PDF report strings (UI only; printed copy lives in lib/report/render.tsx). */
const en = {
  errors: { codes: {
    REPORT_TOO_LARGE: 'This snapshot is too large to put in one report. Nothing was cut; no report was made.',
    REPORT_RATE_LIMIT: 'Too many reports were prepared in the last few minutes. Wait a little and try again.',
    REPORT_BUSY: 'Clarix is busy preparing other reports. Try again in a moment.',
    REPORT_TIMEOUT: 'Preparing the report took too long. Try again.',
  } },
  help: {
    reportTitle: 'PDF reports',
    reportBody: 'On a snapshot, choose "Download PDF" and a language. Clarix prepares the frozen figures and opens your browser\'s print window. Choose "Save as PDF" as the destination; nothing downloads by itself. Works in current Chrome and Edge (version 131 or newer). The report shows the snapshot exactly as saved, never live figures.',
  },
  rpt: {
    title: 'PDF report',
    lead: 'A printable report of this frozen snapshot for people who do not use Clarix.',
    frozen: 'The PDF shows the figures exactly as frozen in this snapshot. Nothing is recalculated.',
    language: 'Report language',
    en: 'English',
    ar: 'Arabic',
    download: 'Download PDF',
    preparing: 'Preparing the report...',
    rendering: 'Laying out pages and fonts...',
    dialogNote: 'Your browser\'s print window will open. Choose "Save as PDF" as the destination and pick where to save it. Nothing downloads automatically.',
    browserNote: 'Use current Chrome or Edge (version 131 or newer) for page numbers, headers and footers on every page.',
    filename: 'Suggested file name',
    ready: 'Report ready. The print window opened.',
    printAgain: 'Open print window again',
    close: 'Close report',
    errorTitle: 'The report could not be made.',
    fontError: 'The report fonts could not be loaded, so nothing was printed. Try again.',
    timeout: 'Laying out the report took too long, so nothing was printed. Try again.',
    tooBig: 'The report is too large to lay out in the browser. Nothing was printed.',
    mismatch: 'The prepared report does not belong to this snapshot. Nothing was printed.',
    retry: 'Try again',
  },
};
const ar = {
  errors: { codes: {
    REPORT_TOO_LARGE: 'هذه اللقطة أكبر من أن توضع في تقرير واحد. لم يُقتطع شيء، ولم يُنشأ تقرير.',
    REPORT_RATE_LIMIT: 'أُعدّت تقارير كثيرة خلال الدقائق الأخيرة. انتظر قليلًا ثم حاول مجددًا.',
    REPORT_BUSY: 'Clarix مشغول بإعداد تقارير أخرى. حاول بعد لحظة.',
    REPORT_TIMEOUT: 'استغرق إعداد التقرير وقتًا طويلًا. حاول مجددًا.',
  } },
  help: {
    reportTitle: 'تقارير PDF',
    reportBody: 'في صفحة اللقطة اختر "تنزيل PDF" ثم اللغة. يجهّز Clarix الأرقام المجمّدة ويفتح نافذة الطباعة في متصفحك. اختر "حفظ بتنسيق PDF" كوجهة؛ لا يُنزَّل شيء تلقائيًا. يعمل في الإصدارات الحالية من Chrome وEdge (الإصدار 131 أو أحدث). يعرض التقرير اللقطة كما حُفظت تمامًا، وليس الأرقام الحية.',
  },
  rpt: {
    title: 'تقرير PDF',
    lead: 'تقرير قابل للطباعة لهذه اللقطة المجمّدة لمن لا يستخدم Clarix.',
    frozen: 'يعرض ملف PDF الأرقام كما جُمّدت في هذه اللقطة تمامًا. لا يُعاد حساب شيء.',
    language: 'لغة التقرير',
    en: 'الإنجليزية',
    ar: 'العربية',
    download: 'تنزيل PDF',
    preparing: 'جارٍ إعداد التقرير...',
    rendering: 'جارٍ ترتيب الصفحات والخطوط...',
    dialogNote: 'ستُفتح نافذة الطباعة في متصفحك. اختر "حفظ بتنسيق PDF" كوجهة وحدّد مكان الحفظ. لا يُنزَّل شيء تلقائيًا.',
    browserNote: 'استخدم الإصدار الحالي من Chrome أو Edge (131 أو أحدث) لتظهر أرقام الصفحات والترويسة والتذييل في كل صفحة.',
    filename: 'اسم الملف المقترح',
    ready: 'التقرير جاهز. فُتحت نافذة الطباعة.',
    printAgain: 'فتح نافذة الطباعة مجددًا',
    close: 'إغلاق التقرير',
    errorTitle: 'تعذّر إنشاء التقرير.',
    fontError: 'تعذّر تحميل خطوط التقرير، لذلك لم يُطبع شيء. حاول مجددًا.',
    timeout: 'استغرق ترتيب التقرير وقتًا طويلًا، لذلك لم يُطبع شيء. حاول مجددًا.',
    tooBig: 'التقرير أكبر من أن يُرتَّب في المتصفح. لم يُطبع شيء.',
    mismatch: 'التقرير المُعدّ لا يخص هذه اللقطة. لم يُطبع شيء.',
    retry: 'حاول مجددًا',
  },
};
i18n.addResourceBundle('en', 'translation', en, true, true);
i18n.addResourceBundle('ar', 'translation', ar, true, true);
