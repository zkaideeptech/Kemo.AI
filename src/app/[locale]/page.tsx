import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function HomePage() {
  const t = await getTranslations();
  const locale = await getLocale();

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("appName")}</CardTitle>
          <CardDescription>
            Interview audio to transcript, IC memo, and WeChat article.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href={`/${locale}/app/new`}>{t("nav.newJob")}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/${locale}/app/jobs`}>{t("nav.jobs")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
