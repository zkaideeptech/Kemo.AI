import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { LogoSplash } from "@/components/logo-splash";
import { locales, type Locale } from "@/i18n/config";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;

  if (!locales.includes(locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <LogoSplash>
        <div className="min-h-screen relative bg-transparent">
          <div className="noise-overlay" />
          <AppHeader />
          <main className="relative z-10 w-full px-4 py-6 sm:px-6 sm:py-8">
            {children}
          </main>
        </div>
      </LogoSplash>
    </NextIntlClientProvider>
  );
}
