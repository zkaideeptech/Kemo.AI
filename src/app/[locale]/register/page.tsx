"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signUp = async () => {
    if (password !== confirmPassword) {
      setError(locale === "zh" ? "两次输入的密码不一致。" : "The passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setError(locale === "zh" ? "密码至少需要 6 位。" : "Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.session?.access_token && data.session.refresh_token) {
      await fetch("/api/auth/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        }),
      });

      router.push(`/${locale}/app/jobs`);
      router.refresh();
      return;
    }

    router.push(`/${locale}/login`);
  };

  return (
    <div className="mx-auto w-full max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>{t("register.title") || (locale === "zh" ? "注册" : "Create account")}</CardTitle>
          <CardDescription>
            {t("register.subtitle") || (locale === "zh" ? "创建账号开始使用 Kemo。" : "Create your Kemo account.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">{t("login.email")}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">{t("login.password")}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={locale === "zh" ? "至少 6 位" : "At least 6 characters"}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirmPassword">
              {t("register.confirmPassword") || (locale === "zh" ? "确认密码" : "Confirm password")}
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder={locale === "zh" ? "再次输入密码" : "Enter password again"}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button onClick={signUp} disabled={loading}>
            {loading ? (locale === "zh" ? "注册中..." : "Creating account...") : t("login.signUp")}
          </Button>
          <p className="text-center text-sm text-muted">
            {locale === "zh" ? "已有账号？" : "Already have an account?"}{" "}
            <Link href={`/${locale}/login`} className="text-primary hover:underline">
              {locale === "zh" ? "登录" : "Sign in"}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
