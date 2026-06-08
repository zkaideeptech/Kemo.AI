# Kemo.AI Agent Rules

These rules extend the user's global GStack protocol for work inside `Kemo.AI`.

## Required Reading

Before code work in this project, read:

1. `../AGENTS.md`
2. `../RULES.md`
3. `AGENTS.md`
4. `RULES.md`
5. `.cursorrules`
6. `docs/ARCHITECTURE.md`
7. `docs/UI_SPEC.md` for UI work

`AGENT.md`, `docs/CONSTITUTION.md`, and `docs/RULES.md` currently contain mojibake in this checkout. Treat them as historical reference only when their meaning is clear; do not rely on corrupted text for hard requirements.

## Project Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/Radix-style UI components
- next-intl
- Supabase Auth/Postgres/Storage/Realtime
- Stripe

Do not add new frameworks, state managers, queue systems, or UI libraries unless the user explicitly approves the tradeoff.

## Architecture Boundaries

- Keep long-running work out of production HTTP handlers.
- Preserve the async job model: API creates/enqueues work, workers run the pipeline, UI follows status.
- Use the existing provider/workflow layering under `src/lib/providers` and `src/lib/workflows`.
- Keep API responses consistent: `{ ok: true, data: ... }` or `{ ok: false, error: ... }`.
- Frontend API parsing must surface `{ ok: false, error.message }` before falling back to HTTP status text. Do not show generic `Internal Server Error` when the API returned a safe product error message.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` or other server secrets to client code.
- Keep Supabase RLS assumptions intact.

## Implementation Rules

- Make the smallest change that satisfies the current goal.
- Do not clean up unrelated files or historical residue unless the task requires it.
- Preserve the existing `/src` organization and component conventions.
- Prefer existing helpers and UI primitives before adding new abstractions.
- Avoid `any` in TypeScript unless there is a narrow, documented reason.
- Every loading state needs a corresponding success or error path.
- Every user-triggered action should provide visible feedback.
- Empty lists and tables need an empty state.
- Avoid `console.log`, TODO, FIXME, HACK, and XXX leftovers in touched files.

## UI Rules

- Build a mature SaaS interface, not a novelty AI demo.
- Follow `docs/UI_SPEC.md` for spacing, typography, buttons, tables, loading, error, and empty states.
- Use existing UI components in `src/components/ui` where possible.
- Use `lucide-react` icons for icon buttons when an icon is appropriate.
- Keep responsive behavior explicit for grids, toolbars, tables, and fixed-format panels.

## Verification

For most code changes, run the narrowest useful verification first, then broaden when risk justifies it.

Default commands:

```bash
npm run lint
npm run build
```

Baseline command:

```bash
npm run qa:baseline
```

Run this before and after changes that touch app routing, provider connectivity, job processing, auth, storage, live artifacts, or i18n behavior. It packages the live question coach regression check, current build, and required environment connectivity as the regression baseline.

For frontend behavior changes, also start the local app and verify the affected screen in a browser when practical.

For bug fixes, verification must include the original failing path or a close reproduction.

## Skill Routing

- Bug fixes: use the debugging/root-cause workflow before editing.
- Reported product bugs and live artifact regressions must pass the two core skill gates before baseline packaging:
  1. `gstack-investigate` intent: reproduce the symptom, trace the data/rendering path, and state the root cause before editing.
  2. `agent-training-loop` intent: define objective, validation set, search space, and stop conditions, then run at least one reproduce -> detect -> execute -> check cycle with a generalization check.
- Every Kemo product-task report should state whether these two skill gates were invoked directly or applied manually as workflow intents. If they were skipped, state why the task did not qualify.
- Large features or architecture changes: use CEO review and engineering review planning before implementation.
- UI-heavy work: use the frontend design rules and verify visually.
- Release or PR work: run the ship/review style checklist before final handoff.

If an installed gstack skill is only a bootstrap placeholder, apply the corresponding workflow intent from the global protocol and this file.

## Kemo Stability Gates

For work that can affect commercial readiness, run or explicitly account for these checks:

- Skill reliability: confirm the `gstack-investigate` and `agent-training-loop` intents were used for bugs, regressions, broken UI/API behavior, and live artifact issues.
- API stability: verify core API routes preserve `{ ok, data/error }`, parse non-2xx errors into useful user feedback, and do not leave loading states stuck.
- ASR stability: verify DashScope ASR configuration and reachability with `npm run qa:baseline`; for ASR-specific changes, also run `npx tsx scripts/test-asr.ts` when credentials and network allow it.
- Model stability: verify the configured OpenAI-compatible model appears in `/models` through `npm run qa:baseline`; for prompt/provider changes, run a representative generation path or document the provider-side blocker.
- Baseline stability: run `npm run qa:baseline` before handoff when touching app routing, provider connectivity, job processing, auth, storage, live artifacts, i18n, API response handling, ASR, or model parsing.
