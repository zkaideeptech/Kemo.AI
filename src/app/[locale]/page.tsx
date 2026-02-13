import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function HomePage() {
  const t = await getTranslations();
  const locale = await getLocale();

  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
        <div className="text-center space-y-4">
          <h1 className="text-6xl font-black tracking-tighter neon-glow mb-2">
            {t("appName")}
          </h1>
          <p className="text-xl text-muted-foreground font-medium max-w-lg mx-auto leading-relaxed">
            {t("appDescription") || "Interview audio to transcript, IC memo, and WeChat article."}
          </p>
        </div>

        <Card className="glass border-white/5 overflow-hidden shadow-2xl">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">
              {t("home.getStarted") || "Get Started"}
            </CardTitle>
            <CardDescription className="text-base">
              {t("home.description") || "Choose an action to begin your workflow."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4 p-8 pt-4">
            <Button asChild size="lg" className="flex-1 neon-button text-lg font-bold">
              <Link href={`/${locale}/app/new`}>
                <span className="flex items-center gap-2">
                  {t("nav.newJob")}
                </span>
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg" className="flex-1 border-white/10 hover:bg-white/5 text-lg font-semibold transition-all">
              <Link href={`/${locale}/app/jobs`}>{t("nav.jobs")}</Link>
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { label: "Audio -> Text", icon: "🎙️" },
            { label: "IC Memo", icon: "📝" },
            { label: "WeChat Art", icon: "🌐" }
          ].map((item, i) => (
            <div key={i} className="p-4 glass rounded-2xl border-white/5 hover:border-primary/20 transition-all cursor-default">
              <div className="text-2xl mb-1">{item.icon}</div>
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
