# kemo

Interview audio -> transcript -> IC memo + WeChat article.

This repo targets a production-grade SaaS feel (not an AI demo). It is built with:
- Next.js App Router + TypeScript
- shadcn/ui + Tailwind
- next-intl (zh/en)
- Supabase (Auth + Postgres + RLS + Realtime)
- Supabase Storage (project-level plan)
- Qwen3-ASR via Alibaba Cloud Model Studio (DashScope)
- GPT-5.2 via OpenAI API
- Stripe subscriptions (free/pro)

## MVP scope
- Upload audio, create a job
- Async pipeline: ASR -> term extraction -> terms review -> summaries
- IC Q&A memo + WeChat long-form article
- Terms review UI with user confirmations
- Jobs list + job detail with tabs
- Free/Pro gating and usage visibility
- Realtime job status updates (required in v1)

## Fixed pipeline (non-negotiable)
ASR → transcript → 术语候选抽取（规则+LLM）→ confidence → Terms Review → 用户确认 → 写回 glossary + confirmations → 生成 IC Q&A 与公众号长文 → 保存 memos 并支持导出/复制。

## Local development

```bash
npm install
npm run dev
```

The app lives in `/Users/kzhang/Desktop/KEMO/app`.

### Environment variables
Copy and fill:

```bash
cp .env.example .env.local
```

See `.env.example` for the full list.
Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client.

### Execution mode
Long tasks must never run in HTTP requests in production.
- `JOB_EXECUTION_MODE=queue` is required in production
- `JOB_EXECUTION_MODE=inline` is allowed only in local dev with `NODE_ENV=development`
Inline still calls real Qwen3-ASR + GPT-5.2. No mock.

## Supabase setup
1. Create a Supabase project.
2. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
3. Run SQL from `supabase/schema.sql` and `supabase/rls.sql`.
4. Create Storage buckets (example: `audio`), and ensure RLS is enabled.

### Storage limits and plan gating
Supabase Storage limits are **project-level**, not per user. We enforce Free/Pro gating in the application.
- Free users: **single file <= 50MB** (hard limit). If exceeded: show "compress/slice/upgrade to Pro".
- Pro users: app-level limit is relaxed, but the project-level limit still applies.

This limitation must be visible in the UI and in this README.

## Qwen3-ASR (Alibaba Cloud Model Studio)
We must use **real inference** via the hosted API (no local model).

Steps:
1. Create or log in to Alibaba Cloud.
2. Go to Model Studio console: https://bailian.console.aliyun.com
3. Create an API key: https://help.aliyun.com/zh/model-studio/get-api-key
4. Set `DASHSCOPE_API_KEY` in `.env.local`.

Filetrans async mode is the default (more stable for long audio). See:
- Qwen3-ASR API reference: https://help.aliyun.com/zh/model-studio/qwen-asr-api-reference

## Worker (queue execution)
Production must run jobs asynchronously. For local testing:

```bash
npm run worker
```

This processes queued jobs with real ASR + LLM calls.

## Seed terms import
Seed glossary terms are required for cold-start terminology recognition.

```bash
SEED_USER_ID=... SEED_TERMS_PATH=... npm run seed:terms
```

You can also use `SEED_TERMS_URL` to fetch a word list from the open dataset:
https://github.com/JiangYanting/Word_list_dataset_terminology

## GPT-5.2 (OpenAI)
We call OpenAI's official API for summaries.
- Set `OPENAI_API_KEY` in `.env.local`.
- Prompts live in `prompts/`.

## Stripe subscriptions
Stripe is required for Free/Pro subscriptions.

Setup steps (to be completed):
1. Create a Stripe account and configure products/prices for Free/Pro.
2. Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRICE_ID_PRO`.
3. Implement webhook URL and verify events.

## Mainland China access (risk and mitigation)
This project **cannot guarantee 100% access** in Mainland China without ICP.
We mitigate risk by:
- Binding a custom domain
- Avoiding blocked dependencies (e.g., Google Fonts)
- Optionally using Cloudflare proxy/CDN

See `docs/CHINA_ACCESS.md` for detailed steps.

## Deployment
- Vercel for Next.js
- Supabase for database and storage

## Repo docs
- `docs/ARCHITECTURE.md`
- `docs/CONSTITUTION.md`
- `docs/RULES.md`
- `docs/UI_SPEC.md`
- `docs/CHINA_ACCESS.md`
- `docs/DEV_LOG.md`
