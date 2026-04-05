"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, SunMedium } from "lucide-react";

export const STORAGE_KEY = "kemo-ui-mode";
export const THEME_CHANGE_EVENT = "kemo-ui-mode-change";
export type WorkspaceUiMode = "system" | "light" | "dark";
export type WorkspaceResolvedTheme = "light" | "dark";

const MODES: Array<{
  id: WorkspaceUiMode;
  label: string;
  icon: typeof Monitor;
}> = [
  { id: "system", label: "系统", icon: Monitor },
  { id: "light", label: "浅色", icon: SunMedium },
  { id: "dark", label: "深色", icon: Moon },
];

function getWorkspaceModeSnapshot() {
  if (typeof window === "undefined") {
    return "light" as WorkspaceUiMode;
  }

  const storedMode = window.localStorage.getItem(STORAGE_KEY);
  if (storedMode === "dark" || storedMode === "light" || storedMode === "system") {
    return storedMode;
  }

  return "light";
}

function resolveWorkspaceTheme(mode: WorkspaceUiMode): WorkspaceResolvedTheme {
  if (mode === "system") {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }
  return mode;
}

function setWorkspaceThemeDocument(resolvedTheme: WorkspaceResolvedTheme) {
  document.documentElement.dataset.workspaceTheme = resolvedTheme;
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  document.documentElement.classList.toggle("light", resolvedTheme === "light");
}

export function syncWorkspaceThemeDocument(mode = getWorkspaceModeSnapshot()) {
  if (typeof window === "undefined") {
    return "light" as WorkspaceResolvedTheme;
  }

  const resolvedTheme = resolveWorkspaceTheme(mode);
  setWorkspaceThemeDocument(resolvedTheme);
  return resolvedTheme;
}

export function applyWorkspaceMode(mode: WorkspaceUiMode) {
  window.localStorage.setItem(STORAGE_KEY, mode);
  syncWorkspaceThemeDocument(mode);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

function getWorkspaceResolvedThemeSnapshot() {
  return resolveWorkspaceTheme(getWorkspaceModeSnapshot());
}

function subscribeToWorkspaceModeChange(onStoreChange: () => void) {
  const handleStoreChange = () => {
    syncWorkspaceThemeDocument();
    onStoreChange();
  };
  const handleMediaChange = () => {
    if (getWorkspaceModeSnapshot() !== "system") {
      return;
    }

    syncWorkspaceThemeDocument("system");
    onStoreChange();
  };

  window.addEventListener("storage", handleStoreChange);
  window.addEventListener(THEME_CHANGE_EVENT, handleStoreChange);
  const mediaQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  mediaQuery?.addEventListener?.("change", handleMediaChange);
  mediaQuery?.addListener?.(handleMediaChange);

  return () => {
    window.removeEventListener("storage", handleStoreChange);
    window.removeEventListener(THEME_CHANGE_EVENT, handleStoreChange);
    mediaQuery?.removeEventListener?.("change", handleMediaChange);
    mediaQuery?.removeListener?.(handleMediaChange);
  };
}

export function useWorkspaceUiMode(): WorkspaceUiMode {
  return useSyncExternalStore<WorkspaceUiMode>(
    subscribeToWorkspaceModeChange,
    getWorkspaceModeSnapshot,
    () => "system"
  );
}

export function useWorkspaceResolvedTheme(): WorkspaceResolvedTheme {
  return useSyncExternalStore<WorkspaceResolvedTheme>(
    subscribeToWorkspaceModeChange,
    getWorkspaceResolvedThemeSnapshot,
    () => "light"
  );
}

export function WorkspaceThemeSwitcher() {
  const mode = useWorkspaceUiMode();

  useEffect(() => {
    syncWorkspaceThemeDocument(mode);
  }, [mode]);

  return (
    <div className="workspace-ui-switcher" aria-label="UI 切换">
      {MODES.map((item) => {
        const Icon = item.icon;
        const isActive = mode === item.id;

        return (
          <button
            key={item.id}
            type="button"
            className={`workspace-ui-switcher-button ${isActive ? "workspace-ui-switcher-button-active" : ""}`}
            aria-pressed={isActive}
            aria-label={item.label}
            title={item.label}
            onClick={() => {
              applyWorkspaceMode(item.id);
            }}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
