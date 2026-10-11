import i18n from './i18n';

const en = {
  p19: {
    howTo: {
      label: 'How to read this page',
      overview: 'Each tile is one figure for the selected period. Status colours always come with a word. Select a figure to open the source rows it was counted from.',
      comparison: 'Read top to bottom: the summary, then key figures, then charts. Difference is Run B minus Run A. Every value links to its source rows. Detailed tables are folded at the end.',
      quality: 'Each row is one problem found during import. Red blocks a figure, amber is a warning, green is fine. Open a row to see the exact file, sheet and cell.',
    },
  },
  as: { ask: { unavailableHint: 'AI is not available on this server. Typed questions are off; the example questions above still work.' } },
};

const ar = {
  p19: {
    howTo: {
      label: 'كيف تقرأ هذه الصفحة',
      overview: 'كل بطاقة رقم واحد للفترة المختارة. ألوان الحالة مصحوبة دائمًا بكلمة. اختر رقمًا لفتح صفوف المصدر التي حُسب منها.',
      comparison: 'اقرأ من الأعلى إلى الأسفل: الملخص، ثم الأرقام الرئيسية، ثم الرسوم. الفرق هو التشغيلة B ناقص التشغيلة A. كل قيمة مرتبطة بصفوف مصدرها. الجداول التفصيلية مطوية في النهاية.',
      quality: 'كل صف مشكلة واحدة وُجدت أثناء الاستيراد. الأحمر يمنع حساب الرقم، والأصفر تحذير، والأخضر سليم. افتح الصف لترى الملف والورقة والخلية بالضبط.',
    },
  },
  as: { ask: { unavailableHint: 'الذكاء الاصطناعي غير متاح على هذا الخادم. الأسئلة المكتوبة متوقفة؛ الأسئلة النموذجية أعلاه ما زالت تعمل.' } },
};

i18n.addResourceBundle('en', 'translation', en, true, true);
i18n.addResourceBundle('ar', 'translation', ar, true, true);

const demoEn = {
  p19: { demo: {
    add: 'Create demo factory',
    title: 'Create a demo factory',
    body: 'Creates a factory clearly marked DEMO, filled with synthetic sample data so you can show Clarix without real data.',
    facts1: 'Contains only synthetic data: two sample sources imported through the normal pipeline.',
    facts2: 'No real factory data is copied. No accounts are generated.',
    facts3: 'It can be suspended like any factory. Suspending keeps the data and stops all access; there is no hard delete.',
    confirm: 'I understand this factory contains only synthetic demo data.',
    confirmRequired: 'Please confirm before creating.',
    emailOptional: 'Manager email (optional)',
    emailHint: 'Leave empty to create the demo without inviting anyone.',
    submit: 'Create demo factory',
    working: 'Importing sample data...',
    done: 'Demo factory created with synthetic data.',
    badge: 'DEMO',
    banner: 'DEMO factory: production records here are synthetic samples, not real data. Notes may be entered by users.',
    importsOff: 'This demo factory holds synthetic data only, so new uploads are turned off. Past imports stay readable.',
  } },
};
const demoAr = {
  p19: { demo: {
    add: 'إنشاء مصنع تجريبي',
    title: 'إنشاء مصنع تجريبي',
    body: 'يُنشئ مصنعًا موسومًا بوضوح بكلمة DEMO ومملوءًا ببيانات نموذجية اصطناعية لعرض Clarix دون بيانات حقيقية.',
    facts1: 'يحتوي على بيانات اصطناعية فقط: مصدران نموذجيان مستوردان عبر خط الاستيراد المعتاد.',
    facts2: 'لا تُنسخ أي بيانات مصنع حقيقية. لا تُنشأ أي حسابات.',
    facts3: 'يمكن إيقافه مثل أي مصنع. الإيقاف يحتفظ بالبيانات ويمنع كل وصول؛ لا يوجد حذف نهائي.',
    confirm: 'أفهم أن هذا المصنع يحتوي على بيانات تجريبية اصطناعية فقط.',
    confirmRequired: 'يرجى التأكيد قبل الإنشاء.',
    emailOptional: 'بريد المدير (اختياري)',
    emailHint: 'اتركه فارغًا لإنشاء المصنع التجريبي دون دعوة أحد.',
    submit: 'إنشاء مصنع تجريبي',
    working: 'جارٍ استيراد البيانات النموذجية...',
    done: 'أُنشئ المصنع التجريبي ببيانات اصطناعية.',
    badge: 'DEMO',
    banner: 'مصنع تجريبي DEMO: سجلات الإنتاج هنا عينات اصطناعية وليست بيانات حقيقية. قد تكون الملاحظات مُدخلة من المستخدمين.',
    importsOff: 'هذا المصنع التجريبي يحتوي على بيانات اصطناعية فقط، لذا رفع ملفات جديدة متوقف. الاستيرادات السابقة تبقى متاحة للقراءة.',
  } },
};
i18n.addResourceBundle('en', 'translation', demoEn, true, true);
i18n.addResourceBundle('ar', 'translation', demoAr, true, true);
