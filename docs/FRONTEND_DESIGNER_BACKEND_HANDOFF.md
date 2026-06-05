# Kemo.AI Backend Handoff for Frontend Design

Last updated: 2026-05-29

Audience: frontend designers, product designers, motion designers, and frontend engineers implementing the next Kemo.AI workspace.

Purpose: explain what the backend already supports, which user states the frontend must design for, and how the interface should be shaped around a Claude web app style workspace. This document is written for design delivery, so backend names are included only where they affect UI behavior.

## 1. Product Shape

Kemo.AI is a research interview workspace. Users collect source material, record or upload conversations, let the backend transcribe and organize them, then generate reusable research outputs.

The core product experience should feel like a calm AI workbench:

- Left side: projects, conversations/materials, search, navigation.
- Center: current project or conversation canvas.
- Right side: contextual outputs, generated artifacts, status, plan/account context.
- Bottom or primary action area: new material, live recording, upload, URL import.

The redesign must not look like a generic SaaS dashboard. It should be designed as a Claude-style web workspace: minimal shell, high-quality typography, quiet neutral surfaces, streaming output, split-pane artifacts, and smooth but restrained motion.

## 2. Backend Capabilities In Plain Language

The backend supports five user-facing domains:

| Domain | What users should understand | Backend objects |
| --- | --- | --- |
| Projects | A workspace grouping interviews, files, URLs, and outputs. | `projects` |
| Conversations / Materials | One recorded, uploaded, or live-captured session. | `jobs`, `audio_assets`, `transcripts` |
| Sources | URLs, documents, and text references attached to a project. | `sources` |
| Generated Outputs | AI-produced scripts, summaries, minutes, questions, articles, audio, etc. | `artifacts`, `memos` |
| Review / Memory | User-confirmed terms and long-term glossary memory. | `term_occurrences`, `confirmations`, `glossary_terms` |

Design rule: users should never see backend provider names, table names, raw artifact kinds, storage paths, or API terminology. Use product language such as "Live notes", "Question coach", "Transcript", "Sources", "Draft", "Ready", and "Needs review".

## 3. Claude Web Replication Requirement

The frontend design direction is:

**Aesthetic name:** Claude-style quiet research workspace  
**Design impact score:** DFII 13/15  
**Design anchor:** a calm chat/workspace shell where generated research artifacts appear as a first-class side pane, not as dashboard cards.

Designers must use the current Claude web app as the reference on the day of design. Capture fresh screenshots from `https://claude.ai` before finalizing layouts because the Claude UI changes over time.

### 3.1 What To Replicate

Replicate the experience pattern, layout rhythm, and motion behavior of Claude web:

- A narrow, persistent left rail for project/conversation navigation.
- A generous central work surface with a clear current conversation or material.
- A right-side artifact/output pane on desktop when generated content is open.
- A bottom composer or action bar feel for new input, recording, upload, and follow-up actions.
- Subtle neutral colors, low-contrast dividers, soft surface hierarchy, and restrained focus states.
- Streaming text and progressive output reveal instead of abrupt full-page refreshes.
- Smooth pane transitions when opening generated outputs.
- Quiet hover states and tactile buttons without shiny gradients or heavy shadows.
- Dark mode that feels like Claude dark mode: neutral charcoal surfaces, soft borders, no saturated blue/purple wash.

### 3.2 What Not To Copy

Do not copy Claude or Anthropic logos, brand names, icon assets, exact text, or trademarked elements. Kemo.AI should remain Kemo.AI. The target is the interaction model and high-craft minimalism.

### 3.3 Motion Acceptance

Motion must be deliberately close to Claude web:

| Interaction | Required motion |
| --- | --- |
| Open artifact/output | Right pane slides/fades in over 180-260ms; content appears after shell. |
| Close artifact/output | Pane fades/slides out without shifting the whole page harshly. |
| Generate output | Button enters pending state; output appears progressively; no dead spinner-only state. |
| Live transcript | Transcript updates stream in place; scroll anchoring remains stable. |
| Question coach | Suggestions update as cards/lines with soft replacement, not full reset flicker. |
| Sidebar hover | Low-contrast background shift; no bounce or large transform. |
| Recording waveform | Bars must respond to real captured audio level, not decorative looping animation. |
| Errors/toasts | Small, calm toast or inline message; no modal for routine backend errors. |

