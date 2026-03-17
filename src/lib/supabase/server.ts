/**
 * @file server.ts
 * @description Supabase 服务端客户端工厂，支持 cookie 认证和 service_role 管理员模式
 * @author KEMO
 * @created 2026-02-05
 * @modified 2026-02-06
 */

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

/**
 * 创建 Supabase 服务端客户端（通过 cookie 认证，遵守 RLS）
 * @returns Supabase 客户端实例
 */
export async function createSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabasePublicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";

  if (!supabaseUrl || !supabasePublicKey) {
    throw new Error("Missing Supabase public env vars");
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabasePublicKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // Server Components can read cookies but cannot mutate them.
            // Route Handlers and middleware still persist auth cookies normally.
          }
        });
      },
    },
  });
}

/**
 * 创建 Supabase 管理员客户端（service_role 权限，绕过 RLS）
 * @returns Supabase 管理员客户端实例
 */
export function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase service role env vars");
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
