# Kemo Design Direction

## Aesthetic Name
Quiet Editorial Shell

## DFII
13/15

- Impact: 4
- Context fit: 5
- Feasibility: 4
- Performance safety: 5
- Consistency risk: 1

This direction is strong for Kemo because the product is a working research surface, not a marketing site. It should feel calm, concentrated, and lightly premium.

## Goal
Make every screen feel like a focused workspace with one obvious primary action. The UI should reduce visual noise, remove old-style dashboard heaviness, and let the user breathe.

## Differentiation Anchor
If the logo disappeared, the interface should still be recognizable by:

- a narrow left rail
- a large field of negative space
- one centered primary surface
- thin hairline borders
- a single serif headline against otherwise restrained sans-serif UI
- almost no decorative motion

## Current Diagnosis
The present UI feels busy because it overuses:

- equal-weight cards
- stacked panels inside panels
- strong border framing everywhere
- too many secondary actions competing with the primary action
- dashboard-style metrics on pages that should feel like working surfaces

The new design should stop treating every section like a card wall.

## Visual System

### Typography
- Headline / hero: a refined serif display face
- Body: a clean sans face already used in the app
- Mono: only for metadata, status, chips, and tiny labels

Rules:
- Use serif only where it creates calm emphasis
- Keep body text compact and readable
- Never use oversized tracking or loud letter spacing

### Color
Use a quiet paper-and-ink palette:

- Background: warm off-white, not beige-heavy
- Surface: white or near-white
- Text: near-black / ink
- Borders: very light gray
- Accent: one muted warm accent for primary actions and focus states

Rules:
- Do not let purple dominate the whole product
- Do not use gradients as the main visual language
- Accent color should be used sparingly

### Shape
- Radius stays small to medium
- Borders are thin and deliberate
- Shadows should be almost invisible
- Never use chunky floating cards or heavy elevation

### Motion
- Minimal and functional
- Use only small fades, subtle lifts, or state changes
- No ornamental pulsing, bouncing, or busy loaders

## Layout Rules

### Global Shell
- Left rail for navigation and project structure
- Center stage for the active task
- Right rail only for compact context, plan, and blockers
- On mobile, collapse rails into simple stacked sections or drawers

### Page Composition
- One screen should have one main story
- Secondary information should never compete with the main task
- Avoid 3x3 metric grids unless the page is genuinely analytic
- Keep most pages vertically calm and linear

### Spacing
- Use generous outer margins
- Keep interior spacing regular and predictable
- Let blank space act as a design element, not a failure to fill

## Component Rules

### Navigation
- Narrow, text-first nav
- Small icons only where they help scanning
- Active state should be subtle but unmistakable

### Buttons
- One primary action max per surface
- Secondary actions should be quiet
- Icon buttons should be minimal and flat

### Cards
- Cards are for repeated items or popovers only
- Never nest cards inside cards
- Page sections should be surfaces, not card stacks

### Lists
- Prefer clean rows with light separators
- Use compact metadata
- Keep row titles dominant

### Forms
- Forms should feel like a command prompt, not a brochure
- Keep labels short
- Avoid explanatory copy unless it removes ambiguity

## Page-Level Direction for Kemo

### Login / Register
- Blank, centered, calm
- One form, one decision
- No marketing panel

### Workspace
- This is the core shell
- Left rail: projects and navigation
- Center: current project or current job
- Right rail: status, plan, blockers
- Replace dashboard grids with a more editorial hierarchy

### Live Mode
- Make it feel like a recording console, not a dashboard
- One central capture surface
- State text should be compact and direct

### Settings
- Use grouped sections or tabs, but keep them quiet
- Avoid four equal cards competing for attention
- Profile, security, and appearance should read as one system

## Do Not Copy

- do not recreate the Claude logo or exact branding
- do not copy exact spacing or component geometry
- do not use a generic AI dashboard template
- do not bring back old-style enterprise card walls
- do not use purple-on-white as the main identity
- do not add decorative blobs, heavy gradients, or novelty shadows

## Implementation Priority

1. Simplify the workspace shell
2. Reduce the number of visible cards
3. Move to quieter typography and lighter surfaces
4. Make the left rail and centered stage the main identity
5. Keep utility actions small and secondary

## Success Standard
The interface passes if a user can identify:

- what screen they are on
- what the primary action is
- what context matters right now

in under 3 seconds, without the page feeling crowded.
