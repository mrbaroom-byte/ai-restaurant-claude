// Meal estimation from a photo or a text description.
//
// The estimate is deliberately coarse and carries a confidence. Surfacing the
// uncertainty is the point: a photo estimate that reads "552 kcal" is a lie
// with decimal places.

import { model, safeCreate, textOf, toolInput, parseLooseJson } from './client.js';

const TOOL_NAME = 'record_meal';

const MEAL_TOOL = {
  name: TOOL_NAME,
  description: 'Record a structured estimate of one meal.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'The foods identified, each as a short phrase with its portion.',
        items: { type: 'string' },
      },
      description: { type: 'string', description: 'One short line naming the meal.' },
      kcal_est: { type: 'integer', description: 'Estimated calories, rounded to the nearest 10.' },
      protein_g_est: { type: 'integer', description: 'Estimated protein in grams, rounded to the nearest 1.' },
      fibre_g_est: { type: 'integer', description: 'Estimated fibre in grams. 0 if none.' },
      saturated_fat_concern: {
        type: 'boolean',
        description: 'True when the meal is a meaningful saturated fat load - fried food, ghee, butter, cream, full-fat cheese, fatty cuts, palm oil, pastry.',
      },
      confidence: { type: 'string', enum: ['low', 'med', 'high'] },
      note: { type: 'string', description: 'At most one short sentence: the single most useful tweak, or empty.' },
    },
    required: ['items', 'description', 'kcal_est', 'protein_g_est', 'fibre_g_est', 'saturated_fat_concern', 'confidence', 'note'],
    additionalProperties: false,
  },
};

function guidance(profile) {
  const n = profile.nutrition ?? {};
  return `Estimate this meal for ${profile.user?.name}. Saudi/Gulf portions and dishes are the norm.

Rules:
- Round hard. Calories to the nearest 10, protein to the nearest gram. A photo cannot support more precision than that.
- confidence: "high" only when portion and preparation are both obvious; "low" for a photo where the cooking method or oil is a guess.
- His hard constraints: ${(n.hard_constraints ?? []).join(' ')}
- Saturated fat is the marker to watch, not carbs.
${(n.counting_rules ?? []).map((r) => `- ${r}`).join('\n')}
- note: one short sentence at most, in Arabic, naming ONE change. Leave it empty if the meal is fine.

Call ${TOOL_NAME} with the estimate.`;
}

/** Estimate from a photo (raw bytes) plus an optional caption. */
export async function fromPhoto(profile, imageBase64, mediaType, caption = '') {
  const content = [
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
    { type: 'text', text: `${guidance(profile)}${caption ? `\n\nHis caption: ${caption}` : ''}` },
  ];
  return run(content, 'photo');
}

/** Estimate from a text description. */
export async function fromText(profile, description) {
  const content = [{ type: 'text', text: `${guidance(profile)}\n\nThe meal: ${description}` }];
  return run(content, 'text');
}

async function run(content, source) {
  const res = await safeCreate({
    model: model(),
    max_tokens: 1000,
    tools: [MEAL_TOOL],
    tool_choice: { type: 'tool', name: TOOL_NAME },
    messages: [{ role: 'user', content }],
  });
  if (!res.ok) return { ok: false, error: res.error };

  // Structured path first, defensive text parse second - a forced tool call
  // should always produce the block, but the loop must not throw if it doesn't.
  let input = toolInput(res.response, TOOL_NAME);
  if (!input) input = parseLooseJson(textOf(res.response));
  if (!input) return { ok: false, error: 'Could not read an estimate from the reply.' };

  return { ok: true, estimate: normalise(input, source) };
}

function normalise(raw, source) {
  const int = (v) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? n : null;
  };
  const items = Array.isArray(raw.items) ? raw.items.filter(Boolean).map(String) : [];
  return {
    items,
    description: String(raw.description ?? items.join('، ') ?? '').trim() || 'وجبة',
    kcal_est: clamp(int(raw.kcal_est), 0, 5000),
    protein_g_est: clamp(int(raw.protein_g_est), 0, 300),
    fibre_g_est: clamp(int(raw.fibre_g_est), 0, 100),
    sat_fat_flag: Boolean(raw.saturated_fat_concern),
    confidence: ['low', 'med', 'high'].includes(raw.confidence) ? raw.confidence : 'low',
    note: String(raw.note ?? '').trim(),
    source,
  };
}

function clamp(n, lo, hi) {
  if (n == null) return null;
  return Math.min(hi, Math.max(lo, n));
}
