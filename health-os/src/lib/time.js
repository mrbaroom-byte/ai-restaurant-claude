// Local-calendar helpers. Everything the coach says is anchored to the user's
// timezone (Asia/Riyadh by default), not to UTC or to the server's clock.

const DATE_FMT_CACHE = new Map();

function partsFormatter(timeZone) {
  let f = DATE_FMT_CACHE.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
      weekday: 'short',
    });
    DATE_FMT_CACHE.set(timeZone, f);
  }
  return f;
}

const WEEKDAY_INDEX = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Calendar parts of `at` as seen in `timeZone`. */
export function localParts(at, timeZone) {
  const parts = {};
  for (const p of partsFormatter(timeZone).formatToParts(at)) parts[p.type] = p.value;
  // Intl can emit "24" for midnight under hourCycle h24; normalise it.
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(hour),
    minute: Number(parts.minute),
    hhmm: `${hour}:${parts.minute}`,
    // ISO weekday: Monday = 1 ... Sunday = 7
    weekday: WEEKDAY_INDEX[parts.weekday],
    weekdayShort: parts.weekday,
  };
}

/** 'YYYY-MM-DD' for `at` in `timeZone`. */
export function localDate(at, timeZone) {
  return localParts(at, timeZone).date;
}

/** Add whole days to a 'YYYY-MM-DD' string, staying in calendar space. */
export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, both 'YYYY-MM-DD'. Negative when `to` is earlier. */
export function daysBetween(from, to) {
  const a = Date.UTC(...from.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  const b = Date.UTC(...to.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  return Math.round((b - a) / 86400000);
}

/** ISO weekday (Mon=1..Sun=7) of a 'YYYY-MM-DD' string. */
export function weekdayOf(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
  return js === 0 ? 7 : js;
}

/** Monday of the week containing `isoDate`. Training weeks run Mon -> Sun. */
export function weekStart(isoDate) {
  return addDays(isoDate, -(weekdayOf(isoDate) - 1));
}

/** Inclusive list of dates from `from` to `to`. */
export function dateRange(from, to) {
  const out = [];
  for (let d = from; daysBetween(d, to) >= 0; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Minutes since local midnight, for schedule comparisons. */
export function minutesOfDay(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Human date in the user's locale, e.g. "الاثنين 14 سبتمبر". */
export function prettyDate(isoDate, locale = 'ar-SA', timeZone = 'Asia/Riyadh') {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, {
    timeZone, weekday: 'long', day: 'numeric', month: 'long', calendar: 'gregory', numberingSystem: 'latn',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}
