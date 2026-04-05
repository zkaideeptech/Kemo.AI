import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.SMOKE_BASE_URL || "http://127.0.0.1:4000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const AUDIO_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_AUDIO || process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET_AUDIO || "audio";

const TEST_EMAIL = `kemo-smoke-${Date.now()}@test.local`;
const TEST_PASSWORD = "TestPass123!";

const FILE_ARTIFACT_KINDS = [
  "publish_script",
  "quick_summary",
  "inspiration_questions",
  "meeting_minutes",
] as const;

const FILE_TRANSCRIPT = [
  "今天我们围绕新一轮上传录音工作流做一次完整梳理，重点确认用户从上传音频到拿到纪要、摘要、主稿之间是否仍有断点。",
  "团队已经把项目、任务、当前状态和技能卡拆开了，但我们希望界面更极简，信息更紧凑，同时不能影响后面的摘要和纪要生成。",
  "这次讨论还涉及首页的数据汇总、进程弹窗以及实时录音三条链路，所以我们需要明确哪些输出来自自动处理，哪些输出需要用户手动触发。",
  "结论是上传录音之后，主稿、快速摘要和灵感问题都应该可以直接触发，会议纪要也必须能够稳定生成，并且返回内容不能是空白。",
].join("");

const LIVE_TRANSCRIPT = [
  "现在开始实时录音冒烟，我们用一段足够长的中文文本模拟现场转写。",
  "当前目标是验证实时草稿会生成正式主稿、快速摘要和灵感问题，并且在 finalize 之后会把转写写入 transcript 表，再把 job 状态切到 completed。",
  "如果第三方模型暂时抖动，我们也至少要拿到可用的基础草稿，而不是整条链路直接失败。",
  "这条链路最终会支撑访谈、会议和浏览器页面采集，所以稳定性要优先于花哨文案。",
].join("");

type CookieJar = Map<string, string>;

type ApiRequestInit = {
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
};

type ApiEnvelope<T> = {
  ok: boolean;
  data: T;
};

type ProjectResponse = {
  project?: { id: string };
};

type JobResponse = {
  job?: { id: string; audio_asset_id?: string | null };
};

type ArtifactResponse = {
  artifact?: { id: string; kind: string; content?: string | null };
};

type LiveResponse = {
  draftArtifacts?: Array<{ kind: string; content?: string | null; status?: string | null }>;
  transcript?: { id: string; transcript_text?: string | null } | null;
};

const cookieJar: CookieJar = new Map();
const cleanupState = {
  userId: "" as string | null,
  projectId: "" as string | null,
  fileJobId: "" as string | null,
  liveJobId: "" as string | null,
  audioAssetIds: [] as string[],
  audioStoragePaths: [] as string[],
};

function log(message: string) {
  console.log(`[smoke] ${message}`);
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function getCookieHeader() {
  return Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function captureCookies(response: Response) {
  const getter = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies = typeof getter === "function" ? getter.call(response.headers) : [];

  for (const item of setCookies) {
    const [cookiePair] = item.split(";");
    const equalsIndex = cookiePair.indexOf("=");

    if (equalsIndex <= 0) {
      continue;
    }

    const name = cookiePair.slice(0, equalsIndex).trim();
    const value = cookiePair.slice(equalsIndex + 1).trim();

    if (!value) {
      cookieJar.delete(name);
      continue;
    }

    cookieJar.set(name, value);
  }
}

async function apiFetch(path: string, init: ApiRequestInit = {}) {
  const headers = new Headers(init.headers || {});
  const cookieHeader = getCookieHeader();

  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method: init.method || "GET",
    headers,
    body: init.body,
  });

  captureCookies(response);
  return response;
}

async function apiJson<T>(path: string, init: ApiRequestInit = {}) {
  const response = await apiFetch(path, init);
  const payload = (await response.json().catch(() => ({}))) as
    | ApiEnvelope<T>
    | { error?: { code?: string; message?: string }; message?: string };

  if (!response.ok) {
    const errorMessage =
      "error" in payload
        ? payload.error?.message || payload.message || response.statusText
        : response.statusText;
    throw new Error(`${path} -> ${response.status} ${errorMessage}`);
  }

  if (!("data" in payload)) {
    throw new Error(`${path} -> missing data payload`);
  }

  return payload.data;
}

async function syncAuth(accessToken: string, refreshToken: string) {
  const response = await apiFetch("/api/auth/sync", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      accessToken,
      refreshToken,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } | string };
  if (!response.ok) {
    const errorMessage =
      typeof payload.error === "string"
        ? payload.error
        : payload.error?.message || response.statusText;
    throw new Error(`/api/auth/sync -> ${response.status} ${errorMessage}`);
  }
}

