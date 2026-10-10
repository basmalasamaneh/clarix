import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const en = {
  brand: { name: 'Clarix', tagline: 'Factory evidence workspace' },
  common: {
    loading: 'Loading',
    retry: 'Try again',
    back: 'Back',
    next: 'Next',
    skip: 'Skip tour',
    done: 'Start working',
    close: 'Close',
    menu: 'Open navigation',
    phase: 'Foundation release',
    skipToContent: 'Skip to content',
  },
  prefs: {
    language: 'Language',
    theme: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    english: 'English',
    arabic: 'العربية',
    saveFailed: 'Your preference could not be saved. It is applied for this visit only.',
  },
  roles: {
    factory_manager: 'Factory manager',
    analyst: 'Analyst',
    viewer: 'Viewer',
    platformAdmin: 'Platform administrator',
  },
  nav: {
    section: 'Workspace',
    adminSection: 'Administration',
    overview: 'Overview',
    imports: 'Data imports',
    runs: 'Production runs',
    comparison: 'Comparison',
    quality: 'Data quality',
    settings: 'Factory settings',
    platform: 'Platform',
  },
  factory: {
    label: 'Factory',
    choose: 'Choose a factory',
    switched: 'Switched to {{name}}',
    switchFailed: 'The factory could not be switched.',
    isolated: 'Data stays inside this factory',
  },
  user: {
    account: 'Account',
    logout: 'Sign out',
    loggingOut: 'Signing out',
    replayTour: 'Replay the introduction',
  },
  login: {
    title: 'Sign in to Clarix',
    subtitle: 'Use the account your factory manager or platform administrator created for you.',
    email: 'Work email',
    password: 'Password',
    submit: 'Sign in',
    submitting: 'Signing in',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    emailInvalid: 'Enter a valid email address.',
    passwordRequired: 'Enter your password.',
    help: 'No self sign-up. Access is granted per factory by its manager.',
    heroKicker: 'Read-only by design',
    heroTitle: 'Every number traceable to the row it came from.',
    heroBody:
      'Clarix reads approved exports from your existing system and keeps each factory sealed from the others. It never writes back and never fills a gap with a guess.',
    p1: 'Code calculates. Nothing on screen is invented.',
    p2: 'Every figure links to its file and line.',
    p3: 'Missing means "Not available", never zero.',
    p4: 'Problems travel with the number. They are never hidden.',
    footer: 'Factories stay isolated. Sessions use secure cookies.',
  },
  errors: {
    title: 'Something went wrong',
    generic: 'The request could not be completed. Try again in a moment.',
    network: 'Clarix could not reach the server. Check your connection.',
    status: {
      400: 'The request was not valid. Check the fields and try again.',
      401: 'Email or password is incorrect.',
      403: 'You do not have permission for this action.',
      429: 'Too many attempts. Wait a few minutes before trying again.',
    },
    codes: {
      invalid_credentials: 'Email or password is incorrect.',
      unauthorized: 'Your session has ended. Sign in again.',
      unauthenticated: 'Your session has ended. Sign in again.',
      forbidden: 'You do not have permission for this action.',
      csrf_invalid: 'Your session security token expired. Reload and try again.',
      invalid_csrf: 'Your session security token expired. Reload and try again.',
      rate_limited: 'Too many attempts. Wait a few minutes before trying again.',
      too_many_requests: 'Too many attempts. Wait a few minutes before trying again.',
      invalid_request: 'The request was not valid. Check the fields and try again.',
      validation_error: 'The request was not valid. Check the fields and try again.',
      not_member: 'You are not a member of that factory.',
      factory_not_found: 'That factory is not available to you.',
    },
  },
  states: {
    sessionLoading: 'Opening your workspace',
    sessionErrorTitle: 'Clarix could not open your session',
    sessionErrorBody: 'The server did not respond as expected. Your data is safe; nothing was changed.',
    forbiddenTitle: 'This page is not part of your role',
    forbiddenBody:
      'Your role in this factory does not include this page. Ask your factory manager if you need access.',
    forbiddenAction: 'Go to an allowed page',
    notFoundTitle: 'This address does not exist',
    notFoundBody: 'The link may be outdated or mistyped. Nothing was opened.',
    notFoundAction: 'Back to Clarix',
    noMembershipTitle: 'You are not part of a factory yet',
    noMembershipBody:
      'Your account is active, but no factory has added you. A factory manager can invite you; access is granted per factory.',
    noFactoryTitle: 'Choose a factory to continue',
    noFactoryBody: 'You belong to more than one factory. Each one is kept separate. Pick the one you want to work in.',
    pageErrorTitle: 'This page could not be loaded',
    code: 'Code {{code}}',
  },
  pages: {
    emptyBadge: 'No data yet',
    whatAppears: 'What will appear here',
    nothingInvented: 'Nothing is shown until real, approved data exists.',
    overview: {
      title: 'Overview',
      lead: 'Where the factory stands, at a glance.',
      emptyTitle: 'No approved imports yet',
      emptyBody:
        'Once a file has been imported, checked and approved, this page summarises the latest runs and any data-quality warnings that travel with them.',
      i1: 'Latest approved imports and their quality status',
      i2: 'Runs ready to compare',
      i3: 'Open data issues that need a reviewer',
    },
    imports: {
      title: 'Data imports',
      lead: 'Bring in approved exports from your existing system.',
      emptyTitle: 'No files imported',
      emptyBody:
        'Imports run in three steps: upload, map the columns, then check and approve. Raw rows are stored exactly as uploaded and nothing is used before approval.',
      i1: 'Upload with encoding and delimiter detection',
      i2: 'Column mapping saved as a factory template',
      i3: 'Quality report with file and line numbers',
    },
    runs: {
      title: 'Production runs',
      lead: 'Every run from approved imports, searchable and filterable.',
      emptyTitle: 'No runs recorded',
      emptyBody: 'Runs appear after an import is approved. From here you will pick two runs to compare.',
      i1: 'Search by order, product, line, machine or mold',
      i2: 'Quality status beside each run',
      i3: 'Select two runs to open a comparison',
    },
    comparison: {
      title: 'Comparison',
      lead: 'Two runs side by side, every number with its source.',
      emptyTitle: 'No comparison to show',
      emptyBody:
        'Comparisons need two runs from approved data. Each figure will open its formula and original rows; unplanned stops are always shown separately.',
      i1: 'Scrap rate and changeover time for run A and run B',
      i2: 'Differences in percentage points and hours',
      i3: 'Unplanned stops recorded separately, with no causal claim',
    },
    quality: {
      title: 'Data quality',
      lead: 'Problems are shown, never hidden.',
      emptyTitle: 'No issues to review',
      emptyBody:
        'When imported files contain duplicates, missing values or unit problems, they are listed here with the exact file and line, waiting for a reviewer.',
      i1: 'Status per metric group with the reason',
      i2: 'Excluded and quarantined rows',
      i3: 'Review decisions with notes',
    },
    settings: {
      title: 'Factory settings',
      lead: 'Units, time zone, thresholds and event codes for this factory.',
      emptyTitle: 'Settings arrive with imports',
      emptyBody:
        'Factories configure units, tolerances and the event-code map. Metric formulas are locked and cannot be edited here.',
      i1: 'Units and time zone',
      i2: 'Material balance tolerances',
      i3: 'Event-code to event-type map',
    },
    platform: {
      title: 'Platform',
      lead: 'Factories and their managers.',
      emptyTitle: 'Factory administration is not open yet',
      emptyBody:
        'Platform administrators will create and suspend factories and invite their managers here. Production data is never visible from this page.',
      i1: 'Create and suspend factories',
      i2: 'Invite factory managers',
      i3: 'No access to production data by default',
      note: 'Administrative area',
    },
  },
  tour: {
    label: 'Introduction',
    step: 'Step {{n}} of {{total}}',
    s1Title: 'One factory at a time',
    s1Body:
      'The factory selector at the top shows only factories you belong to. Data from one factory never appears in another.',
    s2Title: 'Pages follow your role',
    s2Body:
      'The side navigation lists only what your role allows. If something is missing, your factory manager can change your role.',
    s3Title: 'Your language, your theme',
    s3Body:
      'Switch between Arabic and English, and light or dark, from the top bar. Clarix remembers your choice on every device.',
  },
};

