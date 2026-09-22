import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { media } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { isUnauthenticatedError, jsonError } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { resolveAuthorizedUploadOwner, type UploadOwnerType } from "@/lib/domain/entity-access";
import { deleteUpload } from "@/lib/storage";

// Media could be uploaded but never removed, which left a traveller unable to
// take back a photo they had second thoughts about.
//
// Who may delete: the person who uploaded it, whoever currently owns the thing
// it is attached to (re-checked now, not trusted from upload time), or a
// moderator. The database row goes first: an orphaned file in storage is
// harmless, while a row pointing at a deleted file would render as a broken
// image.

export const dynamic = "force-dynamic";

const UPLOAD_OWNER_TYPES: UploadOwnerType[] = ["place", "provider", "review", "contribution", "avatar"];

function isUploadOwnerType(value: string): value is UploadOwnerType {
  return (UPLOAD_OWNER_TYPES as string[]).includes(value);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const { id } = await context.params;

    const [row] = await db
      .select({
        id: media.id,
        url: media.url,
        ownerType: media.ownerType,
        ownerId: media.ownerId,
        uploadedByUserId: media.uploadedByUserId,
      })
      .from(media)
      .where(eq(media.id, id))
      .limit(1);
    if (!row) return jsonError("Media not found.", 404);

    let allowed = row.uploadedByUserId === user.id || user.role === "admin";

    if (!allowed && isUploadOwnerType(row.ownerType)) {
      // Ownership is re-derived now rather than trusted from upload time, so a
      // business that changed hands cannot be edited by its former owner.
      const authorizedOwnerId = await resolveAuthorizedUploadOwner(user.id, row.ownerType, row.ownerId);
      allowed = authorizedOwnerId === row.ownerId;
    }

    if (!allowed) return jsonError("You don't have permission to remove this media.", 403);

    await db.delete(media).where(eq(media.id, id));

    // Best-effort: the record is already gone, so a storage failure here must
    // not surface as a failed delete to the traveller.
    try {
      await deleteUpload(row.url);
    } catch (error) {
      console.warn("Media row deleted but the stored file could not be removed", error instanceof Error ? error.message : "unknown_error");
    }

    return NextResponse.json({ removed: id });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
