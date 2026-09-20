/**
 * Read a Web Request body while enforcing a hard byte ceiling before a parser
 * such as Request.formData() gets a chance to buffer an arbitrarily large body.
 *
 * This is application-level defense in depth. Production ingress/proxy limits
 * should still reject oversized requests before they reach the Node process.
 */
export class RequestBodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Request body exceeds the ${maxBytes}-byte limit.`);
    this.name = "RequestBodyTooLargeError";
  }
}

function parseDeclaredContentLength(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function readRequestBodyWithLimit(request: Request, maxBytes: number): <<UPromiseint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new TypeError("maxBytes must be a positive safe integer.");

  const declaredLength = parseDeclaredContentLength(request.headers.get("content-length"));
  if (declaredLength !== null && declaredLength > maxBytes) throw new RequestBodyTooLargeError(maxBytes);
  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("request body limit exceeded").catch(() => undefined);
        throw new RequestBodyTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}


export class ResponseBodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Response body exceeds the ${maxBytes}-byte limit.`);
    this.name = "ResponseBodyTooLargeError";
  }
}

export async function readResponseBodyWithLimit(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new TypeError("maxBytes must be a positive safe integer.");

  const declaredLength = parseDeclaredContentLength(response.headers.get("content-length"));
  if (declaredLength !== null && declaredLength > maxBytes) throw new ResponseBodyTooLargeError(maxBytes);
  if (!response.body) return new Uint8Array(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("response body limit exceeded").catch(() => undefined);
        throw new ResponseBodyTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

export async function parseJsonResponseWithLimit<T>(response: Response, maxBytes: number): Promise<T> {
  const body = await readResponseBodyWithLimit(response, maxBytes);
  return JSON.parse(new TextDecoder().decode(body)) as T;
}

export const DEFAULT_JSON_BODY_LIMIT_BYTES = 128 * 1024;

export type BoundedJsonParseResult =
  | { ok: true; body: unknown }
  | { ok: false; reason: "too_large"; maxBytes: number };

/**
 * Parse a JSON request only after the raw byte stream has been bounded.
 *
 * Malformed/empty JSON intentionally resolves to `null` to preserve the
 * existing API behavior where Zod returns the normal invalid-request response.
 * Oversized bodies are distinguished so routes can return HTTP 413 without
 * buffering the attacker-controlled payload first.
 */
export async function parseJsonBodyWithLimit(
  request: Request,
  maxBytes = DEFAULT_JSON_BODY_LIMIT_BYTES,
): Promise<BoundedJsonParseResult> {
  try {
    const body = await readRequestBodyWithLimit(request, maxBytes);
    const text = new TextDecoder().decode(body);
    try {
      return { ok: true, body: JSON.parse(text) };
    } catch {
      return { ok: true, body: null };
    }
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return { ok: false, reason: "too_large", maxBytes };
    }
    throw error;
  }
}

export async function parseMultipartFormDataWithLimit(request: Request, maxBytes: number): Promise<FormData> {
  const body = await readRequestBodyWithLimit(request, maxBytes);
  const headers = new Headers(request.headers);
  // Let the reconstructed Request describe the bounded in-memory body itself.
  // The multipart content-type/boundary remains untouched.
  headers.delete("content-length");

  const bounded = new Request(request.url, {
    method: request.method,
    headers,
    body,
  });
  return bounded.formData();
}
