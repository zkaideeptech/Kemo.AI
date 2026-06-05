# Kemo.AI VI System

Last updated: 2026-06-06

## Brand Direction

Kemo.AI uses a calm research-workbench identity: deep ink surfaces, paper-white document space, precise electric-blue signal geometry, and small emerald status accents. The visual language should feel analytical, editorial, and production SaaS, not neon AI demo.

## Assets

| Asset | Path | Use |
| --- | --- | --- |
| App mark | `/public/brand/kemo-mark.svg` | Sidebar, favicon, compact brand positions. |
| Wordmark lockup | `/public/brand/kemo-wordmark.svg` | Brand decks, docs, previews. |
| Key visual | `/public/brand/kemo-key-visual.png` | Subtle product background, Open Graph, brand boards. |
| Public logo | `/public/kemo-logo.svg` | External static references. |
| App icon | `/src/app/icon.svg` | Next.js app icon. |

## Color Tokens

| Token | Hex | Role |
| --- | --- | --- |
| Ink 900 | `#000610` | Deep app background. |
| Ink 950 | `#000320` | Brand mark base. |
| Paper | `#F8F9FA` | Main document surface. |
| Slate line | `#E2E8F0` | Borders and dividers. |
| Signal blue | `#3838FF` | Primary brand action. |
| Sky signal | `#4FACFF` | Highlight and graph nodes. |
| Success signal | `#10B981` | Ready and operational state. |

## Usage Rules

- Use the SVG mark for small UI surfaces; do not crop the generated key visual into a logo.
- Keep `Kemo.AI` text as real text in code or SVG wordmark, not generated-image text.
- Avoid the old neon-green identity unless needed for historical comparison.
- Use the key visual at low opacity behind workbench surfaces; never place body text directly over the busy center of the image.
- Keep icon corners at 8px to 12px radius in product UI unless the platform requires a full squircle.