Recommended timing: 180-260ms for panel and hover transitions, 300-500ms for larger state changes, easing similar to `cubic-bezier(0.2, 0, 0, 1)`.

## 4. Primary User Journeys

### 4.1 Open Workspace

Backend loads the user's complete workspace for `/app/jobs`:

- projects
- jobs
- transcripts
- memos
- artifacts
- favorites
- sources
- term occurrences
- plan limits

Design implication: the initial page should render a complete workspace immediately, with no extra empty dashboard layer. The first screen should help the user continue a project, open recent material, or start live capture.

### 4.2 Create Project

User creates a project with title and optional description. Backend stores it and returns the new project.

Design states:

- Empty project list.
- Creating project.
- Project created and selected.
- Missing title validation.
- Delete project confirmation.

### 4.3 Add Material

User can add material in three ways:

1. Live capture: starts a live interview session without a file.
2. Upload: audio/video becomes a processing job; text-like files become sources.
3. URL/import: URL is extracted into a project source.

Design implication: "New" should open a Claude-like compact action menu or composer-adjacent panel, not a heavy wizard.

### 4.4 Process Uploaded Audio

After upload, the user triggers processing. The backend queues a job and a worker runs:

1. transcribing
2. extracting terms
3. waiting for term review if needed
4. summarizing
5. completed or failed

Design implication: job cards and detail views need visible progress states and a special "Needs review" interruption state.

### 4.5 Review Terms

If the backend finds uncertain or important terms, the job stops at `needs_review`.

User actions:

- accept term
- edit term
- reject term

After submission, backend saves confirmations, updates glossary memory, and queues the job again.

Design implication: this cannot feel like an error. It is a normal review checkpoint. Use a small focused review panel, not a scary warning.

### 4.6 Live Capture

Live capture is the most important interactive flow.

Backend-supported capture modes:

- Face-to-face microphone.
- Meeting app/system audio through screen sharing.
- Browser tab audio through screen sharing.

During capture:

- browser captures audio
- audio is converted to 16k PCM
- audio chunks stream through a local ASR gateway websocket
- transcript snapshot updates in the UI
- backend periodically saves live transcript and drafts
- two Live skills produce rolling outputs:
  - Live Meeting Editor
  - Live Question Coach

When the user stops:

- recorded audio is saved as a live audio asset
- transcript is finalized
- speaker diarization is attempted
- final artifacts are marked ready

Design implication: Live must look like a real-time work surface, not a recorder widget. The transcript and two skill outputs are the core product value.

### 4.7 Generate Outputs

For a selected job with transcript text, user can generate or regenerate supported artifacts.

Important outputs:

- Publish Script
- Quick Summary
- Question Coach / Inspiration Questions
- Meeting Minutes
- Roadshow Transcript
- IC Q&A
- WeChat Article
- Podcast Script / Podcast Audio
- Mind Map
- PPT Outline

Design implication: artifacts should feel like Claude Artifacts: openable documents in a side pane or focused panel, with copy, download, favorite, and regeneration affordances.

### 4.8 Search And Favorites

Backend supports project-level search across:

- jobs
- transcripts
- artifacts
- sources

Favorites can be saved for:

- artifacts
- jobs

Design implication: search should feel like a quick jump panel in the sidebar. Favorites should be a lightweight saved-items list, not a separate social feature.

### 4.9 Settings And Plan

Backend exposes:

- user profile metadata
- password update through Supabase Auth
- avatar upload
- theme switch
- usage counters
- current plan
- max file size

Free plan must show file-size limit, but avoid "single day limit" style copy. The current requested front-facing CTA is "尽快申请到 Pro+" with a short benefits statement.

## 5. Data Model For UI

### 5.1 Project

| Field | Meaning for UI |
| --- | --- |
| `id` | Internal key; never display unless debugging. |
| `title` | Project name. Editable in design if supported later; currently create/delete supported. |
| `description` | Optional project note. |
| `accent_color` | Reserved for project color; not central today. |
| `created_at`, `updated_at` | Sorting and timestamp display. |

### 5.2 Job

Jobs are the main "conversation/material" records.

