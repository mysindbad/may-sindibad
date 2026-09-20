import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { deleteLocalStoredUpload, MAX_UPLOAD_REQUEST_BYTES, saveUpload, UploadStorageUnavailableError, validateImageSignature, validateUpload } from "@/lib/storage";
import { media } from "@/db/schema";
import { db } from "@/db";
import { uploadRequestSchema } from "@/lib/validation";
import { isUnauthenticatedError, jsonError } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";
import { resolveAuthorizedUploadOwner } from "@/lib/domain/entity-access";
import { parseMultipartFormDataWithLimit, RequestBodyTooLargeError } from "@/lib/http/bounded-body";

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const rate = await checkRateLimit(clientKeyFromRequest(request, `upload:${user.id}`), 30, 60 * 60 * 1000);
    if (!rate.allowed) return jsonError("Too many uploads. Please slow down.", 429);

    const formData = await parseMultipartFormDataWithLimit(request, MAX_UPLOAD_REQUEST_BYTES);
    const file = formData.get("file");
    const ownerType = formData.get("ownerType");
    const ownerId = formData.get("ownerId");

    if (!(file instanceof File)) return jsonError("No file provided.", 400);

    const parsed = uploadRequestSchema.safeParse({ ownerType, ownerId: ownerId || undefined });
    if (!parsed.success) return jsonError("Invalid upload target.", 422);

    const targetOwnerId = await resolveAuthorizedUploadOwner(user.id, parsed.data.ownerType, parsed.data.ownerId);
    if (!targetOwnerId) return jsonError("You don't have permission to upload media to this target.", 403);

    const validationError = validateUpload({ type: file.type, size: file.size });
    if (validationError) return jsonError(validationError.message, 422, { code: validationError.code });

    const buffer = Buffer.from(await file.arrayBuffer());
    const signatureError = validateImageSignature(buffer, file.type);
    if (signatureError) return jsonError(signatureError.message, 422, { code: signatureError.code });

    const stored = await saveUpload(buffer, file.type, parsed.data.ownerType, targetOwnerId);

    try {
      const [record] = await db
        .insert(media)
        .values({ ownerType: parsed.data.ownerType, ownerId: targetOwnerId, url: stored.url, kind: "image", uploadedByUserId: user.id })
        .returning();

      return NextResponse.json(
        {
          media: {
            id: record.id,
            ownerType: record.ownerType,
            ownerId: record.ownerId,
            url: record.url,
            kind: record.kind,
            createdAt: record.createdAt,
          },
        },
        { status: 201 },
      );
    } catch (error) {
      // Keep the local development adapter consistent with the database. If the
      // media row cannot be persisted, best-effort remove the just-written file
      // instead of leaving an untracked orphan on disk. Cleanup failure must not
      // hide the authoritative database error.
      try {
        await deleteLocalStoredUpload(stored.url);
      } catch (cleanupError) {
        console.error("Failed to clean up orphaned local upload after media insert failure", cleanupError);
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return jsonError("Upload request is too large.", 413, { code: "request_too_large" });
    if (error instanceof UploadStorageUnavailableError) {
      return jsonError("Image storage is not configured for this environment.", 503, { code: "storage_unavailable" });
    }
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
