"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  BarChart2,
  User as UserIcon,
  Key,
  Palette,
  ArrowUp,
  Monitor,
  Sun,
  Moon,
  Loader2,
  ArrowLeft
} from "lucide-react";

import { LogoutButton } from "@/components/logout-button";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { applyWorkspaceMode, useWorkspaceUiMode } from "@/components/workspace-theme-switcher";

interface User {
  id: string;
  email: string | undefined;
  name: string;
}

interface Plan {
  plan: string;
  maxFileSizeMb: number;
}

interface Stats {
  totalJobsHistorical: number;
  totalJobsThisMonth: number;
  totalMinutesThisMonth: number;
}

interface SettingsClientViewProps {
  user: User;
  plan: Plan;
  stats?: Stats;
  locale: string;
}

type TabKey = "dashboard" | "profile" | "security" | "preferences";

export function SettingsClientView({ user, plan, stats, locale }: SettingsClientViewProps) {
  const t = useTranslations();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const themeMode = useWorkspaceUiMode();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const isDark = themeMode === "dark" || (themeMode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(isDark);
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      if (themeMode === "system") setDark(e.matches);
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [themeMode]);
  
  // Profile Editor State
  const [displayName, setDisplayName] = useState(user.name);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Security Editor State
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const supabase = createSupabaseBrowserClient();

  const handleUpdateProfile = async () => {
    if (!displayName.trim()) return;
    setIsSavingProfile(true);
    setProfileMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { 
          name: displayName.trim(),
          display_name: displayName.trim(),
          full_name: displayName.trim()
        }
      });
      if (error) throw error;
      setProfileMessage({ type: "success", text: "资料更新成功！" });
    } catch (err: any) {
      setProfileMessage({ type: "error", text: err.message || "更新失败，请重试。" });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword !== confirmPassword) {
      setPasswordMessage({ type: "error", text: "两次输入的密码不一致" });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMessage({ type: "error", text: "密码不得少于 6 位字符" });
      return;
    }
    setIsSavingPassword(true);
    setPasswordMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });
      if (error) throw error;
      setPasswordMessage({ type: "success", text: "密码更新成功！" });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordMessage({ type: "error", text: err.message || "密码更新失败，请确保密码符合复杂度要求。" });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const tabs: { id: TabKey; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "仪表盘", icon: <BarChart2 className="w-[15px] h-[15px]" /> },
    { id: "profile", label: "资料", icon: <UserIcon className="w-[15px] h-[15px]" /> },
    { id: "security", label: "安全", icon: <Key className="w-[15px] h-[15px]" /> },
    { id: "preferences", label: "偏好", icon: <Palette className="w-[15px] h-[15px]" /> },
  ];

  return (
    <div className="max-w-4xl w-full pt-8 pb-32 px-6 md:px-8 mx-auto">
      
      {/* Return Button */}
      <div className="mb-6">
        <button 
          onClick={() => router.push(`/${locale}/app/jobs`)} 
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          返回工作区
        </button>
      </div>

      {/* Tabs Navigation */}
      <div className={`inline-flex items-center gap-1 p-1 rounded-[14px] mb-8 ${dark ? "bg-white/[0.03] border border-white/5" : "bg-black/5 border border-black/5"}`}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-[10px] text-[14px] transition-all duration-300 ${
                isActive
                  ? (dark ? "bg-white text-black shadow-[0_1px_3px_rgba(0,0,0,0.2)] font-bold" : "bg-black text-white shadow-md font-bold")
                  : (dark ? "text-[#97ada8] hover:text-white hover:bg-white/5" : "text-[#7a6a5c] hover:text-black hover:bg-white/50")
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="w-full">
        {/* DASHBOARD TAB */}
        {activeTab === "dashboard" && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className={`rounded-[1.25rem] border p-6 flex flex-col justify-center min-h-[120px] transition-all ${dark ? "bg-[#1A1D1E] border-white/5 shadow-[0_4px_12px_rgba(0,0,0,0.2)]" : "bg-white border-[#E2E8F0] shadow-sm"}`}>
                <p className={`text-[13px] font-medium mb-3 ${dark ? "text-[#97ada8]" : "text-[#7a6a5c]"}`}>当月转写时长</p>
                <div className="flex items-baseline gap-2">
                  <span className={`text-4xl font-bold tracking-tight ${dark ? "text-white" : "text-black"}`}>{stats?.totalMinutesThisMonth || 0}</span>
                  <span className={`text-[13px] ${dark ? "text-[#97ada8]" : "text-[#7a6a5c]"}`}>分钟</span>
                </div>
              </div>
              <div className={`rounded-[1.25rem] border p-6 flex flex-col justify-center min-h-[120px] transition-all ${dark ? "bg-[#1A1D1E] border-white/5 shadow-[0_4px_12px_rgba(0,0,0,0.2)]" : "bg-white border-[#E2E8F0] shadow-sm"}`}>
                <p className={`text-[13px] font-medium mb-3 ${dark ? "text-[#97ada8]" : "text-[#7a6a5c]"}`}>当月转写任务</p>
                <div className="flex items-baseline gap-2">
                  <span className={`text-4xl font-bold tracking-tight ${dark ? "text-white" : "text-black"}`}>{stats?.totalJobsThisMonth || 0}</span>
                  <span className={`text-[13px] flex items-center gap-1 ${dark ? "text-[#97ada8]" : "text-[#7a6a5c]"}`}>个 <ArrowUp className="w-3 h-3 opacity-50" /></span>
                </div>
              </div>
              <div className={`rounded-[1.25rem] border p-6 flex flex-col justify-center min-h-[120px] transition-all ${dark ? "bg-[#1A1D1E] border-white/5 shadow-[0_4px_12px_rgba(0,0,0,0.2)]" : "bg-white border-[#E2E8F0] shadow-sm"}`}>
                <p className={`text-[13px] font-medium mb-3 ${dark ? "text-[#97ada8]" : "text-[#7a6a5c]"}`}>历史总录音数</p>
                <div className="flex items-baseline gap-2">
                  <span className={`text-4xl font-bold tracking-tight ${dark ? "text-white" : "text-black"}`}>{stats?.totalJobsHistorical || 0}</span>
                  <span className={`text-[13px] flex items-center gap-1 ${dark ? "text-[#97ada8]" : "text-[#7a6a5c]"}`}>个 <ArrowUp className="w-3 h-3 opacity-50" /></span>
                </div>
              </div>
            </div>

            <section className={`rounded-[1.5rem] border p-8 transition-all ${dark ? "bg-[#1A1D1E] border-white/5 shadow-[0_8px_30px_rgba(0,0,0,0.15)]" : "bg-white border-[#E2E8F0] shadow-md"}`}>
              <div className="mb-8">
                <h2 className={`text-lg font-bold tracking-tight mb-2 ${dark ? "text-white" : "text-black"}`}>综合状态</h2>
                <p className={`text-[13px] ${dark ? "text-[#97ada8]" : "text-[#7a6a5c]"}`}>当前账户与配额详情</p>
              </div>
              
              <div className="flex flex-col gap-0 border-t border-border/40">
                <div className="flex items-center justify-between py-5 border-b border-border/40">
                  <span className="text-[15px] text-muted-foreground font-medium">当前套餐</span>
                  <span className="bg-white/10 dark:bg-white/10 text-foreground px-3 py-1.5 rounded-full text-[13px] font-medium border border-border/50">
                    {plan.plan === "pro" ? "Pro 专业版" : "Free 免费版"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-5 border-b border-border/40">
                  <span className="text-[15px] text-muted-foreground font-medium">单文件上传上限</span>
                  <span className="text-[15px] font-bold">{plan.maxFileSizeMb} MB</span>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* PROFILE TAB */}
        {activeTab === "profile" && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
             <section className={`rounded-[1.5rem] border p-8 transition-all ${dark ? "bg-[#1A1D1E] border-white/5 shadow-[0_8px_30px_rgba(0,0,0,0.15)]" : "bg-white border-[#E2E8F0] shadow-md"}`}>
              <div className="mb-8">
                <h2 className={`text-lg font-bold tracking-tight mb-2 ${dark ? "text-white" : "text-black"}`}>个人资料</h2>
                <p className={`text-[13px] ${dark ? "text-[#97ada8]" : "text-[#7a6a5c]"}`}>更新你的显示信息与头像</p>
              </div>
              
              <div className="flex items-center gap-6 mb-10">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center shrink-0 border ${dark ? "bg-black/20 border-white/10" : "bg-black/5 border-black/10"}`}>
                  <UserIcon className={`w-8 h-8 opacity-60 ${dark ? "text-[#97ada8]" : "text-[#7a6a5c]"}`} />
                </div>
                <div>
                  <h3 className={`text-[14px] font-bold mb-1.5 ${dark ? "text-white" : "text-black"}`}>账户头像</h3>
                  <p className={`text-[12px] ${dark ? "text-[#8a9f9a]" : "text-[#90867d]"}`}>推荐尺寸 256x256px, 支持 JPG、PNG、WebP，最大 5MB</p>
                </div>
              </div>

              <div className="grid gap-8">
                <div className="grid gap-2">
                  <label className={`text-[14px] font-bold ${dark ? "text-white" : "text-black"}`}>邮箱地址</label>
                  <Input 
                    value={user.email || ""} 
                    disabled 
                    className={`text-[14px] h-11 pointer-events-none opacity-80 ${dark ? "bg-white/5 border-white/5 text-white/70" : "bg-black/5 border-black/5 text-black/70"}`} 
                  />
                  <p className={`text-[12px] mt-1 ${dark ? "text-[#97ada8]" : "text-[#7a6a5c]"}`}>登录邮箱当前不支持直接修改。</p>
                </div>
                
                <div className="grid gap-2">
                  <label className={`text-[14px] font-bold ${dark ? "text-white" : "text-black"}`}>用户名 (Display Name)</label>
                  <Input 
                    placeholder="输入你想展示的名字" 
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className={`text-[14px] h-11 transition-all ${dark ? "bg-white/[0.02] border-white/10 text-white focus-visible:border-[#00DCBF] focus-visible:ring-1 focus-visible:ring-[#00DCBF]/50" : "bg-transparent border-[#E2E8F0] text-black focus-visible:ring-1 focus-visible:ring-black/10"}`} 
                  />
                </div>

                <div className="pt-2 flex items-center gap-4">
                  <Button 
                    onClick={handleUpdateProfile}
                    disabled={isSavingProfile || displayName.trim() === ""}
                    className="h-10 px-6 font-bold bg-foreground text-background hover:bg-foreground/90 rounded-xl text-[14px]"
                  >
                    {isSavingProfile ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    保存更改
                  </Button>
                  {profileMessage && (
                    <span className={`text-[13px] font-medium ${profileMessage.type === "success" ? "text-green-500 dark:text-green-400" : "text-destructive"}`}>
                      {profileMessage.text}
                    </span>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* SECURITY TAB */}
        {activeTab === "security" && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
             <section className={`rounded-[1.5rem] border p-8 transition-all ${dark ? "bg-[#1A1D1E] border-white/5 shadow-[0_8px_30px_rgba(0,0,0,0.15)]" : "bg-white border-[#E2E8F0] shadow-md"}`}>
              <div className="mb-8">
                <h2 className={`text-lg font-bold tracking-tight mb-2 ${dark ? "text-white" : "text-black"}`}>密码修改</h2>
                <p className={`text-[13px] ${dark ? "text-[#97ada8]" : "text-[#7a6a5c]"}`}>更新账户的安全密码</p>
              </div>

              <div className="grid gap-6">
                <div className="grid gap-2">
                  <label className={`text-[14px] font-bold ${dark ? "text-white" : "text-black"}`}>新密码</label>
                  <Input 
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={`text-[14px] h-11 transition-all ${dark ? "bg-white/[0.02] border-white/10 text-white focus-visible:border-[#00DCBF] focus-visible:ring-1 focus-visible:ring-[#00DCBF]/50" : "bg-transparent border-[#E2E8F0] text-black focus-visible:ring-1 focus-visible:ring-black/10"}`} 
                  />
                </div>
                
                <div className="grid gap-2">
                  <label className={`text-[14px] font-bold ${dark ? "text-white" : "text-black"}`}>确认新密码</label>
                  <Input 
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`text-[14px] h-11 transition-all ${dark ? "bg-white/[0.02] border-white/10 text-white focus-visible:border-[#00DCBF] focus-visible:ring-1 focus-visible:ring-[#00DCBF]/50" : "bg-transparent border-[#E2E8F0] text-black focus-visible:ring-1 focus-visible:ring-black/10"}`} 
                  />
                </div>

                <div className="pt-2 flex items-center gap-4">
                  <Button 
                    onClick={handleUpdatePassword}
                    disabled={isSavingPassword || !newPassword || newPassword !== confirmPassword} 
                    className="h-10 px-6 font-bold rounded-xl text-[14px]"
                  >
                    {isSavingPassword ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    更新密码
                  </Button>
                  {passwordMessage && (
                    <span className={`text-[13px] font-medium ${passwordMessage.type === "success" ? "text-green-500 dark:text-green-400" : "text-destructive"}`}>
                      {passwordMessage.text}
                    </span>
                  )}
                </div>
              </div>
            </section>

             <section className={`rounded-[1.5rem] border p-8 transition-all ${dark ? "bg-[#1A1D1E] border-white/5 shadow-[0_8px_30px_rgba(0,0,0,0.15)]" : "bg-white border-[#E2E8F0] shadow-md"}`}>
              <div className="mb-8">
                <h2 className={`text-lg font-bold tracking-tight text-[#ff5a5f] mb-2`}>危险操作</h2>
                <p className={`text-[13px] ${dark ? "text-[#97ada8]" : "text-[#7a6a5c]"}`}>涉及账号登录状态的管理</p>
              </div>

              <div>
                <LogoutButton locale={locale} />
              </div>
            </section>
          </div>
        )}

        {/* PREFERENCES TAB */}
        {activeTab === "preferences" && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
             <section className={`rounded-[1.5rem] border p-8 transition-all ${dark ? "bg-[#1A1D1E] border-white/5 shadow-[0_8px_30px_rgba(0,0,0,0.15)]" : "bg-white border-[#E2E8F0] shadow-md"}`}>
              <div className="mb-8">
                <h2 className={`text-lg font-bold tracking-tight mb-2 ${dark ? "text-white" : "text-black"}`}>外观设置</h2>
                <p className={`text-[13px] ${dark ? "text-[#97ada8]" : "text-[#7a6a5c]"}`}>切换应用的色彩模式</p>
              </div>

              <div className={`border rounded-xl p-5 flex items-center justify-between ${dark ? "border-white/10" : "border-[#E2E8F0]"}`}>
                <div>
                  <h3 className={`text-[15px] font-bold mb-1.5 ${dark ? "text-white" : "text-black"}`}>色彩主题</h3>
                  <p className={`text-[13px] ${dark ? "text-[#97ada8]" : "text-[#7a6a5c]"}`}>自动适应系统，或手动指定亮/暗色</p>
                </div>

                <div className={`flex items-center gap-1 border rounded-xl p-1 ${dark ? "bg-white/[0.03] border-white/10" : "bg-black/5 border-black/5"}`}>
                  <button 
                    onClick={() => applyWorkspaceMode("system")}
                    className={`p-2 rounded-lg transition-colors ${themeMode === "system" ? (dark ? "bg-white text-black shadow-sm" : "bg-white text-black shadow-md") : (dark ? "text-[#97ada8] hover:text-white hover:bg-white/5" : "text-[#7a6a5c] hover:text-black hover:bg-white/50")}`}
                    title="跟随系统"
                  >
                    <Monitor className="w-[15px] h-[15px]" />
                  </button>
                  <button 
                    onClick={() => applyWorkspaceMode("light")}
                    className={`p-2 rounded-lg transition-colors ${themeMode === "light" ? (dark ? "bg-white text-black shadow-sm" : "bg-white text-black shadow-md") : (dark ? "text-[#97ada8] hover:text-white hover:bg-white/5" : "text-[#7a6a5c] hover:text-black hover:bg-white/50")}`}
                    title="亮色模式"
                  >
                    <Sun className="w-[15px] h-[15px]" />
                  </button>
                  <button 
                    onClick={() => applyWorkspaceMode("dark")}
                    className={`p-2 rounded-lg transition-colors ${themeMode === "dark" ? (dark ? "bg-white text-black shadow-sm" : "bg-white text-black shadow-md") : (dark ? "text-[#97ada8] hover:text-white hover:bg-white/5" : "text-[#7a6a5c] hover:text-black hover:bg-white/50")}`}
                    title="暗色模式"
                  >
                    <Moon className="w-[15px] h-[15px]" />
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
