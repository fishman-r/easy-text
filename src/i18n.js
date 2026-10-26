import simplifiedChinese from "./locales/zh-CN.json" with { type: "json" };
import englishFallback from "./locales/en.json" with { type: "json" };

export const DEFAULT_LOCALE = "zh-CN";
export const SUPPORTED_LOCALES = ["zh-CN"];
export const LOCALE_PREFERENCES = ["zh-CN", "system"];
const resources = { "zh-CN": simplifiedChinese, en: englishFallback };

/** Only complete, supported interface packs may be selected by a user. */
export function resolveLocale(preference, systemLocale = "") {
  if (preference === "zh-CN") return "zh-CN";
  if (preference === "system" && /^zh(?:-|$)/i.test(systemLocale))
    return "zh-CN";
  return DEFAULT_LOCALE;
}
export function normalizeLocalePreference(preference) {
  return LOCALE_PREFERENCES.includes(preference) ? preference : DEFAULT_LOCALE;
}
export function t(key, values = {}, locale = DEFAULT_LOCALE) {
  const pattern = resources[locale]?.ui[key] ?? englishFallback.ui[key] ?? key;
  return pattern.replace(/\{(\w+)\}/g, (placeholder, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}
export function codeMirrorPhrases(locale = DEFAULT_LOCALE) {
  return { ...(resources[locale]?.codemirror || simplifiedChinese.codemirror) };
}

export function localeLabel(locale = DEFAULT_LOCALE) {
  return resources[locale]?.label || simplifiedChinese.label;
}
