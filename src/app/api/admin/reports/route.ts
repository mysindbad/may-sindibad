import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { isAdminRequiredError, isUnauthenticatedError, jsonError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    await requireAdmin();

    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status");
    const status = statusParam && ["open", "reviewed", "dismissed", "actioned"].includes(statusParam)
      ? (statusParam as "open" | "reviewed" | "dismissed" | "actioned")
      : "open";

    const rows = await db
      .select()
      .from(reports)
      .where(eq(reports.status, status))
      .orderBy(desc(reports.createdAt))
      .limit(100);

    return NextResponse.json({ reports: rows });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    if (isAdminRequiredError(error)) return jsonError("Administrator access is required.", 403);
    throw error;
  }
}
