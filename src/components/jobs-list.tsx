"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useJobRealtime } from "@/hooks/useJobRealtime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type JobRow = {
  id: string;
  title: string | null;
  status: string;
  created_at: string;
};

export function JobsList({
  initialJobs,
  userId,
  locale,
}: {
  initialJobs: JobRow[];
  userId: string;
  locale: string;
}) {
  const t = useTranslations();
  const [jobs, setJobs] = useState<JobRow[]>(initialJobs);

  const refetch = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase
      .from("jobs")
      .select("id,title,status,created_at")
      .order("created_at", { ascending: false });
    setJobs(data || []);
  }, []);

  useJobRealtime({ userId, onChange: refetch });

  if (!jobs.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <h3 className="text-lg font-semibold">{t("jobs.emptyTitle")}</h3>
        <p className="mt-2 text-sm text-muted">{t("jobs.emptyBody")}</p>
        <Button asChild className="mt-4">
          <Link href={`/${locale}/app/new`}>{t("jobs.createCta")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {jobs.map((job) => (
        <Link
          key={job.id}
          href={`/${locale}/app/jobs/${job.id}`}
          className="group relative block"
        >
          <div className="relative h-full overflow-hidden rounded-xl border border-border/40 bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] hover:shadow-primary/10">
            <div className="flex items-center justify-between mb-4">
              <Badge
                variant="secondary"
                className={`px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-colors duration-300
                  ${job.status === 'completed' ? 'bg-primary/10 text-green-700 group-hover:bg-primary group-hover:text-primary-foreground' : ''}
                  ${job.status === 'processing' ? 'bg-blue-50 text-blue-700 animate-pulse' : ''}
                  ${job.status === 'failed' ? 'bg-red-50 text-red-700' : ''}
                `}
              >
                {job.status}
              </Badge>
              <span className="text-xs text-muted-foreground/60 font-mono">
                {new Date(job.created_at).toLocaleDateString()}
              </span>
            </div>

            <h3 className="text-lg font-bold tracking-tight text-foreground group-hover:text-primary transition-colors duration-200 line-clamp-2 mb-2">
              {job.title || `Untitled Job`}
            </h3>

            <p className="text-xs text-muted-foreground font-mono opacity-50 truncate">
              ID: {job.id}
            </p>

            <div className="absolute inset-0 border-2 border-primary/0 rounded-xl transition-all duration-300 group-hover:border-primary/10 pointer-events-none"></div>
          </div>
        </Link>
      ))}
    </div>
  );
}

