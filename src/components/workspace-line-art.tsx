"use client";

import type { CSSProperties, ReactNode } from "react";

export type WorkspaceTone = "light" | "dark";

type Palette = {
  ink: string;
  inkSoft: string;
  line: string;
  lineSoft: string;
  shell: string;
  shellEdge: string;
  shellGlow: string;
};

const PALETTE: Record<WorkspaceTone, Palette> = {
  light: {
    ink: "#8a5a3c",
    inkSoft: "rgba(138, 90, 60, 0.42)",
    line: "rgba(122, 88, 63, 0.58)",
    lineSoft: "rgba(122, 88, 63, 0.12)",
    shell: "rgba(255, 255, 255, 0.5)",
    shellEdge: "rgba(222, 208, 194, 0.72)",
    shellGlow: "rgba(138, 90, 60, 0.06)",
  },
  dark: {
    ink: "#48f9db",
    inkSoft: "rgba(72, 249, 219, 0.44)",
    line: "rgba(72, 249, 219, 0.62)",
    lineSoft: "rgba(72, 249, 219, 0.12)",
    shell: "rgba(18, 22, 22, 0.34)",
    shellEdge: "rgba(154, 225, 214, 0.16)",
    shellGlow: "rgba(0, 0, 0, 0.24)",
  },
};

function getPalette(tone: WorkspaceTone) {
  return PALETTE[tone];
}

type GlyphProps = {
  tone?: WorkspaceTone;
  className?: string;
  title?: string;
};

