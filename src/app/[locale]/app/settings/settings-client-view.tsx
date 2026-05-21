"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, User, Key, LogOut, Upload, Palette, BarChart3 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WorkspaceThemeSwitcher } from "@/components/workspace-theme-switcher";

interface SettingsClientViewProps {
  user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string;
  };
  plan: {
    plan: string;
    maxFileSizeMb: number;
  };
  stats: {
    jobCount: number;
    minutesUsed: number;
    filesUsed: number;
  };
  locale: string;
}

export function SettingsClientView({ user, plan, stats, locale }: SettingsClientViewProps) {
  const t = useTranslations();
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [fullName, setFullName] = useState(user.fullName);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const handleUpdateProfile = async () => {
    try {
      setIsSavingProfile(true);
      const { error } = await supabase.auth.updateUser({
        data: { full_name: fullName, avatar_url: avatarUrl },
      });
      if (error) throw error;
      alert(t("settings.profileUpdated"));
      router.refresh();
    } catch (error) {
      alert(`${t("settings.updateFailed")}: ${(error as Error).message}`);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingAvatar(true);
      const fileExt = file.name.split(".").pop();
      const filePath = `${user.id}/${Math.random()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
      setAvatarUrl(data.publicUrl);
    } catch (error) {
      alert(`${t("settings.avatarUploadFailed")}: ${(error as Error).message}`);
    } finally {
      setIsUploadingAvatar(false);
      if (event.target) event.target.value = "";
    }
  };

  const handleUpdatePassword = async () => {
    if (!password) return;
    if (password !== confirmPassword) {
      alert(t("register.passwordMismatch"));
      return;
    }

    try {
      setIsSavingPassword(true);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      alert(t("settings.passwordUpdated"));
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      alert(`${t("settings.passwordUpdateFailed")}: ${(error as Error).message}`);
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleSignOut = async () => {
    if (!window.confirm(t("settings.confirmSignOut"))) return;
    await supabase.auth.signOut();
    window.location.href = `/${locale}/login`;
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full max-w-[500px] grid-cols-4 mb-8">
        <TabsTrigger value="dashboard" className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4" /> {t("settings.tabs.dashboard")}
        </TabsTrigger>
        <TabsTrigger value="profile" className="flex items-center gap-2">
          <User className="w-4 h-4" /> {t("settings.tabs.profile")}
        </TabsTrigger>
        <TabsTrigger value="security" className="flex items-center gap-2">
          <Key className="w-4 h-4" /> {t("settings.tabs.security")}
        </TabsTrigger>
        <TabsTrigger value="appearance" className="flex items-center gap-2">
          <Palette className="w-4 h-4" /> {t("settings.tabs.appearance")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="dashboard" className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("settings.stats.minutes")}</CardDescription>
              <CardTitle className="text-4xl text-primary">{stats.minutesUsed ?? 0} <span className="text-sm font-normal text-muted-foreground">{t("settings.units.minutes")}</span></CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("settings.stats.files")}</CardDescription>
              <CardTitle className="text-4xl text-primary">{stats.filesUsed ?? 0} <span className="text-sm font-normal text-muted-foreground">{t("settings.units.items")}</span></CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("settings.stats.totalJobs")}</CardDescription>
              <CardTitle className="text-4xl text-primary">{stats.jobCount ?? 0} <span className="text-sm font-normal text-muted-foreground">{t("settings.units.items")}</span></CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.overview.title")}</CardTitle>
            <CardDescription>{t("settings.overview.description")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">{t("new.plan")}</span>
              <span className="font-medium bg-primary/10 text-primary px-3 py-1 rounded-full text-xs">
                {plan.plan === "pro" ? t("plan.pro") : t("plan.free")}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">{t("settings.overview.fileLimit")}</span>
              <span className="font-medium">{plan.maxFileSizeMb} MB</span>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="profile" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.profile.title")}</CardTitle>
            <CardDescription>{t("settings.profile.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-6">
              <div className="relative group w-24 h-24 rounded-full overflow-hidden border border-border bg-muted flex items-center justify-center shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={t("settings.profile.avatar")} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-10 h-10 text-slate-400" />
                )}
                <label className="absolute inset-0 bg-black/50 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  {isUploadingAvatar ? <Loader2 className="w-6 h-6 text-white animate-spin" /> : <Upload className="w-6 h-6 text-white" />}
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={isUploadingAvatar} />
                </label>
              </div>
              <div className="flex-1 space-y-1">
                <h3 className="font-medium text-sm">{t("settings.profile.avatar")}</h3>
                <p className="text-xs text-muted-foreground">{t("settings.profile.avatarHint")}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("login.email")}</Label>
              <Input value={user.email} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">{t("settings.profile.emailLocked")}</p>
            </div>

            <div className="space-y-2">
              <Label>{t("settings.profile.displayName")}</Label>
              <Input placeholder={t("settings.profile.displayNamePlaceholder")} value={fullName} onChange={(event) => setFullName(event.target.value)} />
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleUpdateProfile} disabled={isSavingProfile}>
              {isSavingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("common.save")}
            </Button>
          </CardFooter>
        </Card>
      </TabsContent>

      <TabsContent value="security" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.security.passwordTitle")}</CardTitle>
            <CardDescription>{t("settings.security.passwordDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t("settings.security.newPassword")}</Label>
              <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("settings.security.confirmNewPassword")}</Label>
              <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleUpdatePassword} disabled={!password || isSavingPassword}>
              {isSavingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("settings.security.updatePassword")}
            </Button>
          </CardFooter>
        </Card>

        <Card className="border-red-500/20">
          <CardHeader>
            <CardTitle className="text-destructive">{t("settings.danger.title")}</CardTitle>
            <CardDescription>{t("settings.danger.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={handleSignOut} className="w-full sm:w-auto">
              <LogOut className="mr-2 h-4 w-4" /> {t("settings.danger.signOut")}
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="appearance" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.appearance.title")}</CardTitle>
            <CardDescription>{t("settings.appearance.description")}</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between p-4 border border-border rounded-xl">
              <div>
                <h4 className="font-medium">{t("settings.appearance.theme")}</h4>
                <p className="text-sm text-muted-foreground mt-1">{t("settings.appearance.themeHint")}</p>
              </div>
              <WorkspaceThemeSwitcher />
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
