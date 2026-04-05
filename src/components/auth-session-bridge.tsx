"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function AuthSessionBridge({ locale }: { locale: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const syncInFlightRef = useRef(false);

  useEffect(() => {
    const normalizedPathname =
      pathname && pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;

    if (!normalizedPathname || normalizedPathname.startsWith(`/${locale}/app`) || syncInFlightRef.current) {
      return;
    }

    const localeRoot = `/${locale}`;
    const isAuthLanding =
      normalizedPathname === localeRoot ||
      normalizedPathname === `/${locale}/login` ||
      normalizedPathname === `/${locale}/register`;

    let cancelled = false;

    const syncSession = async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled || !session?.access_token || !session.refresh_token) {
        return;
      }

      syncInFlightRef.current = true;

      const response = await fetch("/api/auth/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
        }),
      });

      if (!response.ok || cancelled) {
        syncInFlightRef.current = false;
        return;
      }

      if (isAuthLanding) {
        router.replace(`/${locale}/app/jobs`);
        return;
      }

      router.refresh();
    };

    void syncSession();

    return () => {
      cancelled = true;
    };
  }, [locale, pathname, router]);

  return null;
}
