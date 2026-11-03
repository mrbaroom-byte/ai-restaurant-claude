// Dashboard copy, in both languages.
//
// The payload the server builds is language-neutral - keys and numbers only -
// so switching language is a client-side re-render with no round trip and no
// second copy of the data.

export const LANGS = ['ar', 'en'];

export const DIR = { ar: 'rtl', en: 'ltr' };

export const STRINGS = {
  ar: {
    appTitle: 'Health OS',
    week: 'أسبوع',
    of: 'من',
    language: 'English',
    languageLabel: 'تغيير اللغة',
    themeLabel: 'تغيير المظهر',
    themeLight: 'فاتح',
    themeDark: 'داكن',

    navToday: 'اليوم',
    navProgress: 'التقدّم',
    navWeek: 'الأسبوع',
    navTrends: 'الاتجاهات',
    navLabs: 'التحاليل',
    navHistory: 'السجل',

    sectionToday: 'اليوم',
    sectionProgress: 'التقدّم',
    sectionWeek: 'هذا الأسبوع',
    sectionQuit: 'الإقلاع',
    sectionTrends: 'الاتجاهات · 90 يوم',
    sectionLabs: 'التحاليل',
    sectionBody: 'تركيب الجسم',
    sectionOpen: 'المعلّق',
    sectionHistory: 'السجل',
    sectionAchievements: 'الأوسمة',

    session: 'الجلسة',
    recovery: 'التعافي',
    recoveryMissing: 'لم تُسجَّل بعد',
    readiness: 'الجاهزية',
    push: 'ادفع',
    maintain: 'حافظ',
    pull_back: 'خفّف',
    rest: 'راحة',
    sleepDowngrade: 'نزلت لأحمر — النوم أقل من 6 ساعات',

    protein: 'بروتين',
    calories: 'سعرات',
    meals: 'وجبات',
    steps: 'خطوات',
    target: 'الهدف',
    grams: 'جم',
    kg: 'كجم',
    minutes: 'دقيقة',
    hours: 'ساعة',
    remaining: 'المتبقي',
    supplements: 'المكمّلات',
    allTicked: 'الكل مؤشَّر',
    satFatMeals: 'وجبة بدهون مشبعة',

    sessions: 'جلسات',
    aerobicMinutes: 'دقائق هوائية',
    streak: 'السلسلة',
    days: 'أيام',
    consecutiveDays: 'أيام متتالية',
    ofTrainingDays: 'من أيام التمرين',

    level: 'المستوى',
    xp: 'نقطة',
    xpToday: 'نقاط اليوم',
    xpTotal: 'المجموع',
    toNextLevel: 'للمستوى التالي',
    earnedToday: 'كسبته اليوم',
    notYetToday: 'ما زال متاحاً اليوم',
    unlocked: 'مفتوح',

    smokeFreeDays: 'يوم بدون تدخين',
    daysToQuit: 'يوم للإقلاع',
    quitDate: 'تاريخ الإقلاع',
    deficitPaused: 'العجز متوقف — السعرات على الثبات',
    dayOf: 'اليوم {a} من {b}',

    missTwice: 'فاتتك {n} جلسات متتالية. القاعدة: لا تفوّت مرتين.',
    missOne: 'فاتت جلسة أمس. اليوم غير قابل للتفاوض.',

    weight: 'الوزن',
    restingHr: 'نبض الراحة',
    sleep: 'النوم',
    aerobicPerDay: 'دقائق هوائية / يوم',
    proteinPerDay: 'بروتين / يوم',
    ldl: 'LDL',
    totalCholesterol: 'الكوليسترول الكلي',
    bodyFat: 'الدهون',
    muscle: 'العضل الهيكلي',
    visceral: 'الدهون الحشوية',
    level_: 'المستوى',

    noData: 'لا توجد بيانات كافية بعد',
    noResults: 'لا نتائج',
    searchPlaceholder: 'ابحث في الوجبات والتمارين…',
    showTable: 'عرض الجدول',
    hideTable: 'إخفاء الجدول',
    date: 'التاريخ',
    value: 'القيمة',
    meal: 'وجبة',
    workout: 'تمرين',
    skipped: 'تخطّي',

    labsDirectional: 'القراءة اتجاه لا تشخيص. الطبيب هو اللي يقرر معناها.',
    disclaimer: 'هذا النظام لا يقدّم استشارة طبية. يتتبّع ويذكّر ويدرّب على التمرين والتغذية فقط. أي شيء يخص التشخيص أو الدواء أو الأعراض يرجع للطبيب.',
    veryHigh: 'عالٍ جداً',
    high: 'مرتفع',
    borderline: 'حدّي',
    normal: 'طبيعي',
    desirable: 'مرغوب',
    acceptable: 'مقبول',
  },

  en: {
    appTitle: 'Health OS',
    week: 'Week',
    of: 'of',
    language: 'العربية',
    languageLabel: 'Change language',
    themeLabel: 'Change theme',
    themeLight: 'Light',
    themeDark: 'Dark',

    navToday: 'Today',
    navProgress: 'Progress',
    navWeek: 'Week',
    navTrends: 'Trends',
    navLabs: 'Labs',
    navHistory: 'History',

    sectionToday: 'Today',
    sectionProgress: 'Progress',
    sectionWeek: 'This week',
    sectionQuit: 'Quitting',
    sectionTrends: 'Trends · 90 days',
    sectionLabs: 'Labs',
    sectionBody: 'Body composition',
    sectionOpen: 'Open items',
    sectionHistory: 'History',
    sectionAchievements: 'Achievements',

    session: 'Session',
    recovery: 'Recovery',
    recoveryMissing: 'not logged yet',
    readiness: 'Readiness',
    push: 'Push',
    maintain: 'Maintain',
    pull_back: 'Pull back',
    rest: 'Rest',
    sleepDowngrade: 'downgraded to red — under 6 h sleep',

    protein: 'Protein',
    calories: 'Calories',
    meals: 'Meals',
    steps: 'Steps',
    target: 'Target',
    grams: 'g',
    kg: 'kg',
    minutes: 'min',
    hours: 'h',
    remaining: 'Remaining',
    supplements: 'Supplements',
    allTicked: 'All ticked',
    satFatMeals: 'with saturated fat',

    sessions: 'Sessions',
    aerobicMinutes: 'Aerobic minutes',
    streak: 'Streak',
    days: 'days',
    consecutiveDays: 'days in a row',
    ofTrainingDays: 'of training days',

    level: 'Level',
    xp: 'XP',
    xpToday: 'XP today',
    xpTotal: 'Total',
    toNextLevel: 'to next level',
    earnedToday: 'Earned today',
    notYetToday: 'Still available today',
    unlocked: 'unlocked',

    smokeFreeDays: 'smoke-free days',
    daysToQuit: 'days to quit date',
    quitDate: 'Quit date',
    deficitPaused: 'Deficit paused — calories at maintenance',
    dayOf: 'Day {a} of {b}',

    missTwice: 'You have missed {n} sessions in a row. The rule is never miss twice.',
    missOne: 'Yesterday was missed. Today is not negotiable.',

    weight: 'Weight',
    restingHr: 'Resting HR',
    sleep: 'Sleep',
    aerobicPerDay: 'Aerobic minutes / day',
    proteinPerDay: 'Protein / day',
    ldl: 'LDL',
    totalCholesterol: 'Total cholesterol',
    bodyFat: 'Body fat',
    muscle: 'Skeletal muscle',
    visceral: 'Visceral fat',
    level_: 'Level',

    noData: 'Not enough data yet',
    noResults: 'No results',
    searchPlaceholder: 'Search meals and workouts…',
    showTable: 'Show table',
    hideTable: 'Hide table',
    date: 'Date',
    value: 'Value',
    meal: 'meal',
    workout: 'workout',
    skipped: 'skipped',

    labsDirectional: 'Directional, not diagnostic. Your cardiologist decides what it means.',
    disclaimer: 'This system does not give medical advice. It tracks, reminds and coaches on training and nutrition. Anything touching diagnosis, medication or symptoms goes to your doctor.',
    veryHigh: 'very high',
    high: 'high',
    borderline: 'borderline',
    normal: 'normal',
    desirable: 'desirable',
    acceptable: 'acceptable',
  },
};

