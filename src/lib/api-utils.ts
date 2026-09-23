import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function zodErrorResponse(error: ZodError) {
  return jsonError("Invalid request data", 422, { issues: error.issues.map((i) => ({ path: i.path, message: i.message })) });
}

export function isUnauthenticatedError(error: unknown): boolean {
  return error instanceof Error && error.name === "UnauthenticatedError";
}

export function isAdminRequiredError(error: unknown): boolean {
  return error instanceof Error && error.name === "AdminRequiredError";
}

export async function requestIp(request: Request): Promise<string | null> {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? null;
}
