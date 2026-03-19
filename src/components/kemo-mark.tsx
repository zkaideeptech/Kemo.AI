"use client";

export function KemoMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9 6.5h14A2.5 2.5 0 0 1 25.5 9v14A2.5 2.5 0 0 1 23 25.5H9A2.5 2.5 0 0 1 6.5 23V9A2.5 2.5 0 0 1 9 6.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M11.5 9.5v13" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M11.5 16l8.8-6.8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.5 16l8.8 6.8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
