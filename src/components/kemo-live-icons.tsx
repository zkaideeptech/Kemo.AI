"use client";

import type { ReactNode, SVGProps } from "react";

export type KemoLiveIconName =
  | "audio"
  | "check"
  | "chevron-down"
  | "close"
  | "coach"
  | "copy"
  | "edit"
  | "external"
  | "link"
  | "meeting"
  | "mic"
  | "more"
  | "notebook"
  | "people"
  | "process"
  | "search"
  | "send"
  | "settings"
  | "star"
  | "stop"
  | "tab";

type KemoLiveIconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: KemoLiveIconName;
  title?: string;
};

function iconPath(name: KemoLiveIconName): ReactNode {
  switch (name) {
    case "audio":
      return (
        <>
          <path d="M5.5 10.2v3.6M9 7.6v8.8M12.5 5.8v12.4M16 8.4v7.2M19.5 10.8v2.4" />
          <path d="M3.8 18.8h16.4" opacity="0.28" />
        </>
      );
    case "check":
      return <path d="m5 12.4 4.1 4.1L19.5 6.2" />;
    case "chevron-down":
      return <path d="m6.2 9.2 5.8 5.6 5.8-5.6" />;
    case "close":
      return (
        <>
          <path d="m7.1 7.1 9.8 9.8" />
          <path d="m16.9 7.1-9.8 9.8" />
        </>
      );
    case "coach":
      return (
        <>
          <path d="M8.1 14.8c-1.4-1.1-2.3-2.7-2.3-4.6 0-3.3 2.7-5.8 6.2-5.8s6.2 2.5 6.2 5.8c0 1.9-.9 3.6-2.4 4.7-.8.6-1.2 1.4-1.3 2.3H9.4c-.1-1-.5-1.8-1.3-2.4Z" />
          <path d="M9.4 20h5.2" />
          <path d="M9.8 10.7h4.4M12 8.5v4.4" opacity="0.55" />
        </>
      );
    case "copy":
      return (
        <>
          <path d="M8.2 7.1h8.7v10.8H8.2z" />
          <path d="M5.1 14.7V4.9h8.1" opacity="0.5" />
          <path d="M10.5 10.6h4.2M10.5 13.4h3.2" opacity="0.45" />
        </>
      );
    case "edit":
      return (
        <>
          <path d="M5.2 18.8 6 14.5 15.2 5.3c1-.9 2.4-.9 3.3 0 .9 1 .9 2.4 0 3.3L9.3 17.8l-4.1 1Z" />
          <path d="m13.8 6.8 3.4 3.4" opacity="0.55" />
        </>
      );
    case "external":
      return (
        <>
          <path d="M7 7.8H5.8c-1 0-1.8.8-1.8 1.8v8.6c0 1 .8 1.8 1.8 1.8h8.6c1 0 1.8-.8 1.8-1.8V17" />
          <path d="M11 4h9v9" />
          <path d="m10.2 13.8 9.1-9.1" />
        </>
      );
    case "link":
      return (
        <>
          <path d="M9.3 14.7 8 16c-1.7 1.7-4.4 1.7-6.1 0s-1.7-4.4 0-6.1l2-2c1.5-1.5 3.8-1.7 5.5-.5" />
          <path d="m14.7 9.3 1.3-1.3c1.7-1.7 4.4-1.7 6.1 0s1.7 4.4 0 6.1l-2 2c-1.5 1.5-3.8 1.7-5.5.5" />
          <path d="m8.5 15.5 7-7" />
        </>
      );
    case "meeting":
      return (
        <>
          <path d="M4.5 7.2c0-1.1.9-2 2-2h11c1.1 0 2 .9 2 2v8.6c0 1.1-.9 2-2 2H9l-4.5 2.7V7.2Z" />
          <path d="M8.1 9.6h7.8M8.1 12.4h5.5" opacity="0.48" />
        </>
      );
    case "mic":
      return (
        <>
          <path d="M12 14.7c1.7 0 3-1.3 3-3V6.4c0-1.7-1.3-3-3-3S9 4.7 9 6.4v5.3c0 1.7 1.3 3 3 3Z" />
          <path d="M5.8 11.4c0 3.4 2.6 6.1 6.2 6.1s6.2-2.7 6.2-6.1M12 17.5v3.2" />
        </>
      );
    case "more":
      return (
        <>
          <path d="M5.2 12h.1M12 12h.1M18.8 12h.1" />
          <path d="M4.2 12a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 0 0-2.2 0ZM10.9 12a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 0 0-2.2 0ZM17.6 12a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 0 0-2.2 0Z" fill="currentColor" stroke="none" />
        </>
      );
    case "notebook":
      return (
        <>
          <path d="M7.4 4.2h10.2c1 0 1.8.8 1.8 1.8v12c0 1-.8 1.8-1.8 1.8H7.4c-1 0-1.8-.8-1.8-1.8V6c0-1 .8-1.8 1.8-1.8Z" />
          <path d="M9 4.2v15.6M12 8h4.2M12 11.2h3.2M12 14.4h4.2" opacity="0.45" />
          <path d="M4.2 8.2h2.5M4.2 12h2.5M4.2 15.8h2.5" />
        </>
      );
    case "people":
      return (
        <>
          <path d="M9.2 11.3a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2ZM4.2 19c.6-2.8 2.4-4.5 5-4.5s4.4 1.7 5 4.5" />
          <path d="M16.2 11.1a2.5 2.5 0 1 0-.7-4.9M14.8 14.8c2.3.2 3.8 1.7 4.4 4" opacity="0.52" />
        </>
      );
    case "process":
      return (
        <>
          <path d="M12 3.7 14 10l6.3 2-6.3 2-2 6.3-2-6.3-6.3-2 6.3-2 2-6.3Z" fill="currentColor" fillOpacity="0.13" />
          <path d="M12 3.7 14 10l6.3 2-6.3 2-2 6.3-2-6.3-6.3-2 6.3-2 2-6.3Z" />
          <path d="M18.2 4.1v3.2M16.6 5.7h3.2M5.8 16.7v2.8M4.4 18.1h2.8" opacity="0.55" />
        </>
      );
    case "search":
      return (
        <>
          <path d="M10.8 17.1a6.2 6.2 0 1 0 0-12.4 6.2 6.2 0 0 0 0 12.4Z" />
          <path d="m15.4 15.4 4.1 4.1" />
          <path d="M8.4 9.1c.5-.8 1.3-1.3 2.4-1.3" opacity="0.38" />
        </>
      );
    case "send":
      return (
        <>
          <path d="M4 12.4 19.8 4 16 20l-4.1-6.1L4 12.4Z" />
          <path d="m11.8 13.9 3.8-5" opacity="0.5" />
        </>
      );
    case "settings":
      return (
        <>
          <path d="M5.5 7.2h13M5.5 16.8h13" opacity="0.45" />
          <path d="M9 7.2a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM12.5 16.8a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />
        </>
      );
    case "star":
      return <path d="m12 3.8 2.4 5 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8L12 3.8Z" />;
    case "stop":
      return <path d="M7.2 7.2h9.6v9.6H7.2z" fill="currentColor" fillOpacity="0.14" />;
    case "tab":
      return (
        <>
          <path d="M4.2 6.5c0-1 .8-1.8 1.8-1.8h12c1 0 1.8.8 1.8 1.8v10.8c0 1-.8 1.8-1.8 1.8H6c-1 0-1.8-.8-1.8-1.8V6.5Z" />
          <path d="M4.8 8.6h14.4M8.2 6.6h.1M11 6.6h.1" opacity="0.5" />
        </>
      );
    default:
      return null;
  }
}

export function KemoLiveIcon({ name, title, className, ...props }: KemoLiveIconProps) {
  const mergedClassName = ["kemo-live-icon", className].filter(Boolean).join(" ");

  return (
    <svg
      aria-hidden={title ? undefined : true}
      className={mergedClassName}
      fill="none"
      focusable="false"
      role={title ? "img" : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {iconPath(name)}
    </svg>
  );
}
