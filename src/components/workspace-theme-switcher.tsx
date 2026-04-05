"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, SunMedium } from "lucide-react";

const STORAGE_KEY = "kemo-ui-mode";
const THEME_CHANGE_EVENT = "kemo-ui-mode-change";
type WorkspaceUiMode = "system" | "light" | "dark";

const MODES: Array<{
  id: WorkspaceUiMode;
  label: string;
  icon: typeof Monitor;
}> = [
  { id: "system", label: "系统", icon: Monitor },
  { id: "light", label: "浅色", icon: SunMedium },
  { id: "dark", label: "深色", icon: Moon },
];

function applyWorkspaceMode(mode: WorkspaceUiMode) {
  if (mode === "system") {
    window.localStorage.setItem(STORAGE_KEY, "system");
    delete document.documentElement.dataset.workspaceTheme;
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    }
  } else {
    window.localStorage.setItem(STORAGE_KEY, mode);
    document.documentElement.dataset.workspaceTheme = mode;
    if (mode === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    }
  }

  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

function getWorkspaceModeSnapshot() {
  if (typeof window === "undefined") {
    return "system" as WorkspaceUiMode;
  }

  const storedMode = window.localStorage.getItem(STORAGE_KEY);
  if (storedMode === "dark" || storedMode === "light" || storedMode === "system") {
    return storedMode;
  }

  return "system";
}

function subscribeToWorkspaceModeChange(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
  };
}

export function WorkspaceThemeSwitcher() {
  const mode = useSyncExternalStore(
    subscribeToWorkspaceModeChange,
    getWorkspaceModeSnapshot,
    () => "system"
  );

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
