# Architecture

## System overview (text diagram)

Client (Next.js App Router)
  -> POST /api/jobs (create job + upload audio)
  -> POST /api/jobs/[id]/run (enqueue only, 202)
  -> Realtime subscription on jobs

Worker (queue execution)
  -> run job pipeline asynchronously

Supabase
  - Auth (sessions)
  - Postgres (jobs, transcripts, memos, terms, confirmations)
  - Storage (audio files)
  - Realtime (job status updates, required in v1)

External Providers
  - Qwen3-ASR (Alibaba Cloud Model Studio) for transcription
  - OpenAI GPT-5.2 for summaries
  - Stripe for subscriptions

## State machine (jobs)

States:
- pending
- queued
- transcribing
- extracting_terms
- needs_review
- summarizing
- completed
- failed

Transitions:
- pending -> queued (POST /api/jobs/[id]/run)
- queued -> transcribing (worker starts)
- transcribing -> extracting_terms (ASR done)
- extracting_terms -> needs_review (terms require confirmation)
- extracting_terms -> summarizing (no review needed)
- needs_review -> summarizing (POST /api/jobs/[id]/confirm-terms)
- summarizing -> completed (memo generation done)
- any -> failed (error)

## Data flow (pipeline)

1. Create job + upload audio
2. Enqueue job
3. Worker pipeline:
   - ASR -> transcript
   - term extraction (rules + LLM) -> confidence
   - terms review UI -> user confirm (almost always required)
   - write glossary + confirmations (long-term memory)
   - LLM summary -> IC Q&A + WeChat article
   - save memos + export/copy

## Execution modes

- JOB_EXECUTION_MODE=queue (production, required)
  - /api/jobs/[id]/run only enqueues
  - Worker runs pipeline (separate process)

- JOB_EXECUTION_MODE=inline (local dev only)
  - Allowed only when NODE_ENV=development
  - Still uses real APIs (Qwen3-ASR + OpenAI), no mock

## Queue options
We keep queue integration abstract to avoid running long tasks in HTTP handlers.
Possible providers:
- Supabase Edge Functions + Cron
- Trigger.dev / Inngest / Upstash QStash
- Dedicated worker process
