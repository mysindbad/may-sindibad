import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { isAdminRequiredError, isUnauthenticatedError, jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";
import { isGoogleShortLink, isKnownMapHost, parseLocationInput } from "@/lib/places/map-link";
import { resolveGoogleShortLink } from "@/lib/places/short-link";

const bodySchema = z.object({ input: z.string().min(1).max(2000) });

// Reads coordinates out of what an admin pasted (Google Maps / OSM link,
// "lat, lng"). No geocoding service is called: a link without coordinates is
// reported as such, never guessed. The editor shows the result on a map for
// confirmation before anything is saved.
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const admin = await requireAdmin();

    const rate = await checkRateLimit(clientKeyFromRequest(request, "admin-place-locate:" + admin.id), 120, 60 * 60 * 1000);
    if (!rate.allowed) return jsonError("Too many lookups. Please slow down.", 429);

    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const parsed = bodySchema.safeParse(json.body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    let text = parsed.data.input.trim();
    if (isGoogleShortLink(text)) {
      const expanded = await resolveGoogleShortLink(text);
      if (!expanded) return jsonError("The short link could not be opened. Paste the full Google Maps link or the coordinates.", 422, { reason: "short_link_unresolved" });
      text = expanded;
    }

    const result = parseLocationInput(text);
    if (!result.ok) return jsonError("No exact coordinates could be read from this input.", 422, { reason: result.reason });

    return NextResponse.json({
      location: result.location,
      // The (expanded) link is only echoed back if it is a known maps host.
      mapUrl: isKnownMapHost(text) ? text : null,
    });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    if (isAdminRequiredError(error)) return jsonError("Administrator access is required.", 403);
    throw error;
  }
}