function GlyphSurface({
  tone = "dark",
  className = "",
  title,
  children,
  viewBox = "0 0 240 240",
}: GlyphProps & { children: ReactNode; viewBox?: string }) {
  const palette = getPalette(tone);

  return (
    <svg
      viewBox={viewBox}
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={`workspace-line-${tone}-fade`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={palette.line} />
          <stop offset="100%" stopColor={palette.inkSoft} />
        </linearGradient>
      </defs>
      {children}
    </svg>
  );
}

export function LayerStackGlyph({
  tone = "dark",
  className = "",
  title = "Layer stack glyph",
}: GlyphProps) {
  const palette = getPalette(tone);

  return (
    <GlyphSurface tone={tone} className={className} title={title}>
      <g stroke={palette.line} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M54 72 L120 34 L186 72 L120 110 Z" />
        <path d="M60 110 L120 76 L180 110 L120 144 Z" opacity="0.5" />
      </g>
      <path d="M102 62 H138" stroke={palette.lineSoft} strokeWidth="1.1" strokeLinecap="round" />
    </GlyphSurface>
  );
}

export function CubeArrayGlyph({
  tone = "dark",
  className = "",
  title = "Cube array glyph",
}: GlyphProps) {
  const palette = getPalette(tone);
  const cubes = [
    { x: 72, y: 92 },
    { x: 128, y: 70 },
  ];

  return (
    <GlyphSurface tone={tone} className={className} title={title}>
      {cubes.map((cube, index) => (
        <g key={`${cube.x}-${cube.y}-${index}`} transform={`translate(${cube.x} ${cube.y})`}>
          <path d="M0 18 L22 6 L44 18 L22 30 Z" stroke={palette.line} strokeWidth="1.25" strokeLinejoin="round" />
          <path d="M0 18 V48 L22 60 V30 Z" stroke={palette.line} strokeWidth="1.25" strokeLinejoin="round" />
          <path d="M44 18 V48 L22 60" stroke={palette.line} strokeWidth="1.25" strokeLinejoin="round" />
        </g>
      ))}
      <path d="M102 152 C122 146, 138 132, 160 120" stroke={palette.lineSoft} strokeWidth="1.02" opacity="0.42" />
    </GlyphSurface>
  );
}

export function SpeedStairsGlyph({
  tone = "dark",
  className = "",
  title = "Speed stairs glyph",
}: GlyphProps) {
  const palette = getPalette(tone);
  const steps = [
    [56, 172, 106, 158],
    [108, 126, 166, 110],
  ];

  return (
    <GlyphSurface tone={tone} className={className} title={title}>
      {steps.map(([x1, y1, x2, y2], index) => (
        <path
          key={`step-${index}`}
          d={`M${x1} ${y1} H${x2} V${y2}`}
          stroke={palette.line}
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={1 - index * 0.12}
        />
      ))}
      <path d="M66 182 C104 152, 136 130, 188 84" stroke={palette.lineSoft} strokeWidth="1.02" strokeLinecap="round" />
    </GlyphSurface>
  );
}

export function SignatureOrbitGlyph({
  tone = "dark",
  className = "",
  title = "Signature orbit glyph",
}: GlyphProps) {
  const palette = getPalette(tone);

  return (
    <GlyphSurface tone={tone} className={className} title={title} viewBox="0 0 260 260">
      <g stroke={palette.line} strokeWidth="1.05" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="130" cy="130" r="54" />
        <path d="M102 154 C118 138, 132 126, 158 108" opacity="0.58" />
      </g>
    </GlyphSurface>
  );
}

type FrostedStackShellProps = {
  tone?: WorkspaceTone;
  className?: string;
  children?: ReactNode;
  inset?: boolean;
};

export function FrostedStackShell({
  tone = "dark",
  className = "",
  children,
  inset = false,
}: FrostedStackShellProps) {
  const palette = getPalette(tone);

  const style: CSSProperties = {
    borderColor: palette.shellEdge,
    background: `linear-gradient(180deg, ${palette.shell}, rgba(255, 255, 255, 0.04))`,
    boxShadow: inset ? `inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 22px ${palette.shellGlow}` : `0 16px 36px ${palette.shellGlow}`,
    backdropFilter: "blur(22px) saturate(145%)",
    WebkitBackdropFilter: "blur(22px) saturate(145%)",
  };

  return (
    <div className={`relative overflow-hidden rounded-[1.75rem] border ${className}`} style={style}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            tone === "dark"
              ? "radial-gradient(circle at 18% 18%, rgba(255,255,255,0.06), transparent 20%), radial-gradient(circle at 82% 0%, rgba(72, 249, 219, 0.08), transparent 26%)"
              : "radial-gradient(circle at 18% 18%, rgba(255, 255, 255, 0.82), transparent 18%), radial-gradient(circle at 82% 0%, rgba(255, 244, 229, 0.7), transparent 24%)",
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

type StackItem = {
  label: string;
  value?: string;
};

export function FrostedStackDeck({
  tone = "dark",
  className = "",
  items = [],
}: FrostedStackShellProps & { items?: StackItem[] }) {
  const palette = getPalette(tone);

  return (
    <FrostedStackShell tone={tone} className={className}>
      <div className="space-y-3 p-5">
        {items.map((item, index) => (
          <div
            key={`${item.label}-${index}`}
            className="flex items-center justify-between rounded-[1.15rem] border px-4 py-3"
            style={{
              borderColor: palette.shellEdge,
              background: tone === "dark" ? "rgba(255,255,255,0.035)" : "rgba(255,252,247,0.78)",
            }}
          >
            <span className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: palette.inkSoft }}>
              {item.label}
            </span>
            {item.value ? (
              <span className="text-sm font-semibold" style={{ color: palette.ink }}>
                {item.value}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </FrostedStackShell>
  );
}

type WorkspaceLineGlyphProps = GlyphProps & {
  variant?: "stack" | "velocity" | "cluster" | "signal";
};

export function WorkspaceLineGlyph({
  variant = "stack",
  tone = "dark",
  className = "",
  title,
}: WorkspaceLineGlyphProps) {
  if (variant === "velocity") {
    return <SpeedStairsGlyph tone={tone} className={className} title={title || "Velocity glyph"} />;
  }

  if (variant === "cluster") {
    return <CubeArrayGlyph tone={tone} className={className} title={title || "Cluster glyph"} />;
  }

  if (variant === "signal") {
    return <SignatureOrbitGlyph tone={tone} className={className} title={title || "Signal glyph"} />;
  }

  return <LayerStackGlyph tone={tone} className={className} title={title || "Stack glyph"} />;
}

type WorkspaceFloatingMetricProps = {
  tone?: WorkspaceTone;
  code: string;
  label: string;
  value: string;
  note?: string;
  className?: string;
};

export function WorkspaceFloatingMetric({
  tone = "dark",
  code,
  label,
  value,
  note,
  className = "",
}: WorkspaceFloatingMetricProps) {
  const palette = getPalette(tone);

  return (
    <div
      className={`rounded-[0.9rem] border px-3 py-2.5 backdrop-blur-md ${className}`}
      style={{
        borderColor: palette.shellEdge,
        background: tone === "dark" ? "rgba(255,255,255,0.018)" : "rgba(255,252,247,0.7)",
        boxShadow: `0 6px 14px ${palette.shellGlow}`,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-[9px] font-black uppercase tracking-[0.22em]" style={{ color: palette.inkSoft }}>
          {code}
        </p>
        <p className="truncate text-[14px] font-semibold" style={{ color: palette.ink }}>
          {value}
        </p>
      </div>
      <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: palette.inkSoft }}>
        {label}
      </p>
      {note ? (
        <p className="mt-1 truncate text-[11px]" style={{ color: palette.inkSoft }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

type WorkspaceLayeredPanelProps = {
  tone?: WorkspaceTone;
  art: ReactNode;
  floating?: ReactNode;
  bodyClassName?: string;
  children: ReactNode;
};

export function WorkspaceLayeredPanel({
  tone = "dark",
  art,
  floating,
  bodyClassName = "",
  children,
}: WorkspaceLayeredPanelProps) {
  const palette = getPalette(tone);

  return (
    <FrostedStackShell tone={tone} className="p-0">
      <div
        className="relative overflow-hidden rounded-[2rem] border backdrop-blur-lg"
        style={{
          borderColor: palette.shellEdge,
          background:
            tone === "dark"
              ? "linear-gradient(180deg, rgba(18,22,22,0.72), rgba(10,12,12,0.48))"
              : "linear-gradient(180deg, rgba(255,255,255,0.72), rgba(245,237,228,0.52))",
          boxShadow: `0 16px 34px ${palette.shellGlow}`,
        }}
      >
        <div className="pointer-events-none absolute right-5 top-5 hidden h-20 w-20 md:block" style={{ opacity: tone === "dark" ? 0.16 : 0.12 }}>
          {art}
        </div>
        <div className={`relative min-w-0 ${bodyClassName}`}>{children}</div>
        {floating ? (
          <div className="relative flex flex-wrap gap-3 border-t px-6 pb-5 pt-4" style={{ borderColor: palette.shellEdge }}>
            {floating}
          </div>
        ) : null}
      </div>
    </FrostedStackShell>
  );
}

export const WorkspaceLineArt = {
  LayerStackGlyph,
  CubeArrayGlyph,
  SpeedStairsGlyph,
  SignatureOrbitGlyph,
  FrostedStackShell,
  FrostedStackDeck,
  WorkspaceLineGlyph,
  WorkspaceFloatingMetric,
  WorkspaceLayeredPanel,
};
