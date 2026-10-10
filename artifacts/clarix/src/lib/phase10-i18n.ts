import i18n from '@/lib/i18n';

/** Phase 10 strings: Help page, friendly error screens, plainer messages, short tour. Merged deeply. */

const en = {
  nav: { help: 'Help', helpSection: 'Support' },
  common: { dismiss: 'Close introduction' },
  errors: {
    generic: 'Something went wrong on our side. Reload to check the latest state before trying again.',
    network: 'Clarix cannot reach the server. Check your internet connection, then try again.',
    status: {
      404: 'This item was not found. It may have been removed, or the link is outdated.',
      413: 'This file is too large to upload. Split it into smaller files and try again.',
      500: 'Something went wrong on our side. Reload to check the latest state before trying again.',
      502: 'Clarix is temporarily unavailable. Wait a minute, then try again.',
      503: 'Clarix is temporarily unavailable. Wait a minute, then try again.',
    },
    codes: {
      too_many_rows: 'This file exceeds 100,000 rows. Split it into smaller files, then upload again.',
      csrf_invalid: 'Your page was open for too long. Reload the page, then try again.',
      invalid_csrf: 'Your page was open for too long. Reload the page, then try again.',
      invalid_request: 'Some information is missing or not valid. Check the highlighted fields and try again.',
      validation_error: 'Some information is missing or not valid. Check the highlighted fields and try again.',
      not_member: 'You are not a member of that factory. Ask its factory manager to invite you.',
      factory_not_found: 'That factory is not available to you. Choose another factory from the top bar.',
    },
  },
  states: {
    sessionErrorBody: 'Clarix could not load your account just now. Your data is safe and nothing was changed. Try again.',
    crashTitle: 'This screen stopped working',
    crashBody: 'Something went wrong on our side while showing this screen. Your data is safe and nothing was changed. Try again, or open another page.',
    crashAction: 'Try again',
    forbiddenCode: 'Error 403',
    notFoundCode: 'Error 404',
    crashCode: 'Error 500',
  },
  pages: {
    overview: {
      emptyBody:
        'Nothing has been approved yet. Start with Data imports: upload a CSV file, check it, and approve it. This page then summarises the latest runs and their data-quality warnings.',
    },
    runs: {
      emptyBody: 'No runs yet. Start with Data imports: runs appear here once an import is approved. Then pick two runs to compare.',
    },
    comparison: {
      emptyBody:
        'Choose two runs on the Production runs page to compare them. Each figure opens its formula and original rows; unplanned stops are always shown separately.',
    },
    quality: {
      emptyBody:
        'No problems to review. When an imported file has duplicates, missing values or unit problems, they appear here with the exact file and line.',
    },
  },
  tour: {
    s1Title: 'One factory at a time',
    s1Body: 'The selector at the top shows only your factories. Data from one factory never appears in another.',
    s2Title: 'Import, check, compare',
    s2Body: 'Upload a CSV in Data imports, review problems in Data quality, then compare two runs. Every number links back to its original rows.',
    s3Title: 'Your language, your theme',
    s3Body: 'Switch Arabic or English, light or dark, from the top bar. Clarix remembers your choice.',
    s4Title: 'Help is always here',
    s4Body: 'Open Help in the side menu to read what the colours mean and what "Not available" means. You can replay this introduction from your account menu.',
  },
  help: {
    kicker: 'Help',
    title: 'How Clarix works',
    lead: 'Clarix shows where every production number came from, down to the original row in your CSV file.',
    stepsTitle: 'Three steps',
    s1Title: 'Import',
    s1Body: 'Upload a CSV export from your existing system in Data imports. Match each column to its meaning. The original rows are kept exactly as uploaded.',
    s2Title: 'Check',
    s2Body: 'Clarix lists duplicates, missing values and unit problems with the file name and line number. Nothing is used until the import is approved.',
    s3Title: 'Compare',
    s3Body: 'In Production runs, pick two runs. Comparison shows them side by side. Select any number to see its formula and the exact rows behind it.',
    colorsTitle: 'What the colours mean',
    green: 'Green',
    greenBody: 'The data behind this figure passed every check. You can rely on it.',
    yellow: 'Yellow',
    yellowBody: 'The figure was calculated, but some rows had problems. Read the warning before you rely on it.',
    red: 'Red',
    redBody: 'The data has a serious problem. Do not rely on this figure until the problem is fixed and the file is imported again.',
    naTitle: 'What "Not available" means',
    naBody: 'Clarix shows "Not available" when the data needed for a figure is missing or not reliable enough. Clarix never guesses or fills in a value. Import the missing data to see the figure.',
    causeTitle: 'Stops are never treated as a cause',
    causeBody: 'Unplanned stops and downtime are always shown separately. Clarix never assumes that a stop caused a difference between two runs. It shows what happened; you decide why.',
    moreTitle: 'Need more help?',
    moreBody: 'If a page is missing or an action is not allowed, ask your factory manager. Access is granted per factory and per role.',
  },
};

