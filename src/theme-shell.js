import { resolveColorScheme } from './color-schemes.js';

export function applyShellScheme(body, settings) {
  const scheme = resolveColorScheme(settings);
  body.dataset.colorScheme = scheme.id;
  body.classList.toggle('light', !scheme.dark);
  body.style.colorScheme = scheme.dark ? 'dark' : 'light';
  for (const [key, value] of Object.entries(scheme.colors)) {
    body.style.setProperty(`--scheme-${key}`, value);
  }
  for (const key of ['bg','panel','text','muted','line','hover','accent']) {
    body.style.setProperty(`--${key}`, scheme.colors[key]);
  }
  body.style.setProperty('--editor', scheme.colors.bg);
}
