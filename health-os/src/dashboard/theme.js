// Theme plumbing.
//
// The dark tokens are written once, under `:root[data-theme="dark"]`. This
// mirrors that same block into `@media (prefers-color-scheme: dark)` guarded by
// `:root:not([data-theme="light"])`, so all three viewer states resolve:
// explicit dark, explicit light, and the un-stamped default where only the OS
// setting separates them. Mirroring beats maintaining two copies of the list.

const DARK_SELECTOR = ':root[data-theme="dark"]';

export function withSystemDarkMode(css) {
  const start = css.indexOf(DARK_SELECTOR);
  if (start === -1) return css;
  const open = css.indexOf('{', start);
  const close = css.indexOf('\n}', open);
  if (open === -1 || close === -1) return css;
  const body = css.slice(open + 1, close);
  const mirrored = `\n@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {${body}\n  }\n}\n`;
  return css.slice(0, close + 2) + mirrored + css.slice(close + 2);
}
