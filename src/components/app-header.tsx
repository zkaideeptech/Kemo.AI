/**
 * @file app-header.tsx
 * @description 应用顶部导航栏，登录后显示用户信息和个人设置入口
 * @author KEMO
 * @created 2026-02-05
 * @modified 2026-02-06
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  const t = useTranslations();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    // 首次加载读取 session
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data.session));
      setUserEmail(data.session?.user?.email || null);
    });

    // 监听登录/退出事件，实时更新 Header 状态
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
      setUserEmail(session?.user?.email || null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = `/${locale}/login`;
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Link href={`/${locale}`} className="text-lg font-semibold">
            {t("appName")}
          </Link>
          {hasSession && (
            <nav className="hidden items-center gap-4 text-sm text-muted md:flex">
              <Link href={`/${locale}/app/new`} className="hover:text-foreground">
                {t("nav.newJob")}
              </Link>
              <Link href={`/${locale}/app/jobs`} className="hover:text-foreground">
                {t("nav.jobs")}
              </Link>
            </nav>
          )}
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          {hasSession ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span className="max-w-[140px] truncate text-xs">
                    {userEmail || "用户"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem className="text-xs text-muted" disabled>
                  {userEmail}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/${locale}/app/settings`}>
                    {t("nav.settings") || "个人设置"}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={signOut} className="text-destructive">
                  {t("nav.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link href={`/${locale}/login`}>{t("nav.login")}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href={`/${locale}/register`}>{t("login.signUp")}</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
