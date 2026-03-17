import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/api/response";
import {
  appendRealtimeAsrAudio,
  finishRealtimeAsrSession,
  getRealtimeAsrDebugState,
  getRealtimeAsrSnapshot,
  startRealtimeAsrSession,
} from "@/lib/live/realtimeAsrSession";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

function buildRealtimeCorpus({
  glossaryTerms,
  sourceSnippets,
}: {
  glossaryTerms: string[];
  sourceSnippets: string[];
}) {
  const glossaryBlock = glossaryTerms.length ? `Glossary:\n${glossaryTerms.slice(0, 80).join("、")}` : "";
  const sourcesBlock = sourceSnippets.length ? `Sources:\n${sourceSnippets.join("\n\n---\n\n")}` : "";

  return [glossaryBlock, sourcesBlock]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 12000);
}

async function loadRealtimeSessionConfig(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string, job: JobRow) {
  const [{ data: glossary }, { data: sources }] = await Promise.all([
    supabase.from("glossary_terms").select("term").eq("user_id", userId),
    job.project_id
      ? supabase
          .from("sources")
          .select("title, url, extracted_text")
          .eq("user_id", userId)
          .eq("project_id", job.project_id)
          .order("created_at", { ascending: false })
          .limit(4)
      : Promise.resolve({ data: [] as Array<{ title: string | null; url: string | null; extracted_text: string | null }> }),
  ]);

  const corpusText = buildRealtimeCorpus({
    glossaryTerms: (glossary || []).map((item) => item.term).filter(Boolean),
    sourceSnippets: (sources || [])
      .map((item, index) => {
        const title = item.title || item.url || `Source ${index + 1}`;
        const bodyText = (item.extracted_text || "").slice(0, 1200);
        return `${title}\n${bodyText}`;
      })
      .filter((item) => item.trim().length > 0),
  });

  return { corpusText };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "";
  const audioBase64 = typeof body?.audio === "string" ? body.audio : "";
  const language = typeof body?.language === "string" ? body.language : "zh";

  const { data: jobData } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const job = jobData as JobRow | null;

  if (!job || job.user_id !== user.id) {
    return jsonError("not_found", "Job not found", { status: 404 });
  }

  if (action === "start") {
    const { corpusText } = await loadRealtimeSessionConfig(supabase, user.id, job);

    const snapshot = await startRealtimeAsrSession({
      jobId: id,
      language,
      corpusText,
    });

    return jsonOk({ ...snapshot, debug: getRealtimeAsrDebugState(id) });
  }

  if (action === "append") {
    if (!audioBase64) {
      return jsonError("invalid_payload", "Missing audio chunk", { status: 400 });
    }

    const debugState = getRealtimeAsrDebugState(id);
    const needsConfig = !debugState.exists || !debugState.isOpen;
    const { corpusText } = needsConfig
      ? await loadRealtimeSessionConfig(supabase, user.id, job)
      : { corpusText: undefined };

    const snapshot = await appendRealtimeAsrAudio({
      jobId: id,
      audioBase64,
      language,
      corpusText,
    });

    return jsonOk({ ...snapshot, debug: getRealtimeAsrDebugState(id) });
  }

  if (action === "finish") {
    const snapshot = await finishRealtimeAsrSession(id);
    const payload =
      snapshot ||
      getRealtimeAsrSnapshot(id) || {
        jobId: id,
        statusText: "实时会话已结束",
        previewText: "",
        finalTranscriptText: "",
        isReady: false,
        hasFinished: true,
        errorMessage: null,
      };

    return jsonOk({ ...payload, debug: getRealtimeAsrDebugState(id) });
  }

  return jsonError("invalid_payload", "Unsupported live audio action", { status: 400 });
}
