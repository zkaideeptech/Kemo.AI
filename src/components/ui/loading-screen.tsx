"use client";

import { Loader2 } from "lucide-react";

export function LoadingScreen() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/70" />
        <p className="text-sm text-muted-foreground">加载中</p>
      </div>
    </div>
  );
}
