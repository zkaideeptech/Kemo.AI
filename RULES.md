# Kemo.AI Rules

These rules are portable with the `Kemo.AI` repository and should be read before implementation together with `AGENTS.md`.

## API Error Handling

- Frontend API helpers must parse the response body before falling back to HTTP status text.
- For JSON APIs that return `{ ok: false, error }`, user-visible feedback must prefer `error.message` or `error.code` over coarse messages such as `Internal Server Error`, `Bad Request`, or `Request failed`.
- Non-2xx responses are not automatically opaque failures. If the response body contains a safe product error, surface that message and keep the action in a recoverable state.
- Server routes should return diagnosable, non-secret error messages through the project response helper instead of raw framework responses.
- Every user-triggered API action needs loading, success, and error feedback. Errors must reset pending/loading state.

## Skill Invocation Reliability

- For Kemo product bugs, regressions, broken UI/API behavior, and live artifact issues, confirm the two required workflow intents were invoked directly or applied manually:
  - `gstack-investigate`: reproduce the symptom, trace the data/rendering path, and state the root cause before editing.
  - `agent-training-loop`: define objective, validation set, search space, and stop conditions, then run at least one reproduce -> detect -> execute -> check cycle.
- If either skill is unavailable or only a bootstrap placeholder in the current host, apply the workflow intent manually and state that fallback explicitly.
- Final reports for qualifying tasks should say whether these two gates were used or why the task did not qualify.

## Provider Stability

- Do not mark provider-dependent work complete from build success alone.
- API stability: verify core API routes preserve `{ ok, data/error }`, parse non-2xx errors into useful user feedback, and do not leave loading states stuck.
- ASR stability: verify DashScope ASR configuration and reachability with `npm run qa:baseline`; for ASR-specific changes, also run `npx tsx scripts/test-asr.ts` when credentials and network allow it.
- Model stability: verify the configured OpenAI-compatible parsing model appears in `/models` through `npm run qa:baseline`; for prompt/provider changes, run a representative generation path or document the provider-side blocker.
