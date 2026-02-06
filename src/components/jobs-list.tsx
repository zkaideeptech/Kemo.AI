"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useJobRealtime } from "@/hooks/useJobRealtime";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>{t("job.status")}</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((job) => (
          <TableRow key={job.id}>
            <TableCell>
              <Link
                href={`/${locale}/app/jobs/${job.id}`}
                className="font-medium hover:underline"
              >
                {job.title || `Job ${job.id.slice(0, 6)}`}
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{job.status}</Badge>
            </TableCell>
            <TableCell>{new Date(job.created_at).toLocaleString()}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

