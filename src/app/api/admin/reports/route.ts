import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { isUnauthenticatedError, jsonError } from "@/lib/api-utils";

// Reports could be filed (POST /api/reports) but never reviewed: there was no
// GET/PATCH anywhere that surfaced them, even via a raw API call. This list
// endpoint is the read side of that gap; PATCH /api/admin/reports/[id]
// resolves an individual report.
export async function GET(request) {
  try {
    const user = await requireUser();
    if (user.role !== "admin") return jsonError("Administrator access is required.", 403);

    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status");
    const status = statusParam && ["open", "reviewed", "dismissed", "actioned"].includes(statusParam) ? statusParam : "open";

    const rows = await db
      .select()
      .from(reports)
      .where(eq(reports.status, status))
      .orderBy(desc(reports.createdAt))
      .limit(100);

    return NextResponse.json({ reports: rows });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
