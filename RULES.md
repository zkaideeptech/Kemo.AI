# Kemo.AI Rules

These rules are portable with the `Kemo.AI` repository and should be read before implementation together with `AGENTS.md`.

## API Error Handling

- Frontend API helpers must parse the response body before falling back to HTTP status text.
- For JSON APIs that return `{ ok: false, error }`, user-visible feedback must prefer `error.message` or `error.code` over coarse messages such as `Internal Server Error`, `Bad Request`, or `Request failed`.
- Non-2xx responses are not automatically opaque failures. If the response body contains a safe product error, surface that message and keep the action in a recoverable state.
- Server routes should return diagnosable, non-secret error messages through the project response helper instead of raw framework responses.
- Every user-triggered API action needs loading, success, and error feedback. Errors must reset pending/loading state.

## Business Prompt Skill Reliability

- Kemo's business prompt skills are product capabilities, not developer workflow skills.
- Interview-record processing must reliably invoke the interview editor prompt skill:
  - `skills/00-interview-editor/SKILL.md`
  - artifact path: `publish_script` and downstream interview-record outputs.
- Realtime interview processing must reliably invoke both live prompt skills:
  - `skills/03-live-meeting-editor/SKILL.md`
  - `skills/04-live-question-coach/SKILL.md`
  - artifact paths: `live_meeting_editor` and `live_question_coach`.
- Any work touching `src/lib/providers/llmProvider.ts`, `src/app/api/jobs/[id]/live/route.ts`, `src/app/api/jobs/[id]/artifacts/route.ts`, or live artifact UI must verify that these prompt skills are still loaded from disk and routed by artifact kind.
- Final reports for qualifying Kemo work should state whether the interview-record skill and realtime-interview skills were checked, and which command or browser/API path proved the routing.

## Provider Stability

- Do not mark provider-dependent work complete from build success alone.
- API stability: verify core API routes preserve `{ ok, data/error }`, parse non-2xx errors into useful user feedback, and do not leave loading states stuck.
- ASR stability: verify DashScope ASR configuration and reachability with `npm run qa:baseline`; for ASR-specific changes, also run `npx tsx scripts/test-asr.ts` when credentials and network allow it.
- Model stability: verify the configured OpenAI-compatible parsing model appears in `/models` through `npm run qa:baseline`; for prompt/provider changes, run a representative generation path or document the provider-side blocker.