| Field | Meaning for UI |
| --- | --- |
| `title` | User-facing conversation title; editable anytime via PATCH. |
| `guest_name` | Optional guest label. |
| `interviewer_name` | Optional interviewer label. |
| `status` | Drives progress UI. |
| `error_message` | Show as a short user-readable failure message. |
| `capture_mode` | `upload` or `live`; map to user-facing source type. |
| `source_type` | Internal source category; avoid exposing raw values. |
| `live_transcript_snapshot` | Live transcript preview before final transcript row exists. |
| `started_at`, `ended_at` | Session timing. |
| `is_archived` | Reserved/archive state. |

Status labels for design:

| Backend status | Product label | UI treatment |
| --- | --- | --- |
| `pending` | Ready to process | Neutral. |
| `queued` | Waiting | Soft pending indicator. |
| `transcribing` | Transcribing | Active progress. |
| `extracting_terms` | Preparing review | Active progress. |
| `needs_review` | Needs term review | Review badge, not error. |
| `summarizing` | Generating outputs | Active progress. |
| `completed` | Ready | Completed badge. |
| `failed` | Failed | Inline retry/error state. |

### 5.3 Transcript

| Field | Meaning for UI |
| --- | --- |
| `transcript_text` | Main transcript content. |
| `raw` | Backend diagnostic/provider payload; never display. |
| `created_at` | Timestamp. |

### 5.4 Artifact

Artifacts are generated outputs. Treat them as documents/cards the user can open.

| Field | Meaning for UI |
| --- | --- |
| `kind` | Internal output type; map to product labels. |
| `title` | Display title. |
| `content` | Full document body. |
| `summary` | Preview snippet. |
| `status` | `draft` or `ready`. |
| `metadata` | Backend hints such as download path or live status; display only if converted to product copy. |
| `audio_url` | Audio player source for podcast audio. |
| `is_favorite` | Favorite visual state. |

Output label mapping:

| Artifact kind | User-facing label |
| --- | --- |
| `live_meeting_editor` | Live notes |
| `live_question_coach` | Question coach |
| `publish_script` | Publish script |
| `quick_summary` | Quick summary |
| `inspiration_questions` | Follow-up questions |
| `meeting_minutes` | Meeting minutes |
| `roadshow_transcript` | Roadshow transcript |
| `ic_qa` | IC Q&A |
| `wechat_article` | WeChat article |
| `podcast_script` | Podcast script |
| `podcast_audio` | Podcast audio |
| `mind_map` | Mind map |
| `ppt_outline` | PPT outline |

### 5.5 Source

| Field | Meaning for UI |
| --- | --- |
| `source_type` | URL, file, text import. Convert to friendly label. |
| `title` | Source title. |
| `url`, `domain` | Link display. |
| `raw_text`, `extracted_text` | Preview content. Prefer extracted text. |
| `status` | `ready` or `failed`. |
| `metadata` | Import detail; do not display raw. |

### 5.6 Term Occurrence

| Field | Meaning for UI |
| --- | --- |
| `term_text` | Suggested term. |
| `context` | Context snippet. |
| `confidence` | Optional confidence; avoid showing raw percentages unless useful. |
| `status` | `pending`, `confirmed`, `rejected`. |

## 6. API Contract For Frontend Engineers

All normal API responses use:

```json
{ "ok": true, "data": {} }
```

Errors use:

```json
{ "ok": false, "error": { "code": "error_code", "message": "Readable message" } }
```

Design implication: every user-triggered call needs loading, success, and error states.

### 6.1 Projects

| Method | Endpoint | Purpose | Body / query | Success data |
| --- | --- | --- | --- | --- |
| GET | `/api/projects` | List projects. | none | `{ projects }` |
| POST | `/api/projects` | Create project. | `{ title, description? }` | `{ project }` |
| DELETE | `/api/projects/:id` | Delete project. | none | `{ removed: true }` |
| GET | `/api/projects/:id/sources` | List sources in project. | none | `{ sources }` |
| POST | `/api/projects/:id/sources` | Add URL/text/file-derived source. | `{ url?, title?, rawText?, extractedText?, sourceType?, jobId?, metadata? }` | `{ source }` |
| GET | `/api/projects/:id/search?q=` | Search project content. | `q` min 2 chars | `{ results }` |

### 6.2 Jobs

