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
    <header className="sticky top-0 z-40 w-full glass-dark border-b border-white/5">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href={`/${locale}`} className="text-xl font-bold tracking-tight hover:text-primary transition-colors duration-300">
            {t("appName")}
          </Link>
          {hasSession && (
            <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
              <Link
                href={`/${locale}/app/new`}
                className="transition-colors hover:text-foreground hover:drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]"
              >
                {t("nav.newJob")}
              </Link>
              <Link
                href={`/${locale}/app/jobs`}
                className="transition-colors hover:text-foreground hover:drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]"
              >
                {t("nav.jobs")}
              </Link>
            </nav>
          )}
        </div>
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          {hasSession ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center gap-2 rounded-full border border-border/50 hover:bg-muted hover:border-primary/50 transition-all">
                  <User className="h-4 w-4" />
                  <span className="max-w-[140px] truncate text-xs font-medium">
                    {userEmail || "用户"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl border-border/50 p-2 shadow-xl backdrop-blur-sm">
                <DropdownMenuItem className="mb-1 rounded-lg text-xs text-muted-foreground" disabled>
                  {userEmail}
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="rounded-lg focus:bg-primary/10 focus:text-foreground cursor-pointer">
                  <Link href={`/${locale}/app/settings`}>
                    {t("nav.settings") || "个人设置"}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={signOut} className="rounded-lg text-destructive focus:bg-destructive/10 cursor-pointer">
                  {t("nav.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                <Link href={`/${locale}/login`}>{t("nav.login")}</Link>
              </Button>
              <Button asChild size="sm" className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_0_15px_rgba(57,255,20,0.4)] transition-all duration-300 font-semibold">
                <Link href={`/${locale}/register`}>{t("login.signUp")}</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
