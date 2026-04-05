"use client";

import { Loader2 } from "lucide-react";

export function LoadingScreen() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50/50 dark:bg-[#0a0a0b]/80 backdrop-blur-sm transition-all duration-500 fade-in animate-in">
      <div className="flex flex-col items-center gap-4">
        {/* \u4e00\u4e2a\u7b80\u7ea6\u7684\u547c\u5438\u5708 \u6216 \u73af\u5f62 icon */}
        <div className="relative flex items-center justify-center h-12 w-12">
          <div className="absolute inset-0 rounded-full border border-slate-200 dark:border-white/10" />
          <Loader2 className="h-6 w-6 text-slate-800 dark:text-white animate-spin" />
        </div>
        <p className="text-sm font-medium tracking-tight text-slate-500 dark:text-slate-400 animate-pulse">
          {"\u52a0\u8f7d\u4e2d..."}
        </p>
      </div>
    </div>
  );
}
