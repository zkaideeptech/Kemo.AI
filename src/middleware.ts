import createMiddleware from "next-intl/middleware";
import { defaultLocale, locales } from "./i18n/config";
import { updateSession } from "@/lib/supabase/middleware";
import { NextRequest, NextResponse } from "next/server";

const handleI18nRouting = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: "always",
});

export default async function middleware(request: NextRequest) {
  // Update Supabase session to prevent auth expiration (this creates a valid response)
  const supabaseResponse = await updateSession(request);

  // Apply next-intl routing rules
  const isApi = request.nextUrl.pathname.startsWith('/api');
  if (isApi) {
    // API routes do not use next-intl.
    return supabaseResponse;
  }

  const i18nResponse = handleI18nRouting(request);
  
  // Persist cookies set by Supabase into the final i18n response so auth refresh is saved
  const supabaseCookies = supabaseResponse.cookies.getAll();
  supabaseCookies.forEach((cookie) => {
    i18nResponse.cookies.set(cookie.name, cookie.value, cookie);
  });

  return i18nResponse;
}

export const config = {
  // Allow processing of /api routes to maintain their active session authentication
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