/** Level names. Numbers alone are colder than they need to be. */
export const LEVEL_NAMES = {
  ar: { 1: 'البداية', 2: 'منتظم', 3: 'ثابت', 4: 'قوي', 5: 'راسخ', 6: 'متمكّن', 7: 'مرجع' },
  en: { 1: 'Starting', 2: 'Consistent', 3: 'Steady', 4: 'Strong', 5: 'Established', 6: 'Dialled in', 7: 'Reference' },
};

/** What each XP rule is called, and the one line that says why it exists. */
export const XP_NAMES = {
  ar: {
    metrics_logged: 'أرقام الصباح',
    session_done:   'جلسة اليوم',
    rest_respected: 'احترمت الراحة',
    protein_target: 'هدف البروتين',
    meals_logged:   'سجّلت وجباتك',
    sleep_7h:       '7 ساعات نوم',
    supplements:    'المكمّلات',
    smoke_free:     'يوم بدون تدخين',
  },
  en: {
    metrics_logged: 'Morning numbers',
    session_done:   "Today's session",
    rest_respected: 'Respected the rest',
    protein_target: 'Protein target',
    meals_logged:   'Logged your meals',
    sleep_7h:       '7 hours of sleep',
    supplements:    'Supplements',
    smoke_free:     'Smoke-free day',
  },
};

