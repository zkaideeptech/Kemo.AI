"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { User } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppHeader() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let unsubscribed = false;
    let subscription: { unsubscribe: () => void } | null = null;

    let supabase: ReturnType<typeof createSupabaseBrowserClient>;
    try {
      supabase = createSupabaseBrowserClient();
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Supabase client unavailable in AppHeader:", error);
      }
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      if (unsubscribed) return;
      setHasSession(Boolean(data.session));
      setUserEmail(data.session?.user?.email || null);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (unsubscribed) return;
      setHasSession(Boolean(session));
      setUserEmail(session?.user?.email || null);
    });
    subscription = data.subscription;

    return () => {
      unsubscribed = true;
      subscription?.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Supabase signOut skipped:", error);
      }
    }
    window.location.href = `/${locale}/login`;
  };

  if (pathname?.includes(`/${locale}/app`)) return null;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/70 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href={`/${locale}`} className="text-xl font-semibold tracking-tight text-foreground transition-colors hover:text-primary">
            {t("appName")}
          </Link>
          {hasSession ? (
            <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
              <Link href={`/${locale}/app/jobs?new=1`} className="transition-colors hover:text-foreground">
                {t("nav.newJob")}
              </Link>
              <Link href={`/${locale}/app/jobs`} className="transition-colors hover:text-foreground">
                {t("nav.jobs")}
              </Link>
            </nav>
          ) : null}
        </div>
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          {hasSession ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  id="user-menu-trigger"
                  className="flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 transition-colors hover:bg-accent"
                >
                  <User className="h-4 w-4" />
                  <span className="max-w-[140px] truncate text-xs font-medium">
                    {userEmail || t("nav.user")}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl border-border/70 p-2 shadow-none backdrop-blur-sm">
                <DropdownMenuItem className="mb-1 rounded-lg text-xs text-muted-foreground" disabled>
                  {userEmail}
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer rounded-lg focus:bg-primary/10 focus:text-foreground">
                  <Link href={`/${locale}/app/settings`}>{t("nav.settings")}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={signOut} className="cursor-pointer rounded-lg text-destructive focus:bg-destructive/10">
                  {t("nav.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                <Link href={`/${locale}/login`}>{t("nav.login")}</Link>
              </Button>
              <Button asChild size="sm" className="rounded-full font-semibold">
                <Link href={`/${locale}/register`}>{t("login.signUp")}</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
