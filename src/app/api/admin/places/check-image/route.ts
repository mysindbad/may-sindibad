import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { isAdminRequiredError, isUnauthenticatedError, jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";
import { verifyRemoteImage } from "@/lib/places/remote-image";

const bodySchema = z.object({ url: z.string().min(1).max(500) });

// Lets the editor verify a pasted image URL (public https host, real
// JPEG/PNG/WEBP, within the upload size limit) before the admin saves it.
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const admin = await requireAdmin();

    const rate = await checkRateLimit(clientKeyFromRequest(request, "admin-place-image-check:" + admin.id), 60, 60 * 60 * 1000);
    if (!rate.allowed) return jsonError("Too many image checks. Please slow down.", 429);

    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const parsed = bodySchema.safeParse(json.body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    const result = await verifyRemoteImage(parsed.data.url);
    if (!result.ok) return jsonError("The image could not be verified.", 422, { reason: result.reason });

    return NextResponse.json({ ok: true, contentType: result.contentType, bytes: result.bytes });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    if (isAdminRequiredError(error)) return jsonError("Administrator access is required.", 403);
    throw error;
  }
}
