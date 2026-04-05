"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [activeTab, setActiveTab] = useState("dashboard");

  // Profile Form States
  const [fullName, setFullName] = useState(user.fullName);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Security Form States
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
      alert("个人资料更新成功");
      router.refresh();
    } catch (error: any) {
      alert("更新失败: " + error.message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingAvatar(true);
      const fileExt = file.name.split(".").pop();
      const filePath = `${user.id}/${Math.random()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
      setAvatarUrl(data.publicUrl);
    } catch (error: any) {
      alert("头像上传失败: " + error.message + " (请确保已执行 avatars bucket 的 SQL 脚本)");
    } finally {
      setIsUploadingAvatar(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleUpdatePassword = async () => {
    if (!password) return;
    if (password !== confirmPassword) {
      return alert("两次输入的密码不一致");
    }
    
    try {
      setIsSavingPassword(true);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      alert("密码修改成功");
      setPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      alert("密码修改失败: " + error.message);
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleSignOut = async () => {
    if (!window.confirm("确定要退出登录吗？")) return;
    await supabase.auth.signOut();
    window.location.href = `/${locale}/login`;
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full max-w-[500px] grid-cols-4 mb-8">
        <TabsTrigger value="dashboard" className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4" /> 仪表盘
        </TabsTrigger>
        <TabsTrigger value="profile" className="flex items-center gap-2">
          <User className="w-4 h-4" /> 资料
        </TabsTrigger>
        <TabsTrigger value="security" className="flex items-center gap-2">
          <Key className="w-4 h-4" /> 安全
        </TabsTrigger>
        <TabsTrigger value="appearance" className="flex items-center gap-2">
          <Palette className="w-4 h-4" /> 偏好
        </TabsTrigger>
      </TabsList>

      {/* DASHBOARD TAB */}
      <TabsContent value="dashboard" className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>当月转写时长</CardDescription>
              <CardTitle className="text-4xl text-primary">{stats.minutesUsed ?? 0} <span className="text-sm font-normal text-muted-foreground">分钟</span></CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>当月转写任务</CardDescription>
              <CardTitle className="text-4xl text-primary">{stats.filesUsed ?? 0} <span className="text-sm font-normal text-muted-foreground">个</span></CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>历史总录音数</CardDescription>
              <CardTitle className="text-4xl text-primary">{stats.jobCount ?? 0} <span className="text-sm font-normal text-muted-foreground">个</span></CardTitle>
            </CardHeader>
          </Card>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>综合状态</CardTitle>
            <CardDescription>当前账户与配额详情</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">当前套餐</span>
              <span className="font-medium bg-primary/10 text-primary px-3 py-1 rounded-full text-xs">
                {plan.plan === "pro" ? "Pro 专业版" : "Free 免费版"}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">单文件上传上限</span>
              <span className="font-medium">{plan.maxFileSizeMb} MB</span>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* PROFILE TAB */}
      <TabsContent value="profile" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>个人资料</CardTitle>
            <CardDescription>更新你的显示信息与头像</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-6">
              <div className="relative group w-24 h-24 rounded-full overflow-hidden border border-border bg-muted flex items-center justify-center shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-10 h-10 text-slate-400" />
                )}
                <label className="absolute inset-0 bg-black/50 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  {isUploadingAvatar ? <Loader2 className="w-6 h-6 text-white animate-spin" /> : <Upload className="w-6 h-6 text-white" />}
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={isUploadingAvatar} />
                </label>
              </div>
              <div className="flex-1 space-y-1">
                <h3 className="font-medium text-sm">账户头像</h3>
                <p className="text-xs text-muted-foreground">推荐尺寸 256x256px，支持 JPG、PNG、WebP，最大 5MB</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>邮箱地址</Label>
              <Input value={user.email} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">登录邮箱当前不支持直接修改。</p>
            </div>

            <div className="space-y-2">
              <Label>用户名 (Display Name)</Label>
              <Input placeholder="输入你想展示的名字" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleUpdateProfile} disabled={isSavingProfile}>
              {isSavingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              保存更改
            </Button>
          </CardFooter>
        </Card>
      </TabsContent>

      {/* SECURITY TAB */}
      <TabsContent value="security" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>密码修改</CardTitle>
            <CardDescription>更新账户的安全密码</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>新密码</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>确认新密码</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleUpdatePassword} disabled={!password || isSavingPassword}>
              {isSavingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              更新密码
            </Button>
          </CardFooter>
        </Card>

        <Card className="border-red-500/20">
          <CardHeader>
            <CardTitle className="text-destructive">危险操作</CardTitle>
            <CardDescription>涉及账号登录状态的管理</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={handleSignOut} className="w-full sm:w-auto">
              <LogOut className="mr-2 h-4 w-4" /> 退出当前设备登录
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      {/* APPEARANCE TAB */}
      <TabsContent value="appearance" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>外观设置</CardTitle>
            <CardDescription>切换应用的色彩模式</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between p-4 border border-border rounded-xl">
              <div>
                <h4 className="font-medium">色彩主题</h4>
                <p className="text-sm text-muted-foreground mt-1">自动适应系统，或手动指定亮/暗色</p>
              </div>
              <WorkspaceThemeSwitcher />
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
