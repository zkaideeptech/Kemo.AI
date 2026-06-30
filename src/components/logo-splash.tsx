"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function LogoSplash({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isWorkspaceRoute = /\/app(\/|$)/.test(pathname || "");

  useEffect(() => {
    const storedMode = window.localStorage.getItem("kemo-ui-mode");
    if (storedMode === "dark" || storedMode === "light") {
      document.documentElement.dataset.workspaceTheme = storedMode;
    } else {
      delete document.documentElement.dataset.workspaceTheme;
    }
  }, []);

  if (isWorkspaceRoute) {
    return <>{children}</>;
  }

  return <>{children}</>;
}
