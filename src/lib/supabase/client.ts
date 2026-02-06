/**
 * @file client.ts
 * @description Supabase 浏览器端客户端工厂
 * @author KEMO
 * @created 2026-02-05
 * @modified 2026-02-06
 */

import { createBrowserClient } from "@supabase/ssr";

/**
 * 创建 Supabase 浏览器端客户端
 * @returns Supabase 浏览器客户端实例
 */
export function createSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase public env vars");
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
