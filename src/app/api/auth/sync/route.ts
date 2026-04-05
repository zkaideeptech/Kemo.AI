import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type SyncPayload = {
  accessToken?: string;
  refreshToken?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as SyncPayload | null;

  if (!payload?.accessToken || !payload.refreshToken) {
    return NextResponse.json({ error: "Missing auth tokens." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.setSession({
    access_token: payload.accessToken,
    refresh_token: payload.refreshToken,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
