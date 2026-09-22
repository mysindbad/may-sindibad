import "server-only";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface StoredFile {
  url: string;
  path: string;
}

export class UploadStorageUnavailableError extends Error {
  constructor() {
    super("Production upload storage is not configured.");
    this.name = "UploadStorageUnavailableError";
  }
}

export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB
// Multipart envelope allowance. The file itself is still limited to 5MB below.
export const MAX_UPLOAD_REQUEST_BYTES = 6 * 1024 * 1024; // 6MB total request

export interface UploadValidationError {
  code: "invalid_type" | "too_large" | "signature_mismatch";
  message: string;
}

export function validateUpload(file: { type: string; size: number }): UploadValidationError | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return { code: "invalid_type", message: "Only JPEG, PNG or WEBP images are allowed." };
  if (file.size <= 0) return { code: "invalid_type", message: "The uploaded file is empty." };
  if (file.size > MAX_UPLOAD_BYTES) return { code: "too_large", message: "File exceeds the 5MB limit." };
  return null;
}

export function validateImageSignature(buffer: Buffer, mimeType: string): UploadValidationError | null {
  if (mimeType === "image/png") {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buffer.length < signature.length || !buffer.subarray(0, signature.length).equals(signature)) {
      return { code: "signature_mismatch", message: "File content does not match its PNG type." };
    }
  } else if (mimeType === "image/jpeg") {
    if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
      return { code: "signature_mismatch", message: "File content does not match its JPEG type." };
    }
  } else if (mimeType === "image/webp") {
    const riff = buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
    if (!riff) return { code: "signature_mismatch", message: "File content does not match its WEBP type." };
  }
  return null;
}

function extensionFor(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

/** Local filesystem uploads are a development/testing adapter only. */
export function isUploadStorageConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production";
}

/**
 * Development filesystem storage. Production fails closed until a durable,
 * privacy-safe object-storage adapter is configured; silently writing to an
 * ephemeral deployment filesystem would create broken media and data-loss.
 */
export async function saveUpload(buffer: Buffer, mimeType: string, ownerType: string, ownerId: string): Promise<StoredFile> {
  if (!isUploadStorageConfigured()) throw new UploadStorageUnavailableError();

  const safeOwnerType = ownerType.replace(/[^a-z0-9_-]/gi, "");
  const safeOwnerId = ownerId.replace(/[^a-z0-9-]/gi, "");
  const dir = path.join(process.cwd(), "public", "uploads", safeOwnerType, safeOwnerId);
  await mkdir(dir, { recursive: true });

  const filename = `${randomUUID()}.${extensionFor(mimeType)}`;
  const fullPath = path.join(dir, filename);
  await writeFile(fullPath, buffer, { flag: "wx" });

  return { url: `/uploads/${safeOwnerType}/${safeOwnerId}/${filename}`, path: fullPath };
}

/**
 * Remove a stored file, whichever adapter wrote it.
 *
 * The seam the object-storage adapter plugs into: a remote URL is recognised
 * here and handed to that adapter once one is configured. Until then a remote
 * URL cannot exist, because saveUpload refuses to write in production, so the
 * local branch is the only reachable one. Callers treat deletion as
 * best-effort — the database row is what makes media visible.
 */
export async function deleteUpload(url: string): Promise<void> {
  if (url.startsWith("/uploads/")) {
    await deleteLocalStoredUpload(url);
    return;
  }
  // Remote object storage is not configured; nothing else can have written it.
}

/** Best-effort cleanup for files created by the local filesystem adapter. */
export async function deleteLocalStoredUpload(url: string): Promise<void> {
  if (!url.startsWith("/uploads/")) return;
  const relative = url.slice(1).replace(/\\/g, "/");
  if (relative.split("/").includes("..")) return;

  const uploadsRoot = path.resolve(process.cwd(), "public", "uploads");
  const fullPath = path.resolve(process.cwd(), "public", relative);
  if (!fullPath.startsWith(`${uploadsRoot}${path.sep}`)) return;

  try {
    await unlink(fullPath);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code !== "ENOENT") throw error;
  }
}