| Method | Endpoint | Purpose | Body / query | Success data |
| --- | --- | --- | --- | --- |
| GET | `/api/jobs` | List jobs. | none | `{ jobs }` |
| POST | `/api/jobs` | Create upload or live job. | multipart file or JSON metadata | `{ jobId, job, audioAssetId? }` |
| GET | `/api/jobs/:id` | Load job detail. | none | `{ job }` |
| PATCH | `/api/jobs/:id` | Rename job. | `{ title }` | `{ job }` |
| DELETE | `/api/jobs/:id` | Delete job and related records. | none | `{ removed: true }` |
| POST | `/api/jobs/:id/run` | Queue processing. | none | `{ queued: true }` |
| POST | `/api/jobs/:id/confirm-terms` | Submit term review. | `{ terms: [...] }` | `{ ok: true }` |

### 6.3 Artifacts

| Method | Endpoint | Purpose | Body / query | Success data |
| --- | --- | --- | --- | --- |
| GET | `/api/jobs/:id/artifacts` | List job artifacts. | none | `{ artifacts }` |
| POST | `/api/jobs/:id/artifacts` | Generate/update one artifact. | `{ kind, transcriptText? }` | `{ artifact }` |
| GET | `/api/artifacts/:id/download` | Download DOCX for supported outputs. | none | file response |
| POST | `/api/favorites` | Save favorite job/artifact. | `{ artifactId?, jobId?, projectId?, itemType?, label?, excerpt? }` | `{ favorite }` |
| DELETE | `/api/favorites?artifactId=&jobId=` | Remove favorite. | query | `{ removed: true }` |

### 6.4 Clarifications

Clarifications are user-supplied answers to missing information inside generated drafts. They are stored through the same confirmation memory path used by term review.

| Method | Endpoint | Purpose | Body / query | Success data |
| --- | --- | --- | --- | --- |
| GET | `/api/jobs/:id/clarifications` | Load clarification Q&A already saved for a job. | none | `{ items }` |
| POST | `/api/jobs/:id/clarifications` | Save clarification answers from the user. | `{ items: [{ question, answer, context? }] }` | `{ ok: true }` |

Design implication: if generated output asks for missing facts, the UI should offer a compact "answer missing details" affordance. Do not expose this as database confirmations.

### 6.5 Live Capture

| Method | Endpoint | Purpose | Body / query | Success data |
| --- | --- | --- | --- | --- |
| GET | `/api/live/audio/health` | Warm/check local live ASR gateway. | none | `{ ready: true }` |
| POST | `/api/jobs/:id/live/audio` | Start browser live audio session. | `{ action: "start", language, turnDetectionMode }` | `{ jobId, wsUrl, token, snapshot }` |
| GET | `/api/jobs/:id/live/audio` | Get current live ASR snapshot. | none | snapshot/debug |
| POST | `/api/jobs/:id/live` | Save live transcript and generate rolling drafts. | `{ transcriptText, statusText?, finalize?, includeInspiration? }` | `{ job, draftArtifacts, statusText, warning? }` |
| POST | `/api/jobs/:id/live/audio-asset` | Save final recorded audio asset. | JSON metadata or multipart file | `{ audioAsset, storagePath }` |

Live browser websocket:

- Frontend receives `wsUrl` and `token` from `/api/jobs/:id/live/audio`.
- Frontend opens websocket and sends `client.start`.
- Frontend sends binary PCM chunks.
- Gateway returns `session.ready`, `session.update`, `session.finished`, and `session.error`.
- UI should use snapshots to update transcript and status.

Designers do not need to design websocket internals, but they must design:

- Connecting state.
- Permission request state.
- Running state.
- Paused state.
- Stopping/finalizing state.
- Failed microphone/system audio state.
- Transcript empty/running/expanded state.
- Live notes and Question coach draft update state.

### 6.6 Web Search, Worker, And Billing Internals

These endpoints exist, but most should not become visible product surfaces.

| Method | Endpoint | Purpose | Design guidance |
| --- | --- | --- | --- |
| GET | `/api/search/web?q=` | Authenticated provider-backed web search. | If exposed, show as "Search the web"; hide provider name. |
| GET | `/api/cron/worker` | Runs queued backend jobs. | Internal/ops only; never show in frontend navigation. |
| POST | `/api/stripe/webhook` | Receives Stripe subscription events. | Internal billing integration; not a user-facing page. |

Design implication: if the frontend shows billing, it should show plan and benefits only. Do not design Stripe webhook status, cron worker controls, or provider diagnostics for normal users.

## 7. Live Skills Must Be First-Class

The two Live skills are not decorative. The backend actively creates and updates these draft artifacts during live capture:

