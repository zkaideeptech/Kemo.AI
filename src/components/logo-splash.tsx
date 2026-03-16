"use client";

import { useEffect, useState } from "react";

export function LogoSplash({ children }: { children: React.ReactNode }) {
  const [showContent, setShowContent] = useState(false);
  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    const storedMode = window.localStorage.getItem("kemo-ui-mode");
    if (storedMode === "dark" || storedMode === "light") {
      document.documentElement.dataset.workspaceTheme = storedMode;
    } else {
      delete document.documentElement.dataset.workspaceTheme;
    }

    const timer = setTimeout(() => {
      setShowContent(true);
    }, 1500);

    const completeTimer = setTimeout(() => {
      setIsAnimating(false);
    }, 4000);

    return () => {
      clearTimeout(timer);
      clearTimeout(completeTimer);
    };
  }, []);

  if (!isAnimating) return <>{children}</>;

  return (
    <div className="relative min-h-screen">
      <div className={showContent ? "animate-content-fade-in" : "opacity-0"}>
        {children}
      </div>

      <div className="splash-root">
        <div
          className={`splash-panel splash-panel-left ${showContent ? "animate-shutter-left" : ""}`}
        />
        <div
          className={`splash-panel splash-panel-right ${showContent ? "animate-shutter-right" : ""}`}
        />

        <div className="splash-center animate-logo-reveal">
          <div className="splash-brand-mark">K</div>
          <div className="splash-brand-copy">
            <p className="splash-wordmark">KEMO NOTEBOOK</p>
            <p className="splash-subtitle">Interview workspace for scripts, insights, and sources.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