type Dict = typeof en;

const ar: Dict = {
  nav: { help: 'المساعدة', helpSection: 'الدعم' },
  common: { dismiss: 'إغلاق التعريف' },
  errors: {
    generic: 'حدث خطأ من جهتنا. أعد التحميل للتحقق من الحالة الحالية قبل المحاولة مجددًا.',
    network: 'لا يستطيع Clarix الوصول إلى الخادم. تحقّق من اتصالك بالإنترنت ثم حاول مرة أخرى.',
    status: {
      404: 'لم يُعثر على هذا العنصر. ربما حُذف أو أن الرابط قديم.',
      413: 'هذا الملف كبير جدًا للرفع. قسّمه إلى ملفات أصغر وحاول مرة أخرى.',
      500: 'حدث خطأ من جهتنا. أعد التحميل للتحقق من الحالة الحالية قبل المحاولة مجددًا.',
      502: 'Clarix غير متاح مؤقتًا. انتظر دقيقة ثم حاول مرة أخرى.',
      503: 'Clarix غير متاح مؤقتًا. انتظر دقيقة ثم حاول مرة أخرى.',
    },
    codes: {
      too_many_rows: 'يتجاوز هذا الملف 100,000 صف. قسّمه إلى ملفات أصغر ثم أعد رفعه.',
      csrf_invalid: 'بقيت الصفحة مفتوحة مدة طويلة. أعد تحميل الصفحة ثم حاول مرة أخرى.',
      invalid_csrf: 'بقيت الصفحة مفتوحة مدة طويلة. أعد تحميل الصفحة ثم حاول مرة أخرى.',
      invalid_request: 'بعض المعلومات ناقصة أو غير صحيحة. راجع الحقول المحددة وحاول مرة أخرى.',
      validation_error: 'بعض المعلومات ناقصة أو غير صحيحة. راجع الحقول المحددة وحاول مرة أخرى.',
      not_member: 'لست عضوًا في هذا المصنع. اطلب من مدير المصنع دعوتك.',
      factory_not_found: 'هذا المصنع غير متاح لك. اختر مصنعًا آخر من الشريط العلوي.',
    },
  },
  states: {
    sessionErrorBody: 'تعذّر على Clarix تحميل حسابك الآن. بياناتك آمنة ولم يتغيّر شيء. حاول مرة أخرى.',
    crashTitle: 'توقفت هذه الشاشة عن العمل',
    crashBody: 'حدث خطأ من جهتنا أثناء عرض هذه الشاشة. بياناتك آمنة ولم يتغيّر شيء. حاول مرة أخرى أو افتح صفحة أخرى.',
    crashAction: 'أعد المحاولة',
    forbiddenCode: 'الخطأ 403',
    notFoundCode: 'الخطأ 404',
    crashCode: 'الخطأ 500',
  },
  pages: {
    overview: {
      emptyBody:
        'لم يُعتمد أي شيء بعد. ابدأ من استيراد البيانات: ارفع ملف CSV وافحصه واعتمده. بعدها تلخّص هذه الصفحة أحدث التشغيلات وتحذيرات جودة البيانات.',
    },
    runs: {
      emptyBody: 'لا توجد تشغيلات بعد. ابدأ من استيراد البيانات: تظهر التشغيلات هنا بعد اعتماد الاستيراد. ثم اختر تشغيلتين للمقارنة.',
    },
    comparison: {
      emptyBody:
        'اختر تشغيلتين من صفحة تشغيلات الإنتاج لمقارنتهما. كل رقم يفتح معادلته وصفوفه الأصلية، والتوقفات غير المخطط لها تُعرض دائمًا بشكل منفصل.',
    },
    quality: {
      emptyBody:
        'لا توجد مشكلات للمراجعة. عندما يحتوي ملف مستورد على تكرارات أو قيم ناقصة أو مشكلات وحدات، تظهر هنا مع اسم الملف ورقم السطر.',
    },
  },
  tour: {
    s1Title: 'مصنع واحد في كل مرة',
    s1Body: 'يعرض المحدد في الأعلى مصانعك فقط. بيانات أي مصنع لا تظهر في مصنع آخر أبدًا.',
    s2Title: 'استورد، افحص، قارن',
    s2Body: 'ارفع ملف CSV من استيراد البيانات، وراجع المشكلات في جودة البيانات، ثم قارن بين تشغيلتين. كل رقم يرتبط بصفوفه الأصلية.',
    s3Title: 'لغتك ومظهرك',
    s3Body: 'بدّل بين العربية والإنجليزية، وبين الفاتح والداكن، من الشريط العلوي. يتذكر Clarix اختيارك.',
    s4Title: 'المساعدة متاحة دائمًا',
    s4Body: 'افتح المساعدة من القائمة الجانبية لتعرف معنى الألوان ومعنى "غير متاح". يمكنك إعادة هذا التعريف من قائمة حسابك.',
  },
  help: {
    kicker: 'المساعدة',
    title: 'كيف يعمل Clarix',
    lead: 'يبيّن Clarix مصدر كل رقم إنتاج، وصولًا إلى الصف الأصلي في ملف CSV.',
    stepsTitle: 'ثلاث خطوات',
    s1Title: 'الاستيراد',
    s1Body: 'ارفع ملف CSV مُصدَّرًا من نظامك الحالي في استيراد البيانات، وحدّد معنى كل عمود. تُحفظ الصفوف الأصلية كما رُفعت تمامًا.',
    s2Title: 'الفحص',
    s2Body: 'يعرض Clarix التكرارات والقيم الناقصة ومشكلات الوحدات مع اسم الملف ورقم السطر. لا يُستخدم شيء قبل اعتماد الاستيراد.',
    s3Title: 'المقارنة',
    s3Body: 'اختر تشغيلتين من تشغيلات الإنتاج. تعرضهما صفحة المقارنة جنبًا إلى جنب. اختر أي رقم لترى معادلته والصفوف التي بُني عليها.',
    colorsTitle: 'معنى الألوان',
    green: 'أخضر',
    greenBody: 'البيانات وراء هذا الرقم اجتازت كل الفحوص. يمكنك الاعتماد عليه.',
    yellow: 'أصفر',
    yellowBody: 'حُسب الرقم، لكن بعض الصفوف فيها مشكلات. اقرأ التحذير قبل الاعتماد عليه.',
    red: 'أحمر',
    redBody: 'في البيانات مشكلة جدية. لا تعتمد على هذا الرقم حتى تُصلح المشكلة ويُستورد الملف من جديد.',
    naTitle: 'معنى "غير متاح"',
    naBody: 'يعرض Clarix "غير متاح" عندما تكون البيانات اللازمة للرقم ناقصة أو غير موثوقة بما يكفي. لا يخمّن Clarix أي قيمة ولا يملؤها. استورد البيانات الناقصة لترى الرقم.',
    causeTitle: 'التوقفات لا تُعدّ سببًا أبدًا',
    causeBody: 'تُعرض التوقفات غير المخطط لها وأوقات التعطل دائمًا بشكل منفصل. لا يفترض Clarix أبدًا أن توقفًا سبّب فرقًا بين تشغيلتين. يعرض ما حدث، وأنت تقرر السبب.',
    moreTitle: 'تحتاج مساعدة أكثر؟',
    moreBody: 'إن كانت صفحة ناقصة أو إجراء غير مسموح، اسأل مدير المصنع. تُمنح الصلاحية لكل مصنع ولكل دور.',
  },
};

i18n.addResourceBundle('en', 'translation', en, true, true);
i18n.addResourceBundle('ar', 'translation', ar, true, true);
