/**
 * Build-time product switches. Arabic is deliberately dormant: the message file,
 * Arabic shaping utilities and fonts remain in the repository, but nothing is
 * imported or bundled until `ENABLED_LOCALES` is changed by a future release.
 */
export const ENABLED_LOCALES = ["en"] as const;
export type EnabledLocale = (typeof ENABLED_LOCALES)[number];

export const DEFAULT_LOCALE: EnabledLocale = "en";
export const DEFAULT_TIME_ZONE = "Africa/Cairo";
export const ALLOWED_SCRIPTS = "latin" as const;

/** Latin letters (including accents), digits, spaces and the documented punctuation. */
export const LATIN_TEXT_PATTERN = /^[\p{Script=Latin}\p{N}\s.,'\-&/()#]+$/u;
