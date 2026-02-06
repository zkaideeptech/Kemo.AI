import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function jsonError(code: string, message: string, init?: ResponseInit) {
  return NextResponse.json(
    { ok: false, error: { code, message } },
    init ?? { status: 400 }
  );
}

