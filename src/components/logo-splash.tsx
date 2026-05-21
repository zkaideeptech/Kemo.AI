"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function LogoSplash({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const isWorkspaceRoute = /\/app(\/|$)/.test(pathname || "");

  useEffect(() => {
    const storedMode = window.localStorage.getItem("kemo-ui-mode");
    if (storedMode === "dark" || storedMode === "light") {
      document.documentElement.dataset.workspaceTheme = storedMode;
    } else {
      delete document.documentElement.dataset.workspaceTheme;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (isWorkspaceRoute) {
    return <>{children}</>;
  }

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