1. `live_meeting_editor`  
   Product label: Live notes  
   Purpose: continuously organize the raw transcript into readable interview notes.

2. `live_question_coach`  
   Product label: Question coach  
   Purpose: maintain follow-up questions and pending topics during the conversation.

Design requirement:

- These two outputs must be visible during Live, preferably in a Claude-style right artifact pane or side-by-side secondary rail.
- They must have a real loading/empty state before the first draft.
- They must update without flashing the whole surface.
- They must not be hidden behind only an "Artifacts" tab.
- On finalize, they should become ready artifacts with normal open/copy/favorite behavior.

## 8. Frontend State Matrix

### 8.1 Empty States

| Area | Empty state copy direction | Primary action |
| --- | --- | --- |
| No projects | "Create a project to collect interviews and sources." | New project |
| Project has no material | "Add a live conversation, upload, or source." | Add material |
| No transcript | "Transcript will appear after recording or processing." | Start/Process |
| No artifacts | "Generate outputs once a transcript is ready." | Generate |
| No sources | "Add URLs, notes, or files to ground future outputs." | Import source |
| No favorites | "Save useful outputs or conversations here." | none |

### 8.2 Loading States

Use skeletons for lists and documents. Use button-level pending states for user actions. Do not use full-screen loading for small actions.

Key loading labels:

- Creating project.
- Uploading.
- Queueing.
- Transcribing.
- Preparing review.
- Generating.
- Connecting live capture.
- Saving final transcript.

### 8.3 Error States

Use short, direct errors with next action:

| Backend error style | UI behavior |
| --- | --- |
| `unauthorized` | Redirect/sign-in prompt. |
| `invalid_payload` | Inline validation near field/action. |
| `not_found` | Empty/not available state. |
| `db_error` | Toast plus retry if action is repeatable. |
| `upload_failed` | Show upload retry. |
| `not_ready` | Disable generate or explain transcript is not ready. |
| Live audio failure | Show permission/device instructions and allow retry. |

## 9. Information Architecture Proposal

