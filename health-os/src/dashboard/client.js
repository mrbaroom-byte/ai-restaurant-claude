/* Health OS dashboard - browser app.
   Renders entirely from window.__DATA__ (language-neutral) plus window.__I18N__,
   so the language and theme toggles are a re-render with no round trip. */
(function () {
  'use strict';

  var D = window.__DATA__ || {};
  var I = window.__I18N__ || {};

  /* ------------------------------------------------------------ storage --- */
  /* Every access is guarded: in a private window or with site data blocked,
     localStorage throws rather than returning null. */
  function readPref(key, fallback) {
    try { var v = localStorage.getItem(key); return v === null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function writePref(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* not essential */ }
  }

  /* Precedence: URL parameter (so a link can pin a view) > saved preference >
     the system default. */
  var params = new URLSearchParams(location.search);

  var lang = params.get('lang') || readPref('hos.lang', null);
  if (I.STRINGS && !I.STRINGS[lang]) lang = null;
  if (!lang) lang = (navigator.language || '').slice(0, 2) === 'en' ? 'en' : 'ar';

  /* An explicit theme already stamped on the root is the host's own choice and
     outranks the OS setting, but not this page's toggle. */
  var hostTheme = document.documentElement.getAttribute('data-theme');
  var theme = params.get('theme') || readPref('hos.theme', null) || hostTheme;
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  /* --------------------------------------------------------------- i18n --- */

  function t(key, vars) {
    var table = (I.STRINGS && I.STRINGS[lang]) || {};
    var s = table[key];
    if (s === undefined) s = key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.split('{' + k + '}').join(String(vars[k]));
      });
    }
    return s;
  }
  function pick(map, key, fallback) {
    var byLang = (map && map[lang]) || {};
    var v = byLang[key];
    return v === undefined || v === null ? (fallback === undefined ? key : fallback) : v;
  }

  /* Numbers stay Latin in both languages - he reads them that way. */
  function fmt(n, digits) {
    if (n === null || n === undefined || isNaN(Number(n))) return '—';
    var d = digits || 0;
    var s = Number(n).toFixed(d);
    if (d > 0) s = s.replace(/\.?0+$/, '');
    return s;
  }
  /* Wrap a Latin/number run so bidi does not reorder it inside Arabic text. */
  function ltr(s) { return lang === 'ar' ? '⁦' + s + '⁩' : String(s); }

  /* -------------------------------------------------------------- icons --- */

  var P = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    right: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    down: '<path d="M12 5v14M5 12l7 7 7-7"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    dot: '<circle cx="12" cy="12" r="2.5"/>',
    alert: '<path d="M12 9v4M12 17h.01M10.3 3.9L2.4 17.1A2 2 0 0 0 4.1 20h15.8a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    flame: '<path d="M12 22c4 0 7-2.6 7-6.5 0-4-3-6-4.5-9.5-.5 2.5-2 3.5-3 4.5-1-1.5-1.5-3-1.5-5C7 7 5 10.5 5 15.5 5 19.4 8 22 12 22z"/>',
    bolt: '<path d="M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z"/>',
    heart: '<path d="M19.5 5.5a5 5 0 0 0-7.1 0l-.4.4-.4-.4a5 5 0 0 0-7.1 7.1l7.5 7.5 7.5-7.5a5 5 0 0 0 0-7.1z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    dumbbell: '<path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11"/>',
    shield: '<path d="M12 22s8-3.5 8-9.5V5.5L12 2.5 4 5.5v7C4 18.5 12 22 12 22z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    flag: '<path d="M5 21V4M5 4h11l-1.5 3.5L16 11H5"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v14H6.5A2.5 2.5 0 0 0 4 19.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20v4H6.5A2.5 2.5 0 0 1 4 19.5z"/>',
    leaf: '<path d="M4 20c0-8 6-14 16-15 0 10-5 15-11 15-2.5 0-5-1-5-1z"/><path d="M4 20c3-5 7-8 11-9.5"/>',
    flask: '<path d="M9 2h6M10 2v6.5L4.6 18A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.7-3L14 8.5V2"/><path d="M7.5 15h9"/>',
    scale: '<path d="M12 4v16M5 8h14M7 8l-3 6a3 3 0 0 0 6 0zM17 8l-3 6a3 3 0 0 0 6 0z"/>',
    utensils: '<path d="M6 2v8a2 2 0 0 0 4 0V2M8 10v12M16 2c-1.5 1.5-2 3-2 5.5 0 2 1 3 2 3.5v11"/>',
    footprints: '<path d="M6 16c0-2-1-3-1-5.5C5 7 6.3 5 8 5s2.5 2 2.5 5.5C10.5 13 9.5 14 9.5 16zM15 21c0-2-1-3-1-5.5 0-3.5 1.3-5.5 3-5.5s2.5 2 2.5 5.5c0 2.5-1 3.5-1 5.5z"/>',
    pill: '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M8.5 8.5l7 7"/>',
    activity: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };

  function icon(name, cls) {
    var d = P[name] || P.dot;
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"'
      + (cls ? ' class="' + cls + '"' : '') + '>' + d + '</svg>';
  }

  var ACH_ICON = {
    flag: 'flag', calendar: 'calendar', heart: 'heart', target: 'target',
    dumbbell: 'dumbbell', shield: 'shield', bolt: 'bolt', book: 'book',
    fire: 'flame', leaf: 'leaf', flask: 'flask', scale: 'scale',
  };

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------------------------------------------- charts --- */

  var CH = { w: 600, h: 180, l: 38, r: 14, tp: 14, bt: 26 };

  function buildChart(opts) {
    var pts = (opts.points || []).filter(function (p) { return p && isFinite(Number(p.y)); });
    var id = opts.id;
    var title = opts.title;
    var unit = opts.unit || '';
    var digits = opts.digits || 0;

    var head = '<div class="chart-head"><span class="chart-title">' + esc(title) + '</span>'
      + (pts.length ? '<span class="chart-now">' + esc(fmt(pts[pts.length - 1].y, digits))
        + (unit ? ' ' + esc(unit) : '') + '</span>' : '') + '</div>';

    if (!pts.length) {
      return '<div class="card">' + head + '<div class="empty">' + esc(t('noData')) + '</div></div>';
    }

    var vals = pts.map(function (p) { return Number(p.y); });
    var cand = vals.slice();
    if (opts.reference !== null && opts.reference !== undefined) cand.push(opts.reference);
    var min = Math.min.apply(null, cand);
    var max = Math.max.apply(null, cand);
    if (min === max) { min -= 1; max += 1; }
    var pad = (max - min) * 0.14;
    min -= pad; max += pad;

    var iw = CH.w - CH.l - CH.r;
    var ih = CH.h - CH.tp - CH.bt;
    var px = function (i) { return CH.l + (pts.length === 1 ? iw / 2 : (i / (pts.length - 1)) * iw); };
    var py = function (v) { return CH.tp + ih - ((v - min) / (max - min)) * ih; };

    var dPath = pts.map(function (p, i) {
      return (i ? 'L' : 'M') + px(i).toFixed(1) + ',' + py(Number(p.y)).toFixed(1);
    }).join(' ');

    var svg = '';
    /* recessive hairline grid, three steps */
    [max, (max + min) / 2, min].forEach(function (v) {
      svg += '<line class="grid-line" x1="' + CH.l + '" y1="' + py(v).toFixed(1)
        + '" x2="' + (CH.w - CH.r) + '" y2="' + py(v).toFixed(1) + '"/>'
        + '<text class="axis-txt" x="' + (CH.l - 6) + '" y="' + (py(v) + 3.5).toFixed(1)
        + '" text-anchor="end">' + esc(fmt(v, digits)) + '</text>';
    });

    /* area wash at ~10%, then the 2px line */
    if (pts.length > 1) {
      svg += '<path d="' + dPath + ' L' + px(pts.length - 1).toFixed(1) + ',' + (CH.tp + ih)
        + ' L' + px(0).toFixed(1) + ',' + (CH.tp + ih) + ' Z" fill="' + opts.color + '" opacity="0.10"/>';
    }

    if (opts.reference !== null && opts.reference !== undefined) {
      svg += '<line class="ref-line" x1="' + CH.l + '" y1="' + py(opts.reference).toFixed(1)
        + '" x2="' + (CH.w - CH.r) + '" y2="' + py(opts.reference).toFixed(1) + '"/>'
        + '<text class="ref-txt" x="' + (CH.w - CH.r) + '" y="' + (py(opts.reference) - 5).toFixed(1)
        + '" text-anchor="end">' + esc(opts.referenceLabel || fmt(opts.reference, digits)) + '</text>';
    }

    svg += '<path d="' + dPath + '" fill="none" stroke="' + opts.color
      + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';

    /* end marker, with a 2px surface ring so it stays legible over the line */
    var lastI = pts.length - 1;
    svg += '<circle cx="' + px(lastI).toFixed(1) + '" cy="' + py(vals[lastI]).toFixed(1)
      + '" r="4.5" fill="' + opts.color + '" stroke="var(--surface)" stroke-width="2"/>';

    svg += '<g class="hoverlay" opacity="0">'
      + '<line class="crosshair" y1="' + CH.tp + '" y2="' + (CH.tp + ih) + '"/>'
      + '<circle r="5" fill="' + opts.color + '" stroke="var(--surface)" stroke-width="2"/></g>';

    svg += '<text class="axis-txt" x="' + CH.l + '" y="' + (CH.h - 6) + '">' + esc(pts[0].x) + '</text>'
      + '<text class="axis-txt" x="' + (CH.w - CH.r) + '" y="' + (CH.h - 6) + '" text-anchor="end">'
      + esc(pts[lastI].x) + '</text>';

    var summary = title + ': ' + pts.length + ' points, '
      + fmt(Math.min.apply(null, vals), digits) + ' to ' + fmt(Math.max.apply(null, vals), digits)
      + ', latest ' + fmt(vals[lastI], digits) + ' ' + unit + '.';

    var rows = pts.slice().reverse().slice(0, 30).map(function (p) {
      return '<tr><td>' + esc(p.x) + '</td><td>' + esc(fmt(p.y, digits)) + '</td></tr>';
    }).join('');

    return '<div class="card">' + head
      + '<div class="chart-wrap" data-chart="' + id + '">'
      + '<svg class="chart" viewBox="0 0 ' + CH.w + ' ' + CH.h + '" role="img" tabindex="0" '
      + 'aria-label="' + esc(summary) + '">' + svg + '</svg>'
      + '<div class="tip" role="status"></div></div>'
      + '<details class="table-view"><summary>' + icon('chevron') + esc(t('showTable')) + '</summary>'
      + '<table><thead><tr><th>' + esc(t('date')) + '</th><th>' + esc(t('value')) + '</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></details></div>';
  }

  /* Wire hover/keyboard to every chart after the DOM is written. */
  function activateCharts(store) {
    document.querySelectorAll('[data-chart]').forEach(function (wrap) {
      var pts = store[wrap.getAttribute('data-chart')];
      if (!pts || !pts.points.length) return;
      var svg = wrap.querySelector('svg');
      var tip = wrap.querySelector('.tip');
      var g = wrap.querySelector('.hoverlay');
      var line = g.querySelector('line');
      var dot = g.querySelector('circle');

      var n = pts.points.length;
      var iw = CH.w - CH.l - CH.r;
      var ih = CH.h - CH.tp - CH.bt;
      var vals = pts.points.map(function (p) { return Number(p.y); });
      var cand = vals.slice();
      if (pts.reference !== null && pts.reference !== undefined) cand.push(pts.reference);
      var min = Math.min.apply(null, cand), max = Math.max.apply(null, cand);
      if (min === max) { min -= 1; max += 1; }
      var pd = (max - min) * 0.14; min -= pd; max += pd;
      var px = function (i) { return CH.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw); };
      var py = function (v) { return CH.tp + ih - ((v - min) / (max - min)) * ih; };

      var cur = -1;
      function show(i) {
        if (i < 0 || i >= n) return;
        cur = i;
        var x = px(i), y = py(vals[i]);
        line.setAttribute('x1', x); line.setAttribute('x2', x);
        dot.setAttribute('cx', x); dot.setAttribute('cy', y);
        g.setAttribute('opacity', '1');
        tip.textContent = pts.points[i].x + '  ·  ' + fmt(vals[i], pts.digits || 0)
          + (pts.unit ? ' ' + pts.unit : '');
        var rect = svg.getBoundingClientRect();
        tip.style.left = (x / CH.w * rect.width) + 'px';
        tip.style.top = (y / CH.h * rect.height) + 'px';
        tip.classList.add('on');
      }
      function hide() { g.setAttribute('opacity', '0'); tip.classList.remove('on'); }

      function fromEvent(e) {
        var rect = svg.getBoundingClientRect();
        var rel = (e.clientX - rect.left) / rect.width * CH.w;
        var i = n === 1 ? 0 : Math.round((rel - CH.l) / iw * (n - 1));
        show(Math.min(n - 1, Math.max(0, i)));
      }
      svg.addEventListener('pointermove', fromEvent);
      svg.addEventListener('pointerdown', fromEvent);
      svg.addEventListener('pointerleave', hide);
      svg.addEventListener('blur', hide);
      svg.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { show(cur < 0 ? 0 : Math.min(n - 1, cur + 1)); e.preventDefault(); }
        else if (e.key === 'ArrowLeft') { show(cur < 0 ? n - 1 : Math.max(0, cur - 1)); e.preventDefault(); }
        else if (e.key === 'Home') { show(0); e.preventDefault(); }
        else if (e.key === 'End') { show(n - 1); e.preventDefault(); }
        else if (e.key === 'Escape') { hide(); }
      });
    });
  }

  /* ------------------------------------------------------------ sections --- */

  var READY_GLYPH = { push: 'up', maintain: 'right', pull_back: 'down', rest: 'pause' };
  var BAND_TONE = { green: 'good', yellow: 'warn', red: 'bad' };

  function sessionText(plan) {
    var names = (I.SESSION_NAMES && I.SESSION_NAMES[lang]) || {};
    var bits = [];
    if (plan.zone2) {
      bits.push(ltr(names.zone2 || 'Zone 2') + ' ' + ltr(plan.zone2.min + (plan.zone2.max ? '-' + plan.zone2.max : ''))
        + ' ' + t('minutes') + ' @ ' + ltr(plan.zone2.hrLow + '-' + plan.zone2.hrHigh + ' bpm'));
    }
    if (plan.isLiftDay && plan.strengthLabel) bits.push(ltr('Strength ' + plan.strengthLabel));
    if (plan.walk) bits.push(plan.walk.minutes ? (names.walk_easy || 'Easy walk') + ' ' + ltr(plan.walk.minutes) + ' ' + t('minutes') : (names.walk_long || 'Long walk'));
    if (!bits.length) bits.push(names.rest || t('rest'));
    if (plan.deferred) bits.push('(' + ltr('Strength ' + plan.deferred) + ' →)');
    return bits.join(' · ');
  }

  function statTile(label, value, sub, tone, meter) {
    return '<div class="stat">'
      + '<div class="stat-label">' + esc(label) + '</div>'
      + '<div class="stat-value' + (tone ? ' tone-' + tone : '') + '">' + esc(value) + '</div>'
      + (sub ? '<div class="stat-sub">' + esc(sub) + '</div>' : '')
      + (meter !== null && meter !== undefined
        ? '<div class="stat-meter"><i style="width:' + Math.round(Math.min(1, Math.max(0, meter)) * 100) + '%"></i></div>'
        : '')
      + '</div>';
  }

  function sectionToday() {
    var td = D.today || {};
    var plan = td.plan || {};
    var rec = td.recovery || {};
    var tot = td.totals || {};
    var tg = td.targets || {};
    var m = td.metrics || {};
    var tone = BAND_TONE[rec.effectiveBand] || null;

    var banners = '';
    if (D.streak && D.streak.broken) {
      banners += '<div class="banner alert">' + icon('alert')
        + '<div>' + esc(t('missTwice', { n: D.streak.misses })) + '</div></div>';
    } else if (D.streak && D.streak.atRisk) {
      banners += '<div class="banner alert">' + icon('alert') + '<div>' + esc(t('missOne')) + '</div></div>';
    }
    if (tg.deficitPaused && tg.quitWindow) {
      banners += '<div class="banner note">' + icon('info') + '<div>' + esc(t('deficitPaused')) + ' · '
        + esc(t('dayOf', { a: tg.quitWindow.daysSinceQuit + 1, b: 28 })) + '</div></div>';
    }

    var readinessBlock = '<div class="readiness">'
      + '<span class="readiness-glyph ' + (tone ? 'bg-' + tone : '') + '">'
      + icon(READY_GLYPH[rec.readiness] || 'right') + '</span>'
      + '<span><span class="readiness-word' + (tone ? ' tone-' + tone : '') + '">'
      + esc(t(rec.readiness || 'maintain')) + '</span>'
      + '<span class="readiness-meta">' + (rec.pct === null || rec.pct === undefined
        ? esc(t('recovery') + ' — ' + t('recoveryMissing'))
        : esc(t('recovery')) + ' ' + ltr(rec.pct + '%')
          + (rec.sleepDowngrade ? ' · ' + esc(t('sleepDowngrade')) : ''))
      + '</span></span></div>';

    var exercises = '';
    if (plan.exercises && plan.exercises.length) {
      exercises = '<ul class="exercises">' + plan.exercises.map(function (e, i) {
        return '<li><span class="num">' + (i + 1) + '</span><span>' + esc(e) + '</span></li>';
      }).join('') + '</ul>';
    }

    var proteinPct = tg.protein ? (tot.protein || 0) / tg.protein : null;
    var kcalPct = tg.kcal ? (tot.kcal || 0) / tg.kcal : null;
    var stepsPct = plan.stepsTarget ? (m.steps || 0) / plan.stepsTarget : null;

    var tiles = statTile(t('protein'), fmt(tot.protein, 0), t('target') + ' ' + tg.protein + ' ' + t('grams'),
        proteinPct !== null && proteinPct >= 1 ? 'good' : null, proteinPct)
      + statTile(t('calories'), fmt(tot.kcal, 0), t('target') + ' ' + tg.kcal, null, kcalPct)
      + statTile(t('meals'), fmt(tot.meals, 0),
        tot.satFatFlags ? tot.satFatFlags + ' ' + t('satFatMeals') : '', null, null)
      + statTile(t('steps'), m.steps === null || m.steps === undefined ? '—' : fmt(m.steps, 0),
        plan.stepsTarget ? t('target') + ' ' + plan.stepsTarget : '', null, stepsPct);

    var supps = (td.supplements || []).map(function (s) {
      return '<li><span>' + esc(s.names.join(lang === 'ar' ? '، ' : ', ')) + '</span>'
        + '<span class="when">' + esc(s.slot) + '</span></li>';
    }).join('');

    return '<section id="today"><h2>' + esc(t('sectionToday')) + '</h2>'
      + banners
      + '<div class="card"><div class="hero"><div>' + readinessBlock
      + '<div class="session-line">' + sessionText(plan) + '</div>'
      + exercises
      + (plan.prescription && plan.isLiftDay ? '<div class="prescription">' + esc(plan.prescription) + '</div>' : '')
      + '</div></div></div>'
      + '<div class="grid grid-4">' + tiles + '</div>'
      + (supps ? '<div class="card" style="margin-top:var(--s3)">'
          + '<div class="stat-label">' + esc(t('supplements')) + '</div>'
          + '<ul class="list">' + supps + '</ul>'
          + '<div class="stat-sub" style="margin-top:var(--s2)">'
          + ((td.supplementsDue && td.supplementsDue.length)
            ? esc(t('remaining')) + ': ' + esc(td.supplementsDue.join(lang === 'ar' ? '، ' : ', '))
            : icon('check') + ' ' + esc(t('allTicked')))
          + '</div></div>' : '')
      + '</section>';
  }

  function sectionProgress() {
    var g = D.game || {};
    var lv = g.level || { level: 1, progress: 0, toNext: 0 };
    var today = g.today || { xp: 0, earned: [], possible: 0 };
    var earnedKeys = {};
    (today.earned || []).forEach(function (e) { earnedKeys[e.key] = true; });

    var C = 2 * Math.PI * 40;
    var ring = '<div class="ring"><svg viewBox="0 0 92 92" aria-hidden="true">'
      + '<circle class="ring-track" cx="46" cy="46" r="40" fill="none" stroke-width="7"/>'
      + '<circle class="ring-fill" cx="46" cy="46" r="40" fill="none" stroke-width="7" stroke-linecap="round"'
      + ' stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="'
      + (C * (1 - (lv.progress || 0))).toFixed(1) + '"/></svg>'
      + '<span class="ring-center"><span><span class="ring-num">' + lv.level + '</span>'
      + '<span class="ring-cap">' + esc(t('level')) + '</span></span></span></div>';

    var rules = (I.XP_RULES_ORDER || []);
    var chips = rules.map(function (r) {
      var on = !!earnedKeys[r.key];
      return '<span class="xp-chip' + (on ? ' earned' : '') + '">'
        + (on ? icon('check') : icon('dot'))
        + esc(pick(I.XP_NAMES, r.key))
        + '<span class="pts">+' + r.xp + '</span></span>';
    }).join('');

    var badges = (g.achievements || []).map(function (a) {
      var meta = pick(I.ACHIEVEMENT_NAMES, a.id, [a.id, '']);
      return '<div class="badge' + (a.unlocked ? ' on' : '') + '"'
        + ' title="' + esc(meta[1]) + '">'
        + icon(ACH_ICON[a.icon] || 'target')
        + '<div class="badge-name">' + esc(meta[0]) + '</div>'
        + '<div class="badge-desc">' + esc(meta[1]) + '</div></div>';
    }).join('');

    return '<section id="progress"><h2>' + esc(t('sectionProgress')) + '</h2>'
      + '<div class="card"><div class="level-card">' + ring
      + '<div class="level-meta">'
      + '<div class="level-name">' + esc(pick(I.LEVEL_NAMES, String(lv.level), '')) + '</div>'
      + '<div class="level-sub">' + ltr(fmt(g.total, 0)) + ' ' + esc(t('xp'))
      + (lv.next ? ' · ' + ltr(fmt(lv.toNext, 0)) + ' ' + esc(t('toNextLevel')) : '') + '</div>'
      + '<div class="level-sub">' + esc(t('xpToday')) + ' ' + ltr('+' + fmt(today.xp, 0)) + '</div>'
      + '</div></div>'
      + '<div class="xp-list">' + chips + '</div></div>'
      + '<h2 style="margin-top:var(--s5)">' + esc(t('sectionAchievements'))
      + '<span style="font-family:var(--font-latin);font-variant-numeric:tabular-nums">'
      + ltr(g.unlockedCount + ' / ' + g.achievementCount) + '</span></h2>'
      + '<div class="badges">' + badges + '</div>'
      + '</section>';
  }

  function sectionWeek() {
    var w = D.weekView || { days: [] };
    var wd = (I.WEEKDAY_SHORT && I.WEEKDAY_SHORT[lang]) || {};
    var mark = { done: 'check', missed: 'x', rest: 'dot', today: 'clock', planned: '' };

    var strip = '<div class="strip" role="list">' + (w.days || []).map(function (d) {
      var glyph = mark[d.state];
      return '<div class="strip-day ' + d.state + '" role="listitem" aria-label="'
        + esc(d.date + ' · ' + d.state) + '">'
        + '<span class="strip-lbl">' + esc(wd[d.weekday] || d.weekday) + '</span>'
        + (glyph ? icon(glyph) : '<span style="height:16px"></span>') + '</div>';
    }).join('') + '</div>';

    var sessTone = w.sessionsDone >= (w.trainingDays - 1) ? 'good' : 'warn';
    var aerTone = w.aerobic >= w.aerobicTarget ? 'good' : 'warn';

    return '<section id="week"><h2>' + esc(t('sectionWeek')) + '</h2>'
      + '<div class="card">' + strip + '</div>'
      + '<div class="grid grid-3">'
      + statTile(t('sessions'), ltr(w.sessionsDone + ' / ' + w.trainingDays), t('ofTrainingDays'), sessTone,
          w.trainingDays ? w.sessionsDone / w.trainingDays : 0)
      + statTile(t('aerobicMinutes'), fmt(w.aerobic, 0), t('target') + ' ' + w.aerobicTarget, aerTone,
          w.aerobicTarget ? w.aerobic / w.aerobicTarget : 0)
      + statTile(t('streak'), fmt(D.streak ? D.streak.hit : 0, 0), t('consecutiveDays'),
          (D.streak && D.streak.hit > 2) ? 'good' : null, null)
      + '</div></section>';
  }

  function sectionQuit() {
    var s = D.smoking;
    if (!s) return '';
    var body = s.beforeQuit
      ? statTile(t('daysToQuit'), fmt(s.daysToQuit, 0), t('quitDate') + ' ' + (s.quitDate || ''), null, null)
      : statTile(t('smokeFreeDays'), fmt(s.clean, 0), ltr(s.days + ' ' + t('days')),
          s.clean === s.days ? 'good' : 'warn', s.days ? s.clean / s.days : 0);
    return '<section id="quit"><h2>' + esc(t('sectionQuit')) + '</h2>'
      + '<div class="grid grid-3">' + body + '</div></section>';
  }

  function sectionTrends(store) {
    var tr = D.trends || {};
    var c = getComputedStyle(document.documentElement);
    var accent = c.getPropertyValue('--accent').trim() || '#007871';
    var oxide = c.getPropertyValue('--oxide').trim() || '#A4442F';

    var specs = [
      { id: 'weight', title: t('weight') + ' (' + t('kg') + ')', points: tr.weight, color: accent, digits: 1,
        unit: t('kg'), reference: D.goalWeight, referenceLabel: t('target') + ' ' + D.goalWeight },
      { id: 'rhr', title: t('restingHr'), points: tr.restingHr, color: oxide, digits: 0, unit: 'bpm', reference: null },
      { id: 'sleep', title: t('sleep') + ' (' + t('hours') + ')', points: tr.sleep, color: accent, digits: 1,
        unit: t('hours'), reference: 7, referenceLabel: '7' },
      { id: 'aerobic', title: t('aerobicPerDay'), points: tr.aerobic, color: accent, digits: 0,
        unit: t('minutes'), reference: 21, referenceLabel: '150 / ' + t('week').toLowerCase() },
      { id: 'protein', title: t('proteinPerDay') + ' (' + t('grams') + ')', points: tr.protein, color: accent,
        digits: 0, unit: t('grams'), reference: (D.today && D.today.targets) ? D.today.targets.protein : null,
        referenceLabel: t('target') },
    ];
    var html = specs.map(function (s) { store[s.id] = s; return buildChart(s); }).join('');
    return '<section id="trends"><h2>' + esc(t('sectionTrends')) + '</h2>' + html + '</section>';
  }

  function sectionLabs(store) {
    var L = D.labs || { rows: [] };
    var c = getComputedStyle(document.documentElement);
    var accent = c.getPropertyValue('--accent').trim() || '#007871';
    var oxide = c.getPropertyValue('--oxide').trim() || '#A4442F';

    var ldl = { id: 'ldl', title: t('ldl') + ' (mg/dL)', points: L.ldl, color: oxide, digits: 0,
      unit: 'mg/dL', reference: 190, referenceLabel: '190 · ' + t('veryHigh') };
    var tc = { id: 'tc', title: t('totalCholesterol') + ' (mg/dL)', points: L.totalCholesterol, color: accent,
      digits: 0, unit: 'mg/dL', reference: 240, referenceLabel: '240 · ' + t('high') };
    store.ldl = ldl; store.tc = tc;

    var rows = (L.rows || []).map(function (r) {
      var label = pick(I.MARKER_NAMES, r.marker, r.label);
      var tone = r.worse === true ? 'bad' : r.worse === false ? 'good' : '';
      var arrow = r.direction === 'up' ? 'up' : r.direction === 'down' ? 'down' : '';
      var band = r.band ? pick(I.BAND_NAMES, r.band, r.band) : '';
      return '<div class="labrow"><span class="lab-name">' + esc(label) + '</span>'
        + '<span class="lab-right">'
        + (r.delta !== null && r.delta !== undefined && arrow
          ? '<span class="delta ' + (tone ? 'tone-' + tone : '') + '">' + icon(arrow)
            + ltr((r.delta > 0 ? '+' : '') + fmt(r.delta, 1)) + '</span>' : '')
        + (band ? '<span class="pill ' + (tone ? 'tone-' + tone : '') + '">' + esc(band) + '</span>' : '')
        + '<span class="lab-val">' + esc(fmt(r.value, 1)) + ' ' + esc(r.unit) + '</span>'
        + '</span></div>';
    }).join('');

    return '<section id="labs"><h2>' + esc(t('sectionLabs')) + '</h2>'
      + buildChart(ldl) + buildChart(tc)
      + '<div class="card">' + (rows || '<div class="empty">' + esc(t('noData')) + '</div>')
      + '<div class="stat-sub" style="margin-top:var(--s3)">' + esc(t('labsDirectional')) + '</div></div>'
      + '</section>';
  }

  function sectionBody() {
    var s = D.scan;
    if (!s) return '';
    return '<section id="body"><h2>' + esc(t('sectionBody')) + ' · ' + esc(s.date) + '</h2>'
      + '<div class="grid grid-4">'
      + statTile(t('weight'), fmt(s.weight, 1), t('kg'), null, null)
      + statTile(t('bodyFat'), fmt(s.bodyFatPct, 1) + '%', fmt(s.bodyFatKg, 1) + ' ' + t('kg'), null, null)
      + statTile(t('muscle'), fmt(s.muscle, 1), t('kg'), null, null)
      + statTile(t('visceral'), fmt(s.visceral, 0), t('level_'), null, null)
      + '</div></section>';
  }

  function sectionOpen() {
    var items = D.openItems || [];
    if (!items.length) return '';
    return '<section id="open"><h2>' + esc(t('sectionOpen')) + '</h2><div class="card"><ul class="list">'
      + items.map(function (o) {
        return '<li><span>' + esc(o.title) + '</span>'
          + (o.dueOn ? '<span class="when">' + esc(o.dueOn) + '</span>' : '') + '</li>';
      }).join('') + '</ul></div></section>';
  }

  function feedRow(r) {
    var meta;
    if (r.t === 'meal') {
      meta = [r.kcal ? r.kcal + ' kcal' : null, r.protein ? r.protein + ' g P' : null,
        r.satFat ? '⚠ sat fat' : null, r.conf].filter(Boolean).join(' · ');
    } else {
      meta = [r.duration ? r.duration + ' min' : null, r.z2 ? r.z2 + ' z2' : null,
        r.avgHr ? 'avg ' + r.avgHr : null, r.rpe ? 'RPE ' + r.rpe : null,
        r.completed === false ? (t('skipped') + (r.reason ? ': ' + r.reason : '')) : null]
        .filter(Boolean).join(' · ');
    }
    return '<div class="feed-row"><div class="feed-top"><span class="d">' + esc(r.d) + '</span>'
      + icon(r.t === 'meal' ? 'utensils' : 'activity')
      + '<span>' + esc(t(r.t === 'meal' ? 'meal' : 'workout')) + '</span></div>'
      + '<div class="feed-main">' + esc(r.s) + '</div>'
      + (meta ? '<div class="feed-meta">' + esc(meta) + '</div>' : '') + '</div>';
  }

  function sectionHistory() {
    return '<section id="history"><h2>' + esc(t('sectionHistory')) + '</h2>'
      + '<label class="sr-only" for="q">' + esc(t('searchPlaceholder')) + '</label>'
      + '<input id="q" class="search" type="search" autocomplete="off" placeholder="'
      + esc(t('searchPlaceholder')) + '">'
      + '<div class="feed" id="feed"></div></section>';
  }

  function renderFeed(term) {
    var el = document.getElementById('feed');
    if (!el) return;
    var q = (term || '').trim().toLowerCase();
    var rows = (D.feed || []).filter(function (r) {
      if (!q) return true;
      return (r.s + ' ' + r.d + ' ' + (r.reason || '')).toLowerCase().indexOf(q) !== -1;
    });
    el.innerHTML = rows.length
      ? rows.slice(0, 150).map(feedRow).join('')
      : '<div class="empty" style="border:0">' + esc(t('noResults')) + '</div>';
  }

  /* ---------------------------------------------------------- rendering --- */

  var NAV = [
    ['today', 'navToday'], ['progress', 'navProgress'], ['week', 'navWeek'],
    ['trends', 'navTrends'], ['labs', 'navLabs'], ['history', 'navHistory'],
  ];

  function render() {
    var store = {};
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', (I.DIR && I.DIR[lang]) || 'rtl');
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-lang', lang);

    var sub = [
      D.blockName,
      D.week ? t('week') + ' ' + ltr(D.week + ' ' + t('of') + ' ' + D.blockWeeks) : null,
      D.date,
    ].filter(Boolean).join(' · ');

    document.getElementById('app').innerHTML =
      '<header class="topbar"><div class="topbar-inner">'
      + '<div class="brand"><h1>' + esc(t('appTitle')) + '</h1>'
      + '<div class="sub">' + esc(sub) + '</div></div>'
      + '<div class="controls">'
      + '<button class="iconbtn" id="lang-btn" aria-label="' + esc(t('languageLabel')) + '">'
      + '<span aria-hidden="true">' + esc(t('language')) + '</span></button>'
      + '<button class="iconbtn" id="theme-btn" aria-label="' + esc(t('themeLabel'))
      + '" aria-pressed="' + (theme === 'dark') + '">'
      + icon(theme === 'dark' ? 'sun' : 'moon') + '</button>'
      + '</div></div>'
      + '<nav class="chipnav" aria-label="' + esc(t('appTitle')) + '">'
      + NAV.map(function (n) {
        return '<a class="chip" href="#' + n[0] + '" data-nav="' + n[0] + '">' + esc(t(n[1])) + '</a>';
      }).join('') + '</nav></header>'
      + '<div class="wrap">'
      + sectionToday() + sectionProgress() + sectionWeek() + sectionQuit()
      + sectionTrends(store) + sectionLabs(store) + sectionBody() + sectionOpen() + sectionHistory()
      + '<footer>' + esc(t('disclaimer')) + '</footer>'
      + '</div>';

    activateCharts(store);
    renderFeed('');

    document.getElementById('lang-btn').addEventListener('click', function () {
      lang = lang === 'ar' ? 'en' : 'ar';
      writePref('hos.lang', lang);
      render();
    });
    document.getElementById('theme-btn').addEventListener('click', function () {
      theme = theme === 'dark' ? 'light' : 'dark';
      writePref('hos.theme', theme);
      render();
    });
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function (e) { renderFeed(e.target.value); });

    observeSections();
  }

  var observer = null;
  function observeSections() {
    if (observer) observer.disconnect();
    if (!('IntersectionObserver' in window)) return;
    var chips = {};
    document.querySelectorAll('[data-nav]').forEach(function (a) { chips[a.getAttribute('data-nav')] = a; });
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        Object.keys(chips).forEach(function (k) { chips[k].setAttribute('aria-current', String(k === en.target.id)); });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('section[id]').forEach(function (s) { observer.observe(s); });
  }

  render();
})();
