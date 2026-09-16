// Bot copy, in both languages.
//
// The coach's own prose is generated in whichever language is active; this
// table covers the deterministic scaffolding around it - acknowledgements,
// fact blocks, command help - so a language switch changes the whole surface,
// not just the model's replies.

export const BOT = {
  ar: {
    langName: 'العربية',
    switched: 'تم التبديل إلى العربية.',

    // acks
    logged: 'سُجّل',
    noted: 'ملاحظة',
    weightWord: 'وزن',
    workoutWord: 'تمرين',
    skipRecorded: 'تخطّي مسجّل',
    streakFire: '{n} أيام تمرين متتالية.',
    correctIt: 'غلط؟ صحّحه بكلامك وأنا أعدّله.',
    estimateOnly: '(تقدير فقط — ما تسجّل. استخدم /meal للتسجيل.)',

    // day / brief
    weekOf: 'أسبوع {a} من {b}',
    session: 'الجلسة',
    steps: 'الخطوات',
    supplements: 'المكمّلات',
    remainingSupps: 'المكمّلات المتبقية',
    proteinShort: 'ناقصك {n} جم بروتين.',
    proteinDone: 'البروتين مكتمل.',
    noWorkoutYet: 'ما سجّلت تمرين اليوم.',
    recoveryMissing: 'Recovery: غير مسجّل — أرسل: log recovery 55 sleep 7.2 rhr 72',
    readiness: 'الجاهزية',
    push: 'ادفع', maintain: 'حافظ', pull_back: 'خفّف', rest: 'راحة',
    sleepDowngrade: 'نزل لأحمر — النوم أقل من 6 ساعات',
    sleepLine: 'نوم {h} ساعة',
    restingHr: 'نبض الراحة',
    focus: 'التركيز',
    xpLine: 'المستوى {lvl} · {xp} نقطة · +{today} اليوم',

    // smoking
    daysToQuit: '{n} يوم لتاريخ الإقلاع.',
    smokeFree: '{n} يوم بدون تدخين.',
    quitToday: 'اليوم {d} بعد تاريخ الإقلاع · {c} يوم متواصل بدون تدخين.',
    deficitPaused: 'العجز متوقف — اليوم {a} من {b} بعد الإقلاع.',
    caloriesHold: 'السعرات على الثبات هذي الفترة — {n} يوم باقي. الميزان ما يرجّعك للسجائر.',
    noQuitDate: 'ما في تاريخ إقلاع محدد في الملف.',
    todayStep: 'خطوة اليوم',

    // labs
    labsStored: 'سُجّل {n} مؤشر بتاريخ {d}.',
    labsRejected: 'ما انحفظ',
    labsDirectional: 'القراءة اتجاه لا تشخيص — الطبيب هو اللي يقرر معناها.',
    labsExample: 'مثال:\n/labs 2026-03-04 ldl 4.1 mmol/L, hdl 1.3 mmol/L, hba1c 5.4 %',
    scanStored: 'InBody {d} سُجّل.',
    scanVs: 'مقابل {d}:',
    scanExample: 'مثال:\n/rescan 2026-10-12 weight 78.5 fat 26 muscle 32.6 visceral 9 whr 1.01',
    weightLbl: 'الوزن', fatLbl: 'الدهون', muscleLbl: 'العضل',

    // stats
    level: 'المستوى',
    xpTotal: 'المجموع',
    xpToday: 'نقاط اليوم',
    toNext: 'للمستوى التالي',
    badges: 'الأوسمة',
    earnedToday: 'كسبته اليوم',
    available: 'متاح اليوم',

    // scheduled
    sessionToday: 'جلسة اليوم',
    zone2Cue: 'Zone 2 = {lo}-{hi} bpm. تقدر تتكلم بالتلفون طوال الجلسة.',
    doneBtn: 'خلّصت',
    proteinSoFar: 'البروتين إلى الآن: {a} من {b} جم.',
    noMealsYet: 'ما سجّلت أي وجبة. أرسل صورة الغداء أو اكتبها.',
    nearestFix: 'أقرب حل',
    psylliumTime: 'وقت السيليوم — {dose}، مع كوب ماء كامل.',
    psylliumAlone: 'لحاله: ساعتين قبل وبعد أي مكمّل أو دواء.',
    tookIt: 'أخذته',
    windDown: 'بداية التهدئة.',
    lightsOut: 'هدف إطفاء النور: 23:15. الشاشة بعيدة قبلها بنصف ساعة.',
    weighTomorrow: 'وزن الصباح بكرة قبل الفطور.',
    missedTwice: 'هذي ثاني جلسة تفوت ورا بعض. القاعدة الوحيدة في البرنامج: لا تفوّت مرتين.',
    missedOne: 'أمس فات. اليوم لا.',
    nothingLogged: 'ما تسجّل تمرين اليوم.',
    offerRed: 'التعافي أحمر — مشي هادئ 15 دقيقة وبس. لا حديد ولا Zone 2.',
    offerLift: 'خيارك الآن: نصف جلسة — تمرينين فقط، مجموعتين. أو 15 دقيقة مشي.',
    offerCardio: 'خيارك الآن: 10-15 دقيقة Zone 2، أو مشي هادئ بعد العشا.',
    willDoIt: 'بسوّيها الحين',
    dayGone: 'اليوم راح',
    intentAck: 'تمام. سجّلها لما تخلص: log walk 15',
    skipAck: 'سُجّل كتخطّي. بكرة غير قابل للتفاوض.',

    // weekly
    weeklyTitle: 'مراجعة الأسبوع {a} → {b}',
    weeklySessions: 'الجلسات: {a} من 7',
    weeklyAerobic: 'دقائق Zone 2: {a} من {b}',
    weeklyProtein: 'متوسط البروتين: {a} جم/يوم (الهدف {b})',
    weeklyNoMeals: 'متوسط البروتين: ما في وجبات مسجّلة كافية',
    weeklyLoggedDays: 'أيام سُجّل فيها أكل: {a} من 7',
    weeklyWeight: 'الوزن: {a} كجم',
    weeklyRhr: 'متوسط نبض الراحة: {a}',
    weeklySleep: 'متوسط النوم: {a} ساعة',
    weeklyXp: 'نقاط الأسبوع: {a}',

    // errors
    errPrefix: 'صار خطأ',
    unknownButton: 'زر غير معروف.',
    noText: 'ما وصلني نص. اكتب /help للأوامر.',
    photoTooBig: 'الصورة كبيرة. أرسلها بجودة أقل.',
    dashOff: 'اللوحة غير مفعّلة — ناقص PUBLIC_BASE_URL أو DASHBOARD_TOKEN.',
    dashLink: 'اللوحة',
    mealNeedsText: 'اكتب الوجبة بعد الأمر، أو أرسل صورة.',
    foodNeedsText: 'اكتب الصنف بعد الأمر.',
    noSupps: 'ما في مكمّلات مجدولة.',
    suppsToday: 'المكمّلات اليوم',

    whoopConnected: 'ووب متصل.',
    whoopSynced: 'استوردت {r} تعافي · {s} نوم · {w} تمرين.',
    whoopWorkout: 'تمرين جديد من ووب — {d}.',
    whoopNoZone2: '(خارج نطاق Zone 2، ما احتُسب)',
    whoopSuspect: 'قراءة ووب مشكوك فيها — ما انحفظت:',
    whoopNotConfigured: 'ووب غير مهيّأ. ناقص WHOOP_CLIENT_ID أو WHOOP_CLIENT_SECRET أو PUBLIC_BASE_URL.',
    whoopNotConnected: 'ووب غير متصل. افتح الرابط وسجّل الدخول:',
    whoopStatus: 'ووب: {state}',
    whoopLastSync: 'آخر مزامنة: {t}',
    whoopZonesWarn: '⚠️ نطاقات ووب غير معايرة. عدّلها في تطبيق ووب بحيث Zone 2 = {lo}-{hi} نبضة، وبعدها شغّل /whoop zones ok',
    whoopZonesOk: '✅ تم تسجيل أن نطاقات ووب معايرة على {lo}-{hi}. الدقائق الهوائية بتُحتسب لكل دقيقة بدل المتوسط.',
    whoopZonesReset: 'رجعت للاحتساب بالمتوسط. عدّل النطاقات وشغّل /whoop zones ok.',
    whoopBackfilling: 'أستورد {n} شهور من تاريخ ووب… بيأخذ دقيقة.',
    whoopBackfillDone: 'انتهى الاستيراد: {r} تعافي · {s} نوم · {w} تمرين.',
    whoopDisconnected: 'تم فصل ووب.',
    whoopHelp: 'استخدم: /whoop connect | sync | backfill | zones ok | zones reset | status | disconnect',
  },

  en: {
    langName: 'English',
    switched: 'Switched to English.',

    logged: 'Logged',
    noted: 'Note',
    weightWord: 'weight',
    workoutWord: 'workout',
    skipRecorded: 'Skip recorded',
    streakFire: '{n} training days in a row.',
    correctIt: 'Wrong? Tell me and I will correct it.',
    estimateOnly: '(Estimate only — not logged. Use /meal to log it.)',

    weekOf: 'Week {a} of {b}',
    session: 'Session',
    steps: 'Steps',
    supplements: 'Supplements',
    remainingSupps: 'Supplements left',
    proteinShort: '{n} g of protein short.',
    proteinDone: 'Protein target met.',
    noWorkoutYet: 'Nothing trained today.',
    recoveryMissing: 'Recovery: not logged — send: log recovery 55 sleep 7.2 rhr 72',
    readiness: 'Readiness',
    push: 'Push', maintain: 'Maintain', pull_back: 'Pull back', rest: 'Rest',
    sleepDowngrade: 'downgraded to red — under 6 h sleep',
    sleepLine: 'Sleep {h} h',
    restingHr: 'Resting HR',
    focus: 'Focus',
    xpLine: 'Level {lvl} · {xp} XP · +{today} today',

    daysToQuit: '{n} days to the quit date.',
    smokeFree: '{n} smoke-free days.',
    quitToday: 'Day {d} after the quit date · {c} consecutive smoke-free days.',
    deficitPaused: 'Deficit paused — day {a} of {b} after quitting.',
    caloriesHold: 'Calories stay at maintenance for now — {n} days left. The scale does not get to pull you back to cigarettes.',
    noQuitDate: 'No quit date set in the profile.',
    todayStep: "Today's step",

    labsStored: 'Stored {n} markers drawn {d}.',
    labsRejected: 'Not stored',
    labsDirectional: 'Directional, not diagnostic — your doctor decides what it means.',
    labsExample: 'Example:\n/labs 2026-03-04 ldl 4.1 mmol/L, hdl 1.3 mmol/L, hba1c 5.4 %',
    scanStored: 'InBody {d} stored.',
    scanVs: 'Versus {d}:',
    scanExample: 'Example:\n/rescan 2026-10-12 weight 78.5 fat 26 muscle 32.6 visceral 9 whr 1.01',
    weightLbl: 'Weight', fatLbl: 'Body fat', muscleLbl: 'Muscle',

    level: 'Level',
    xpTotal: 'Total',
    xpToday: 'XP today',
    toNext: 'to next level',
    badges: 'Achievements',
    earnedToday: 'Earned today',
    available: 'Still available',

    sessionToday: "Today's session",
    zone2Cue: 'Zone 2 = {lo}-{hi} bpm. You should be able to hold a phone call throughout.',
    doneBtn: 'Done',
    proteinSoFar: 'Protein so far: {a} of {b} g.',
    noMealsYet: 'No meals logged. Send a photo of lunch or type it.',
    nearestFix: 'Nearest fix',
    psylliumTime: 'Psyllium time — {dose}, with a full glass of water.',
    psylliumAlone: 'On its own: two hours clear of any other supplement or medication.',
    tookIt: 'Taken',
    windDown: 'Wind-down starts now.',
    lightsOut: 'Target lights-out 23:15. Screens away half an hour before.',
    weighTomorrow: 'Weigh in tomorrow morning, before breakfast.',
    missedTwice: 'That is two sessions missed in a row. The one rule in this block: never miss twice.',
    missedOne: 'Yesterday was missed. Today is not.',
    nothingLogged: 'No training logged today.',
    offerRed: 'Recovery is red — a 15 minute easy walk and nothing else. No lifting, no Zone 2.',
    offerLift: 'Your options now: half a session — two exercises, two sets. Or a 15 minute walk.',
    offerCardio: 'Your options now: 10-15 minutes of Zone 2, or an easy walk after dinner.',
    willDoIt: "I'll do it now",
    dayGone: 'Today is gone',
    intentAck: 'Good. Log it when you are done: log walk 15',
    skipAck: 'Recorded as a skip. Tomorrow is not negotiable.',

    weeklyTitle: 'Week in review {a} → {b}',
    weeklySessions: 'Sessions: {a} of 7',
    weeklyAerobic: 'Zone 2 minutes: {a} of {b}',
    weeklyProtein: 'Average protein: {a} g/day (target {b})',
    weeklyNoMeals: 'Average protein: not enough meals logged',
    weeklyLoggedDays: 'Days with food logged: {a} of 7',
    weeklyWeight: 'Weight: {a} kg',
    weeklyRhr: 'Average resting HR: {a}',
    weeklySleep: 'Average sleep: {a} h',
    weeklyXp: 'XP this week: {a}',

    errPrefix: 'Something broke',
    unknownButton: 'Unknown button.',
    noText: 'No text received. Send /help for the commands.',
    photoTooBig: 'That photo is too large. Send it at lower quality.',
    dashOff: 'Dashboard not configured — PUBLIC_BASE_URL or DASHBOARD_TOKEN is missing.',
    dashLink: 'Dashboard',
    mealNeedsText: 'Write the meal after the command, or send a photo.',
    foodNeedsText: 'Write the item after the command.',
    noSupps: 'No scheduled supplements.',
    suppsToday: 'Supplements today',

    whoopConnected: 'WHOOP connected.',
    whoopSynced: 'Imported {r} recovery · {s} sleep · {w} workout.',
    whoopWorkout: 'New workout from WHOOP — {d}.',
    whoopNoZone2: '(outside the Zone 2 band, not counted)',
    whoopSuspect: 'Suspect WHOOP reading — not stored:',
    whoopNotConfigured: 'WHOOP is not configured. WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET or PUBLIC_BASE_URL is missing.',
    whoopNotConnected: 'WHOOP is not connected. Open this link and sign in:',
    whoopStatus: 'WHOOP: {state}',
    whoopLastSync: 'Last sync: {t}',
    whoopZonesWarn: '⚠️ WHOOP zones are not calibrated. Set Zone 2 to {lo}-{hi} bpm in the WHOOP app, then run /whoop zones ok',
    whoopZonesOk: '✅ Recorded that your WHOOP zones are calibrated to {lo}-{hi}. Aerobic minutes now count per minute instead of from the session average.',
    whoopZonesReset: 'Back to counting from the session average. Retune the zones, then run /whoop zones ok.',
    whoopBackfilling: 'Importing {n} months of WHOOP history… this takes a minute.',
    whoopBackfillDone: 'Import finished: {r} recovery · {s} sleep · {w} workout.',
    whoopDisconnected: 'WHOOP disconnected.',
    whoopHelp: 'Use: /whoop connect | sync | backfill | zones ok | zones reset | status | disconnect',
  },
};

