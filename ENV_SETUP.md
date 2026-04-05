# Environment Setup

This project uses a small set of environment variables grouped by capability.

## Files

- Local-only secrets: `.env.local`
- Example template: [.env.example](/Users/broncin/Desktop/kemo/.env.example)

Do not commit `.env.local`.

## Required For Basic App

These are required to load the authenticated app and talk to Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Notes:

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is the preferred public client key.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is still supported as a fallback for older setups.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be exposed to the browser.

## Required For Studio Generation

These power LLM artifact generation:

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-5.2
```

Without these, the app UI can load, but Studio generation will fail.

## Required For Search And Sources

These power external search and URL import:

```env
TAVILY_API_KEY=
TAVILY_BASE_URL=https://api.tavily.com

FIRECRAWL_API_KEY=
FIRECRAWL_BASE_URL=https://api.firecrawl.dev/v1
```

Behavior:

- `Tavily`: external web search
- `Firecrawl`: URL content extraction
- If `Firecrawl` is missing, the app falls back to direct fetch for basic pages, but success rate is lower.

## Required For ASR / TTS

These are not required for today's UI validation, but they are required for transcription and podcast audio:

```env
DASHSCOPE_API_KEY=
DASHSCOPE_API_BASE_URL=https://dashscope.aliyuncs.com/api/v1
DASHSCOPE_TTS_BASE_URL=https://dashscope.aliyuncs.com/api/v1
DASHSCOPE_TTS_MODEL=qwen-tts-latest
DASHSCOPE_TTS_VOICE=longxiaochun_v2
```

## Optional / Ops

```env
NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET_AUDIO=audio
SUPABASE_STORAGE_BUCKET_AUDIO=audio

CRON_SECRET=
WORKER_BATCH_LIMIT=3
JOB_EXECUTION_MODE=inline
PRO_MAX_FILE_SIZE_MB=512

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

## What Should Be Pushed

Push:

- source code
- migrations
- `.env.example`
- this document

Do not push:

- `.env.local`
- provider secrets
- local cache directories like `.local/` and `.npm-cache/`

## Collaboration Recommendation

For a small team, pushing `.env.example` + `ENV_SETUP.md` is enough.

Use Docker only if you need:

- consistent local runtime across machines
- one-command onboarding
- CI parity with local development
- background services bundled into a reproducible dev stack

For this project right now, Docker is optional, not mandatory.
The higher-value work first is:

1. stabilize product flows
2. finish provider integrations
3. then add Docker if team onboarding becomes painful
