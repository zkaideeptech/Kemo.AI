export const locales = ["en", "zh"] as const;
export const defaultLocale = "zh";

export type Locale = (typeof locales)[number];

