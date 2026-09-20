import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { jsonError } from "@/lib/api-utils";

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  await destroySession();
  return NextResponse.json({ ok: true });
}
