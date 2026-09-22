import { NextResponse } from "next/server";
import { loadUpload } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (!path || path.length === 0 || path.some((segment) => segment.includes("..") || segment.includes("/"))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const file = await loadUpload(path.join("/"));
  if (!file) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(file.stream, {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      ...(file.contentLength !== undefined ? { "Content-Length": String(file.contentLength) } : {}),
    },
  });
}
