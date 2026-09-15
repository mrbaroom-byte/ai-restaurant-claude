// Inline SVG charts. No chart library, no network: the dashboard has to open
// on a phone on hotel wifi and render from one HTML response.

const PAD = { top: 14, right: 12, bottom: 22, left: 34 };

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * A line chart over { x: 'YYYY-MM-DD', y: number } points.
 * `reference` draws a dashed threshold line, e.g. LDL 190.
 */
export function lineChart(points, {
  width = 560, height = 170, color = '#17605C', reference = null,
  referenceLabel = '', yLabel = '', decimals = 0, fill = true,
} = {}) {
  const data = (points ?? []).filter((p) => p && Number.isFinite(Number(p.y)));
  if (data.length === 0) {
    return `<div class="empty">لا توجد بيانات كافية بعد</div>`;
  }

  const ys = data.map((p) => Number(p.y));
  const candidates = reference != null ? [...ys, reference] : ys;
  let min = Math.min(...candidates);
  let max = Math.max(...candidates);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  min -= span * 0.12;
  max += span * 0.12;

  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const px = (i) => PAD.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const py = (v) => PAD.top + innerH - ((v - min) / (max - min)) * innerH;

  const path = data.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(Number(p.y)).toFixed(1)}`).join(' ');
  const area = fill && data.length > 1
    ? `<path d="${path} L${px(data.length - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${px(0).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z" fill="${color}" opacity="0.10"/>`
    : '';

  const dots = data.map((p, i) =>
    `<circle cx="${px(i).toFixed(1)}" cy="${py(Number(p.y)).toFixed(1)}" r="${data.length > 40 ? 1.5 : 3}" fill="${color}"><title>${esc(p.x)}: ${Number(p.y).toFixed(decimals)}</title></circle>`).join('');

  const refLine = reference != null
    ? `<line x1="${PAD.left}" y1="${py(reference).toFixed(1)}" x2="${width - PAD.right}" y2="${py(reference).toFixed(1)}"
         stroke="#A4442F" stroke-width="1.2" stroke-dasharray="5 4"/>
       <text x="${width - PAD.right}" y="${(py(reference) - 5).toFixed(1)}" text-anchor="end"
         font-size="10" fill="#A4442F">${esc(referenceLabel || String(reference))}</text>`
    : '';

  const ticks = [max, (max + min) / 2, min].map((v) =>
    `<text x="${PAD.left - 6}" y="${(py(v) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#7C7767">${v.toFixed(decimals)}</text>
     <line x1="${PAD.left}" y1="${py(v).toFixed(1)}" x2="${width - PAD.right}" y2="${py(v).toFixed(1)}" stroke="#C6C2B6" stroke-width="0.5" opacity="0.6"/>`).join('');

  const firstX = esc(data[0].x);
  const lastX = esc(data[data.length - 1].x);

  return `<svg viewBox="0 0 ${width} ${height}" class="chart" direction="ltr" role="img" aria-label="${esc(yLabel)}">
  ${ticks}
  ${area}
  ${refLine}
  <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  ${dots}
  <text x="${PAD.left}" y="${height - 6}" font-size="9" fill="#7C7767">${firstX}</text>
  <text x="${width - PAD.right}" y="${height - 6}" text-anchor="end" font-size="9" fill="#7C7767">${lastX}</text>
</svg>`;
}

/** Seven boxes, one per day of the training week. */
export function weekStrip(days) {
  return `<div class="strip">${days.map((d) => `
    <div class="strip-day ${d.state}" title="${esc(d.date)}">
      <span class="strip-label">${esc(d.label)}</span>
      <span class="strip-mark">${d.state === 'done' ? '✓' : d.state === 'missed' ? '×' : d.state === 'rest' ? '·' : ''}</span>
    </div>`).join('')}</div>`;
}

/** A labelled number with an optional target underneath. */
export function stat(label, value, sub = '', tone = '') {
  return `<div class="stat ${tone}">
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value">${esc(value)}</div>
    ${sub ? `<div class="stat-sub">${esc(sub)}</div>` : ''}
  </div>`;
}