async function main() {
  invariant(SUPABASE_URL, "Missing NEXT_PUBLIC_SUPABASE_URL");
  invariant(SUPABASE_ANON_KEY, "Missing Supabase anon key");
  invariant(SUPABASE_SERVICE_ROLE_KEY, "Missing SUPABASE_SERVICE_ROLE_KEY");

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  log(`using ${BASE_URL}`);

  const { data: signUpData, error: signUpError } = await anon.auth.signUp({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (signUpError) {
    throw signUpError;
  }

  cleanupState.userId = signUpData.user?.id || null;
  log(`registered ${TEST_EMAIL}`);

  const { data: signInData, error: signInError } = await anon.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (signInError || !signInData.session) {
    throw signInError || new Error("Missing session after sign-in");
  }

  await syncAuth(signInData.session.access_token, signInData.session.refresh_token);
  log("synced auth cookies");

  const projectPayload = await apiJson<ProjectResponse>("/api/projects", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      title: "Smoke Core Workflow",
      description: "Smoke validation for upload, summary, minutes, and live capture.",
    }),
  });

  const projectId = projectPayload.project?.id || "";
  invariant(projectId, "Failed to create project");
  cleanupState.projectId = projectId;
  log(`created project ${projectId}`);

  await apiJson(`/api/projects/${projectId}/sources`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      title: "Smoke Context Notes",
      rawText: FILE_TRANSCRIPT,
      extractedText: FILE_TRANSCRIPT,
      sourceType: "notes",
    }),
  });
  log("created inline source context");

  const uploadForm = new FormData();
  uploadForm.set("projectId", projectId);
  uploadForm.set("title", "Smoke File Workflow");
  uploadForm.set("captureMode", "upload");
  uploadForm.set("sourceType", "audio_upload");
  uploadForm.set("file", new Blob([Buffer.from("smoke-audio-binary")], { type: "audio/mpeg" }), "smoke.mp3");

  const fileJobPayload = await apiJson<JobResponse>("/api/jobs", {
    method: "POST",
    body: uploadForm,
  });

  const fileJobId = fileJobPayload.job?.id || "";
  invariant(fileJobId, "Failed to create file job");
  cleanupState.fileJobId = fileJobId;
  if (fileJobPayload.job?.audio_asset_id) {
    cleanupState.audioAssetIds.push(fileJobPayload.job.audio_asset_id);
  }
  log(`created file job ${fileJobId}`);

  for (const kind of FILE_ARTIFACT_KINDS) {
    const artifactPayload = await apiJson<ArtifactResponse>(`/api/jobs/${fileJobId}/artifacts`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        kind,
        transcriptText: FILE_TRANSCRIPT,
      }),
    });

    const contentLength = artifactPayload.artifact?.content?.trim().length || 0;
    invariant(contentLength > 30, `${kind} returned empty content`);
    log(`artifact ${kind} ok (${contentLength} chars)`);
  }

  const liveJobPayload = await apiJson<JobResponse>("/api/jobs", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      title: "Smoke Live Workflow",
      projectId,
      captureMode: "live",
      sourceType: "live_capture",
    }),
  });

  const liveJobId = liveJobPayload.job?.id || "";
  invariant(liveJobId, "Failed to create live job");
  cleanupState.liveJobId = liveJobId;
  log(`created live job ${liveJobId}`);

  const liveDraftPayload = await apiJson<LiveResponse>(`/api/jobs/${liveJobId}/live`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      transcriptText: LIVE_TRANSCRIPT,
      statusText: "smoke-draft",
      includeInspiration: true,
      finalize: false,
    }),
  });

  const liveDraftKinds = new Set((liveDraftPayload.draftArtifacts || []).map((artifact) => artifact.kind));
  invariant(liveDraftKinds.has("publish_script"), "live draft missing publish_script");
  invariant(liveDraftKinds.has("quick_summary"), "live draft missing quick_summary");
  invariant(liveDraftKinds.has("inspiration_questions"), "live draft missing inspiration_questions");
  log(`live draft ok (${Array.from(liveDraftKinds).join(", ")})`);

  const liveFinalizePayload = await apiJson<LiveResponse>(`/api/jobs/${liveJobId}/live`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      transcriptText: LIVE_TRANSCRIPT,
      statusText: "smoke-finalize",
      finalize: true,
    }),
  });

  const finalizedKinds = new Set((liveFinalizePayload.draftArtifacts || []).map((artifact) => artifact.kind));
  invariant(liveFinalizePayload.transcript?.transcript_text?.trim(), "live finalize missing transcript row");
  invariant(finalizedKinds.has("publish_script"), "live finalize missing publish_script");
  invariant(finalizedKinds.has("quick_summary"), "live finalize missing quick_summary");
  invariant(finalizedKinds.has("inspiration_questions"), "live finalize missing inspiration_questions");
  log(`live finalize ok (${Array.from(finalizedKinds).join(", ")})`);

  const { data: audioAssets } = await admin
    .from("audio_assets")
    .select("id, storage_path")
    .in("job_id", [fileJobId, liveJobId]);

  cleanupState.audioAssetIds.push(...(audioAssets || []).map((asset) => asset.id));
  cleanupState.audioStoragePaths.push(...(audioAssets || []).map((asset) => asset.storage_path).filter(Boolean));

  log("all smoke checks passed");
}

async function cleanup() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return;
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const jobIds = [cleanupState.fileJobId, cleanupState.liveJobId].filter(Boolean) as string[];

  try {
    if (cleanupState.audioStoragePaths.length) {
      await admin.storage.from(AUDIO_BUCKET).remove(cleanupState.audioStoragePaths);
    }

    if (jobIds.length) {
      await admin.from("artifacts").delete().in("job_id", jobIds);
      await admin.from("transcripts").delete().in("job_id", jobIds);
      await admin.from("credits_ledger").delete().in("job_id", jobIds);
      await admin.from("audio_assets").delete().in("job_id", jobIds);
      await admin.from("jobs").delete().in("id", jobIds);
    }

    if (cleanupState.projectId) {
      await admin.from("sources").delete().eq("project_id", cleanupState.projectId);
      await admin.from("projects").delete().eq("id", cleanupState.projectId);
    }

    if (cleanupState.userId) {
      await admin.auth.admin.deleteUser(cleanupState.userId);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[smoke] cleanup warning: ${message}`);
  }
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[smoke] failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
  });
