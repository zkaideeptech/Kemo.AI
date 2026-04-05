"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { AuthSessionBridge } from "@/components/auth-session-bridge";
import { LogoSplash } from "@/components/logo-splash";

export function LocaleChrome({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const appRoot = `/${locale}/app/jobs`;
  const localeRoot = `/${locale}`;
  const normalizedPathname = pathname?.endsWith("/") && pathname.length > localeRoot.length
    ? pathname.slice(0, -1)
    : pathname;
  const isLocaleRoot = normalizedPathname === localeRoot;
  const isAppRoute = normalizedPathname?.startsWith(`/${locale}/app`);

  useEffect(() => {
    if (isLocaleRoot) {
      router.replace(appRoot);
    }
  }, [appRoot, isLocaleRoot, router]);

  return (
    <LogoSplash>
      <AuthSessionBridge locale={locale} />
      {isLocaleRoot ? (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : isAppRoute ? (
        children
      ) : (
        <div className="min-h-screen relative bg-transparent">
          <div className="noise-overlay" />
          <AppHeader />
          <main className="relative z-10 w-full px-4 py-6 sm:px-6 sm:py-8">
            {children}
          </main>
        </div>
      )}
    </LogoSplash>
  );
}
