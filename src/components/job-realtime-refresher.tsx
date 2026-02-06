"use client";

import { useRouter } from "next/navigation";

import { useJobRealtime } from "@/hooks/useJobRealtime";

export function JobRealtimeRefresher({ userId }: { userId: string }) {
  const router = useRouter();

  useJobRealtime({
    userId,
    onChange: () => {
      router.refresh();
    },
  });

  return null;
}

