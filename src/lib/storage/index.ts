import "server-only";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

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

interface S3UploadConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  forcePathStyle: boolean;
}

/**
 * All seven pieces the S3-compatible adapter needs, or null if any is
 * missing. Partial configuration is treated as unconfigured rather than
 * guessed at, so a typo'd variable name fails closed instead of silently
 * falling back to local disk.
 */
function readS3Config(env: NodeJS.ProcessEnv = process.env): S3UploadConfig | null {
  const endpoint = env.UPLOADS_S3_ENDPOINT;
  const region = env.UPLOADS_S3_REGION;
  const bucket = env.UPLOADS_S3_BUCKET;
  const accessKeyId = env.UPLOADS_S3_ACCESS_KEY_ID;
  const secretAccessKey = env.UPLOADS_S3_SECRET_ACCESS_KEY;
  const publicBaseUrl = env.UPLOADS_PUBLIC_BASE_URL;
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) return null;
  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ""),
    forcePathStyle: env.UPLOADS_S3_FORCE_PATH_STYLE === "true",
  };
}

let cachedClient: S3Client | null = null;
let cachedClientKey = "";

/** One client reused across requests; env vars are fixed for the life of the process. */
function s3ClientFor(config: S3UploadConfig): S3Client {
  const key = `${config.endpoint}|${config.region}|${config.forcePathStyle}|${config.accessKeyId}`;
  if (cachedClient && cachedClientKey === key) return cachedClient;
  cachedClient = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  cachedClientKey = key;
  return cachedClient;
}

/** Whether uploads can be written: the S3 adapter in any environment, or local disk outside production. */
export function isUploadStorageConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return readS3Config(env) !== null || env.NODE_ENV !== "production";
}

/**
 * S3-compatible object storage when UPLOADS_S3_* is configured (works against
 * real S3 or any S3-compatible endpoint - R2, Spaces, MinIO, B2 - via
 * UPLOADS_S3_ENDPOINT and the optional path-style flag some of those need).
 * Otherwise a development-only local filesystem fallback. Production without
 * S3 configured fails closed instead of writing to the deployment's ephemeral
 * disk, which would produce broken media and silent data loss on redeploy.
 */
export async function saveUpload(buffer: Buffer, mimeType: string, ownerType: string, ownerId: string): Promise<StoredFile> {
  const safeOwnerType = ownerType.replace(/[^a-z0-9_-]/gi, "");
  const safeOwnerId = ownerId.replace(/[^a-z0-9-]/gi, "");
  const filename = `${randomUUID()}.${extensionFor(mimeType)}`;

  const s3Config = readS3Config();
  if (s3Config) {
    const key = `${safeOwnerType}/${safeOwnerId}/${filename}`;
    const client = s3ClientFor(s3Config);
    await client.send(
      new PutObjectCommand({ Bucket: s3Config.bucket, Key: key, Body: buffer, ContentType: mimeType, ContentLength: buffer.length }),
    );
    return { url: `${s3Config.publicBaseUrl}/${key}`, path: key };
  }

  if (process.env.NODE_ENV === "production") throw new UploadStorageUnavailableError();

  const dir = path.join(process.cwd(), "public", "uploads", safeOwnerType, safeOwnerId);
  await mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, filename);
  await writeFile(fullPath, buffer, { flag: "wx" });

  return { url: `/uploads/${safeOwnerType}/${safeOwnerId}/${filename}`, path: fullPath };
}

/**
 * Remove a stored file, whichever adapter wrote it: local path prefix or the
 * configured S3 public base URL. Callers treat deletion as best-effort - the
 * database row is what makes media visible, so a storage-side failure here
 * must not surface as a failed delete.
 */
export async function deleteUpload(url: string): Promise<void> {
  if (url.startsWith("/uploads/")) {
    await deleteLocalStoredUpload(url);
    return;
  }

  const s3Config = readS3Config();
  if (s3Config && url.startsWith(`${s3Config.publicBaseUrl}/`)) {
    const key = url.slice(s3Config.publicBaseUrl.length + 1);
    if (!key || key.split("/").includes("..")) return;
    const client = s3ClientFor(s3Config);
    await client.send(new DeleteObjectCommand({ Bucket: s3Config.bucket, Key: key }));
    return;
  }
  // Unrecognised URL: neither adapter can have written it, nothing to do.
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
