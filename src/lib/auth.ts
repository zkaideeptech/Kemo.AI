import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { isLocalPreviewEnabled } from "@/lib/local-preview";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const AUTH_TIMEOUT_MS = 1500;
const DEV_PREVIEW_USER_ID = "dev-preview-user";

function createDevPreviewUser() {
  return {
    id: DEV_PREVIEW_USER_ID,
    email: "preview@kemo.local",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {
      provider: "email",
      providers: ["email"],
    },
    user_metadata: {
      name: "Kemo Preview",
    },
    created_at: new Date().toISOString(),
  } as User;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out while loading Supabase auth."));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export async function requireUser(locale: string) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await withTimeout(supabase.auth.getUser(), AUTH_TIMEOUT_MS);

    if (!user) {
      if (isLocalPreviewEnabled()) {
        return createDevPreviewUser();
      }

      redirect(`/${locale}/login`);
    }

    return user;
  } catch (error) {
    if (isLocalPreviewEnabled()) {
      console.warn("Falling back to preview user because Supabase auth is unavailable.", error);
      return createDevPreviewUser();
    }

    throw error;
  }
}