type Dict = typeof en;

const ar: Dict = {
  brand: { name: 'Clarix', tagline: 'مساحة أدلة المصنع' },
  common: {
    loading: 'جارٍ التحميل',
    retry: 'أعد المحاولة',
    back: 'السابق',
    next: 'التالي',
    skip: 'تخطَّ الجولة',
    done: 'ابدأ العمل',
    close: 'إغلاق',
    menu: 'افتح قائمة التنقل',
    phase: 'إصدار الأساس',
    skipToContent: 'انتقل إلى المحتوى',
  },
  prefs: {
    language: 'اللغة',
    theme: 'المظهر',
    light: 'فاتح',
    dark: 'داكن',
    system: 'حسب النظام',
    english: 'English',
    arabic: 'العربية',
    saveFailed: 'تعذّر حفظ تفضيلك. طُبّق لهذه الزيارة فقط.',
  },
  roles: {
    factory_manager: 'مدير المصنع',
    analyst: 'محلل',
    viewer: 'مُطّلع',
    platformAdmin: 'مسؤول المنصة',
  },
  nav: {
    section: 'مساحة العمل',
    adminSection: 'الإدارة',
    overview: 'نظرة عامة',
    imports: 'استيراد البيانات',
    runs: 'تشغيلات الإنتاج',
    comparison: 'المقارنة',
    quality: 'جودة البيانات',
    settings: 'إعدادات المصنع',
    platform: 'المنصة',
  },
  factory: {
    label: 'المصنع',
    choose: 'اختر مصنعًا',
    switched: 'تم الانتقال إلى {{name}}',
    switchFailed: 'تعذّر تبديل المصنع.',
    isolated: 'البيانات تبقى داخل هذا المصنع',
  },
  user: {
    account: 'الحساب',
    logout: 'تسجيل الخروج',
    loggingOut: 'جارٍ تسجيل الخروج',
    replayTour: 'أعد عرض التعريف',
  },
  login: {
    title: 'تسجيل الدخول إلى Clarix',
    subtitle: 'استخدم الحساب الذي أنشأه لك مدير المصنع أو مسؤول المنصة.',
    email: 'البريد الإلكتروني للعمل',
    password: 'كلمة المرور',
    submit: 'تسجيل الدخول',
    submitting: 'جارٍ تسجيل الدخول',
    showPassword: 'إظهار كلمة المرور',
    hidePassword: 'إخفاء كلمة المرور',
    emailInvalid: 'أدخل بريدًا إلكترونيًا صحيحًا.',
    passwordRequired: 'أدخل كلمة المرور.',
    help: 'لا يوجد تسجيل ذاتي. يمنح مدير كل مصنع صلاحية الوصول إليه.',
    heroKicker: 'للقراءة فقط بطبيعته',
    heroTitle: 'كل رقم يمكن تتبّعه إلى الصف الذي جاء منه.',
    heroBody:
      'يقرأ Clarix الملفات المعتمدة المصدّرة من نظامكم الحالي، ويُبقي كل مصنع معزولًا عن غيره. لا يكتب إلى نظامكم أبدًا، ولا يملأ أي فجوة بالتخمين.',
    p1: 'الحساب بالبرمجة. لا شيء على الشاشة مُختلَق.',
    p2: 'كل رقم مرتبط بملفه ورقم سطره.',
    p3: 'الناقص يعني «غير متوفر»، وليس صفرًا.',
    p4: 'المشكلات ترافق الرقم ولا تُخفى أبدًا.',
    footer: 'المصانع معزولة. الجلسات تستخدم ملفات تعريف آمنة.',
  },
  errors: {
    title: 'حدث خطأ',
    generic: 'تعذّر إكمال الطلب. حاول مرة أخرى بعد قليل.',
    network: 'تعذّر على Clarix الوصول إلى الخادم. تحقّق من اتصالك.',
    status: {
      400: 'الطلب غير صالح. راجع الحقول وحاول مرة أخرى.',
      401: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
      403: 'ليست لديك صلاحية لهذا الإجراء.',
      429: 'محاولات كثيرة. انتظر بضع دقائق قبل المحاولة مجددًا.',
    },
    codes: {
      invalid_credentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
      unauthorized: 'انتهت جلستك. سجّل الدخول مجددًا.',
      unauthenticated: 'انتهت جلستك. سجّل الدخول مجددًا.',
      forbidden: 'ليست لديك صلاحية لهذا الإجراء.',
      csrf_invalid: 'انتهت صلاحية رمز أمان الجلسة. أعد التحميل وحاول مجددًا.',
      invalid_csrf: 'انتهت صلاحية رمز أمان الجلسة. أعد التحميل وحاول مجددًا.',
      rate_limited: 'محاولات كثيرة. انتظر بضع دقائق قبل المحاولة مجددًا.',
      too_many_requests: 'محاولات كثيرة. انتظر بضع دقائق قبل المحاولة مجددًا.',
      invalid_request: 'الطلب غير صالح. راجع الحقول وحاول مرة أخرى.',
      validation_error: 'الطلب غير صالح. راجع الحقول وحاول مرة أخرى.',
      not_member: 'لست عضوًا في هذا المصنع.',
      factory_not_found: 'هذا المصنع غير متاح لك.',
    },
  },
  states: {
    sessionLoading: 'جارٍ فتح مساحة عملك',
    sessionErrorTitle: 'تعذّر على Clarix فتح جلستك',
    sessionErrorBody: 'لم يستجب الخادم كما هو متوقع. بياناتك آمنة ولم يتغيّر شيء.',
    forbiddenTitle: 'هذه الصفحة ليست ضمن دورك',
    forbiddenBody: 'دورك في هذا المصنع لا يشمل هذه الصفحة. اطلب من مدير المصنع إن كنت تحتاج إليها.',
    forbiddenAction: 'انتقل إلى صفحة مسموحة',
    notFoundTitle: 'هذا العنوان غير موجود',
    notFoundBody: 'قد يكون الرابط قديمًا أو مكتوبًا بشكل خاطئ. لم يُفتح شيء.',
    notFoundAction: 'العودة إلى Clarix',
    noMembershipTitle: 'لم تنضم إلى أي مصنع بعد',
    noMembershipBody:
      'حسابك مفعّل، لكن لم يُضفك أي مصنع بعد. يمكن لمدير المصنع دعوتك، والصلاحية تُمنح لكل مصنع على حدة.',
    noFactoryTitle: 'اختر مصنعًا للمتابعة',
    noFactoryBody: 'أنت عضو في أكثر من مصنع، وكل مصنع منفصل عن الآخر. اختر المصنع الذي تريد العمل فيه.',
    pageErrorTitle: 'تعذّر تحميل هذه الصفحة',
    code: 'الرمز {{code}}',
  },
  pages: {
    emptyBadge: 'لا بيانات بعد',
    whatAppears: 'ما الذي سيظهر هنا',
    nothingInvented: 'لا يُعرض شيء قبل وجود بيانات حقيقية معتمدة.',
    overview: {
      title: 'نظرة عامة',
      lead: 'وضع المصنع في لمحة.',
      emptyTitle: 'لا توجد عمليات استيراد معتمدة بعد',
      emptyBody:
        'بعد استيراد ملف وفحصه واعتماده، تلخّص هذه الصفحة أحدث التشغيلات وأي تحذيرات جودة بيانات ترافقها.',
      i1: 'أحدث عمليات الاستيراد المعتمدة وحالة جودتها',
      i2: 'التشغيلات الجاهزة للمقارنة',
      i3: 'مشكلات البيانات المفتوحة التي تحتاج إلى مراجع',
    },
    imports: {
      title: 'استيراد البيانات',
      lead: 'أدخِل الملفات المعتمدة المصدّرة من نظامكم الحالي.',
      emptyTitle: 'لم يُستورد أي ملف',
      emptyBody:
        'يتم الاستيراد في ثلاث خطوات: الرفع، ثم ربط الأعمدة، ثم الفحص والاعتماد. تُحفظ الصفوف الأصلية كما رُفعت تمامًا ولا يُستخدم شيء قبل الاعتماد.',
      i1: 'رفع مع اكتشاف الترميز والفاصل',
      i2: 'ربط الأعمدة يُحفظ كقالب للمصنع',
      i3: 'تقرير جودة بأسماء الملفات وأرقام الأسطر',
    },
    runs: {
      title: 'تشغيلات الإنتاج',
      lead: 'كل تشغيلة من عمليات الاستيراد المعتمدة، قابلة للبحث والتصفية.',
      emptyTitle: 'لا توجد تشغيلات مسجّلة',
      emptyBody: 'تظهر التشغيلات بعد اعتماد عملية استيراد. ومن هنا ستختار تشغيلتين للمقارنة.',
      i1: 'البحث برقم الطلب أو المنتج أو الخط أو الآلة أو القالب',
      i2: 'حالة الجودة بجانب كل تشغيلة',
      i3: 'اختيار تشغيلتين لفتح مقارنة',
    },
    comparison: {
      title: 'المقارنة',
      lead: 'تشغيلتان جنبًا إلى جنب، وكل رقم مع مصدره.',
      emptyTitle: 'لا توجد مقارنة لعرضها',
      emptyBody:
        'تحتاج المقارنة إلى تشغيلتين من بيانات معتمدة. سيفتح كل رقم معادلته وصفوفه الأصلية، وتُعرض التوقفات غير المخططة دائمًا بشكل منفصل.',
      i1: 'نسبة الهدر وزمن تغيير القالب للتشغيلة أ والتشغيلة ب',
      i2: 'الفروق بالنقاط المئوية والساعات',
      i3: 'التوقفات غير المخططة مسجّلة بشكل منفصل دون ادعاء سببية',
    },
    quality: {
      title: 'جودة البيانات',
      lead: 'المشكلات تُعرض ولا تُخفى.',
      emptyTitle: 'لا توجد مشكلات للمراجعة',
      emptyBody:
        'عندما تحتوي الملفات المستوردة على تكرارات أو قيم ناقصة أو مشكلات وحدات، تُدرج هنا مع الملف والسطر بالتحديد بانتظار المراجعة.',
      i1: 'الحالة لكل مجموعة مقاييس مع السبب',
      i2: 'الصفوف المستبعدة والمعزولة',
      i3: 'قرارات المراجعة مع الملاحظات',
    },
    settings: {
      title: 'إعدادات المصنع',
      lead: 'الوحدات والمنطقة الزمنية والحدود ورموز الأحداث لهذا المصنع.',
      emptyTitle: 'تصل الإعدادات مع عمليات الاستيراد',
      emptyBody:
        'يضبط المصنع الوحدات والتفاوتات المسموحة وخريطة رموز الأحداث. معادلات المقاييس ثابتة ولا يمكن تعديلها هنا.',
      i1: 'الوحدات والمنطقة الزمنية',
      i2: 'تفاوتات ميزان المواد',
      i3: 'ربط رموز الأحداث بأنواعها',
    },
    platform: {
      title: 'المنصة',
      lead: 'المصانع ومديروها.',
      emptyTitle: 'إدارة المصانع غير متاحة بعد',
      emptyBody:
        'سيُنشئ مسؤولو المنصة المصانع ويعلّقونها ويدعون مديريها من هنا. بيانات الإنتاج لا تظهر في هذه الصفحة أبدًا.',
      i1: 'إنشاء المصانع وتعليقها',
      i2: 'دعوة مديري المصانع',
      i3: 'لا وصول إلى بيانات الإنتاج افتراضيًا',
      note: 'منطقة إدارية',
    },
  },
  tour: {
    label: 'تعريف',
    step: 'الخطوة {{n}} من {{total}}',
    s1Title: 'مصنع واحد في كل مرة',
    s1Body: 'يعرض محدد المصنع في الأعلى المصانع التي أنت عضو فيها فقط. بيانات أي مصنع لا تظهر في مصنع آخر أبدًا.',
    s2Title: 'الصفحات تتبع دورك',
    s2Body: 'تعرض قائمة التنقل الجانبية ما يسمح به دورك فقط. إن كان شيء ناقصًا، يمكن لمدير المصنع تغيير دورك.',
    s3Title: 'لغتك ومظهرك',
    s3Body: 'بدّل بين العربية والإنجليزية، وبين الفاتح والداكن، من الشريط العلوي. يتذكر Clarix اختيارك على كل جهاز.',
  },
};

export const LOCAL_LANG_KEY = 'clarix.language';
export const LOCAL_THEME_KEY = 'clarix.theme';

function initialLang(): 'en' | 'ar' {
  try {
    const v = localStorage.getItem(LOCAL_LANG_KEY);
    if (v === 'en' || v === 'ar') return v;
  } catch {
    /* ignore */
  }
  return typeof navigator !== 'undefined' && navigator.language?.startsWith('ar') ? 'ar' : 'en';
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: initialLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
