import { getRequestConfig } from "next-intl/server";
import { defaultLocale, locales, type Locale } from "./config";

export default getRequestConfig(async ({ requestLocale }) => {
  const raw = await requestLocale;
  const isLocale = (value: string): value is Locale =>
    locales.includes(value as Locale);
  const resolvedLocale = raw && isLocale(raw) ? raw : defaultLocale;

  return {
    locale: resolvedLocale,
    messages: (await import(`../messages/${resolvedLocale}.json`)).default,
  };
});