Desktop Claude-style layout:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Left rail       │ Main workspace / conversation canvas       │ Artifact rail │
│                 │                                             │              │
│ New material    │ Project header / current title              │ Live notes    │
│ Search          │ Transcript / overview / source preview      │ Question coach│
│ Projects tree   │ Composer-like action area                   │ Outputs       │
│ Nav sections    │                                             │ Context       │
└──────────────────────────────────────────────────────────────────────────────┘
```

Responsive behavior:

- Desktop: three-pane layout allowed.
- Tablet: left rail collapses to icon rail; artifact rail can overlay.
- Mobile: single-pane stack; artifact opens as full-screen sheet; bottom actions remain reachable.

Suggested navigation:

- Workspace
- Live
- Sources
- Outputs
- Favorites
- Settings

Suggested main actions:

- New material
- Start live
- Upload
- Import URL
- Generate
- Review terms

## 10. Visual Design Rules For The Redesign

The current UI should be simplified. The target is mature, minimal, and calm.

Must do:

- Use fewer cards. Reserve cards for repeated items, modals, and true documents.
- Keep pages mostly full-width surfaces with subtle dividers.
- Use concise labels and sparse helper copy.
- Keep technical details in backend/admin only.
- Use icons for familiar tools: new, search, upload, mic, settings, favorite, copy, download.
- Keep button text short.
- Make the selected project and current material obvious.
- Make Live and generated artifacts the hero of the app.

Must avoid:

- Old dashboard look.
- Dense marketing copy in the product.
- Bright gradients and decorative blobs.
- Provider labels such as "ASR", "阿里", "Supabase", "Storage".
- Raw IDs, storage paths, `jobId`, `artifact kind`, `live_meeting_editor`.
- Large nested cards.
- Spinner-only long states.

## 11. Copy Vocabulary

Use product terms:

| Backend/internal | Frontend copy |
| --- | --- |
| ASR | transcription / live transcript |
| job | conversation / material / session |
| artifact | output / document |
| live_meeting_editor | Live notes |
| live_question_coach | Question coach |
| source | source |
| term occurrence | term to review |
| queued | waiting |
| extracting_terms | preparing review |
| needs_review | needs review |
| storage | file |

Chinese copy direction:

- "实时转写" instead of "ASR".
- "实时笔记" instead of "live_meeting_editor".
- "追问助手" or "问题教练" instead of "live_question_coach".
- "素材" or "对话" instead of "job".
- "产出" or "文稿" instead of "artifact".
- "尽快申请到 Pro+" for Free plan CTA.

## 12. Backend Constraints Designers Must Respect

- Auth is required for all workspace APIs.
- Production jobs are asynchronous. Do not design as if processing is instant.
- Long-running AI work must show progress or queued states.
- Live capture needs browser permissions; denial and missing audio tracks are expected states.
- The Free plan currently has a 50MB single-file limit.
- Pro max file size defaults to 500MB unless configured.
- Realtime job updates come through Supabase Realtime for `jobs`; artifact updates often arrive after API responses or route refresh.
- Some outputs can be generated only after transcript text exists.
- DOCX download is supported for meeting minutes and roadshow transcript through generated artifact metadata.
- Raw provider failures may happen; the frontend should translate them into user-facing messages.

## 13. Design Deliverables Expected

The design team should deliver:

- Desktop workspace layout.
- Tablet and mobile responsive layouts.
- Light and dark mode.
- Claude-style left rail, main canvas, and artifact pane.
- New material action menu.
- Live capture surface with microphone/system/tab modes.
- Live running state with real waveform.
- Live notes and Question coach update states.
- Job/conversation list item states for every backend status.
- Term review panel.
- Artifact open pane with copy/download/favorite/regenerate.
- Source preview.
- Search quick-jump panel.
- Settings and plan page.
- Empty/loading/error states.
- Motion spec with timings and easing.

## 14. Acceptance Checklist

Before frontend implementation is accepted:

- [ ] The first viewport looks like a Claude-style app workspace, not a marketing page or generic dashboard.
- [ ] Desktop has a clear left rail, central workspace, and output/artifact surface.
- [ ] Opening outputs feels like Claude Artifacts: side-pane, document-first, smooth transition.
- [ ] Live capture shows transcript plus both Live notes and Question coach.
- [ ] The waveform reacts to real audio input.
- [ ] No provider or infrastructure terms appear in user-facing UI.
- [ ] Every job status has a designed state.
- [ ] `needs_review` is designed as a normal checkpoint.
- [ ] Every primary action has loading, success, and error feedback.
- [ ] Empty states are useful but short.
- [ ] Free plan CTA says "尽快申请到 Pro+" and explains benefits.
- [ ] Dark mode is neutral and Claude-like, not blue/purple-heavy.
- [ ] Motion spec includes panel, streaming text, hover, toast, and live update behavior.

## 15. Source Files Behind This Handoff

Backend/API:

- `src/app/api/jobs/route.ts`
- `src/app/api/jobs/[id]/route.ts`
- `src/app/api/jobs/[id]/run/route.ts`
- `src/app/api/jobs/[id]/confirm-terms/route.ts`
- `src/app/api/jobs/[id]/clarifications/route.ts`
- `src/app/api/jobs/[id]/artifacts/route.ts`
- `src/app/api/jobs/[id]/live/route.ts`
- `src/app/api/jobs/[id]/live/audio/route.ts`
- `src/app/api/jobs/[id]/live/audio-asset/route.ts`
- `src/app/api/projects/route.ts`
- `src/app/api/projects/[id]/route.ts`
- `src/app/api/projects/[id]/sources/route.ts`
- `src/app/api/projects/[id]/search/route.ts`
- `src/app/api/search/web/route.ts`
- `src/app/api/favorites/route.ts`
- `src/app/api/cron/worker/route.ts`
- `src/app/api/stripe/webhook/route.ts`

Backend services:

- `src/lib/workflows/jobPipeline.ts`
- `src/lib/workflows/queue.ts`
- `src/lib/providers/asrProvider.ts`
- `src/lib/providers/llmProvider.ts`
- `src/lib/live/realtimeAsrSession.ts`
- `src/lib/live/asrGatewayClient.ts`
- `scripts/live-asr-gateway.ts`
- `src/lib/supabase/types.ts`

Frontend integration points:

- `src/app/[locale]/app/jobs/page.tsx`
- `src/components/notebook-workspace.tsx`
- `src/components/live-interview-panel.tsx`
- `src/components/notebook-workspace.model.ts`
- `src/app/[locale]/app/settings/page.tsx`
- `src/app/[locale]/app/settings/settings-client-view.tsx`
