import { jsonError, jsonOk } from "@/lib/api/response";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

const SUPPORTED_TOPICS = new Set(["bug", "feature", "data_source", "other"]);

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const topic = typeof body?.topic === "string" && SUPPORTED_TOPICS.has(body.topic)
    ? body.topic
    : "other";
  const description = typeof body?.description === "string" ? body.description.trim() : "";

  if (description.length < 10) {
    return jsonError("invalid_payload", "Description must be at least 10 characters", { status: 400 });
  }

  if (description.length > 4000) {
    return jsonError("invalid_payload", "Description is too long", { status: 400 });
  }

  const { data, error } = await supabase
    .from("support_tickets")
    .insert({
      user_id: user.id,
      topic,
      description,
    })
    .select("id, topic, status, created_at")
    .single();

  if (error?.message?.includes("support_tickets")) {
    const { data: eventData, error: eventError } = await admin
      .from("events")
      .insert({
        user_id: user.id,
        type: "support.ticket",
        payload: {
          topic,
          description,
          fallback: "events",
        },
      })
      .select("id, created_at")
      .single();

    if (eventError || !eventData) {
      return jsonError("db_error", eventError?.message || "Unable to create support ticket", { status: 500 });
    }

    return jsonOk({
      ticket: {
        id: eventData.id,
        topic,
        status: "open",
        created_at: eventData.created_at,
      },
    }, { status: 201 });
  }

  if (error || !data) {
    return jsonError("db_error", error?.message || "Unable to create support ticket", { status: 500 });
  }

  return jsonOk({ ticket: data }, { status: 201 });
}