export const ACHIEVEMENT_NAMES = {
  ar: {
    first_session:     ['أول جلسة', 'سجّلت أول تمرين في البلوك.'],
    first_week:        ['أسبوع كامل', '5 جلسات في أسبوع واحد.'],
    aerobic_125:       ['125 دقيقة', 'أسبوع داخل التوصية العالمية لأول مرة هذي السنة.'],
    zone2_discipline:  ['انضباط Zone 2', '5 جلسات ضمن 110-125 نبضة — بدون ما تزيد.'],
    both_lifts:        ['A و B', 'جلستا الحديد في أسبوع واحد. الأرجل تقود.'],
    red_day_respected: ['اليوم الأحمر', 'خفّفت لما التعافي كان أحمر. هذا أصعب من التمرين.'],
    protein_week:      ['أسبوع بروتين', '7 أيام متتالية على هدف البروتين.'],
    logged_14:         ['14 يوم تسجيل', 'أسبوعان بدون ما تفوّت تسجيل.'],
    streak_7:          ['سلسلة 7', '7 أيام تمرين متتالية.'],
    smoke_free_1:      ['أول يوم', 'يوم واحد بدون تدخين.'],
    smoke_free_7:      ['أسبوع نظيف', '7 أيام بدون تدخين.'],
    smoke_free_30:     ['شهر نظيف', '30 يوم بدون تدخين.'],
    labs_logged:       ['المتابعة', 'سجّلت تحليلين — الاتجاه صار واضح.'],
    rescan:            ['قياس جديد', 'InBody ثاني. الأرقام صارت تتحرك.'],
  },
  en: {
    first_session:     ['First session', 'Logged your first workout of the block.'],
    first_week:        ['Full week', 'Five sessions in a single week.'],
    aerobic_125:       ['125 minutes', 'A week inside the guideline for the first time this year.'],
    zone2_discipline:  ['Zone 2 discipline', 'Five sessions held at 110-125 bpm — without going harder.'],
    both_lifts:        ['A and B', 'Both lifting sessions in one week. Legs lead.'],
    red_day_respected: ['Red day', 'Backed off when recovery was red. Harder than training.'],
    protein_week:      ['Protein week', 'Seven consecutive days on the protein target.'],
    logged_14:         ['14 days logged', 'Two weeks without missing a log.'],
    streak_7:          ['Streak of 7', 'Seven training days in a row.'],
    smoke_free_1:      ['Day one', 'One day without a cigarette.'],
    smoke_free_7:      ['Clean week', 'Seven days smoke-free.'],
    smoke_free_30:     ['Clean month', 'Thirty days smoke-free.'],
    labs_logged:       ['Tracking', 'Two panels logged — the trend is visible.'],
    rescan:            ['Re-scanned', 'A second InBody. The numbers are moving.'],
  },
};

export const WEEKDAY_SHORT = {
  ar: { 1: 'إث', 2: 'ثل', 3: 'أر', 4: 'خم', 5: 'جم', 6: 'سب', 7: 'أح' },
  en: { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' },
};

export const SESSION_NAMES = {
  ar: { zone2: 'Zone 2', strength_a: 'Strength A', strength_b: 'Strength B', walk_long: 'مشي طويل هادئ', rest: 'راحة ومرونة', walk_easy: 'مشي هادئ' },
  en: { zone2: 'Zone 2', strength_a: 'Strength A', strength_b: 'Strength B', walk_long: 'Long easy walk', rest: 'Rest and mobility', walk_easy: 'Easy walk' },
};

/** Lab marker labels. Falls back to the English label in units.js. */
export const MARKER_NAMES = {
  ar: {
    ldl: 'LDL', non_hdl: 'Non-HDL', total_cholesterol: 'الكوليسترول الكلي', hdl: 'HDL',
    triglycerides: 'الدهون الثلاثية', hba1c: 'السكر التراكمي', lp_a: 'Lp(a)', apob: 'ApoB',
    hs_crp: 'hs-CRP', vitamin_d: 'فيتامين د', tsh: 'TSH', ferritin: 'الفيريتين',
    iron: 'الحديد', alt: 'ALT', ast: 'AST', alp: 'ALP', calcium: 'الكالسيوم',
    creatinine: 'الكرياتينين', egfr: 'eGFR', sbp: 'الضغط الانقباضي', dbp: 'الضغط الانبساطي',
  },
  en: {},
};

/** Threshold band labels, keyed by the flag stored on the profile's thresholds. */
export const BAND_NAMES = {
  ar: { very_high: 'عالٍ جداً', high: 'مرتفع', borderline: 'حدّي', normal: 'طبيعي' },
  en: { very_high: 'very high', high: 'high', borderline: 'borderline', normal: 'normal' },
};