export const HELP = {
  ar: `الأوامر:

/day — وين أنت اليوم مقابل الأهداف
/brief — بريف الصباح الآن
/stats — المستوى والنقاط والأوسمة
/meal <وصف> أو أرسل صورة — تسجيل وجبة
/food <صنف> — تقدير سريع بدون تسجيل
/log <...> — تسجيل تمرين أو وزن أو أرقام الصباح
/week — مراجعة الأسبوع
/labs <...> — إدخال تحليل جديد
/rescan <...> — إدخال InBody جديد
/quit <...> — عدّاد الإقلاع وتسجيل الرغبة
/supps — تأشير المكمّلات
/dash — رابط اللوحة
/whoop — ربط ساعة ووب
/lang — English

أمثلة /log:
  log recovery 55 sleep 7.2 rhr 72 steps 4200
  log 81.4            (وزن)
  log z2 22
  log strength A rpe 7
  log walk 35 hr 118
  log skipped travel

أي رسالة عادية تروح للمدرّب مباشرة.`,

  en: `Commands:

/day — where you are today against the targets
/brief — the morning brief, now
/stats — level, XP and achievements
/meal <text> or send a photo — log a meal
/food <item> — quick estimate, not logged
/log <...> — workout, weight, or morning numbers
/week — the weekly review
/labs <...> — enter new bloodwork
/rescan <...> — enter a new InBody
/quit <...> — smoke-free counter, cravings, triggers
/supps — tick supplements off
/dash — dashboard link
/whoop — connect your WHOOP
/lang — العربية

/log examples:
  log recovery 55 sleep 7.2 rhr 72 steps 4200
  log 81.4            (weight)
  log z2 22
  log strength A rpe 7
  log walk 35 hr 118
  log skipped travel

Anything else goes straight to the coach.`,
};

/** Translator for a language, with {placeholder} interpolation. */
export function L(lang) {
  const table = BOT[lang] ?? BOT.ar;
  return function translate(key, vars) {
    let s = table[key] ?? BOT.ar[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
}

export const LANGS = ['ar', 'en'];
