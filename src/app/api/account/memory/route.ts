import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { isUnauthenticatedError, jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { forgetAllMemories, forgetMemory, listMemories } from "@/lib/memory/user-memory";

// The traveller's own view of what Sindbad remembers about them, and the
// ability to erase any of it. Memory that a person cannot inspect or delete is
// surveillance, not personalisation.

export const dynamic = "force-dynamic";

const deleteSchema = z.object({
  memoryId: z.string().uuid().optional(),
  all: z.boolean().optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    const memories = await listMemories(user.id);
    return NextResponse.json({
      memories: memories.map((memory) => ({
        id: memory.id,
        kind: memory.kind,
        key: memory.key,
        value: memory.value,
        source: memory.source,
      })),
    });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}

export async function DELETE(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();

    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const parsed = deleteSchema.safeParse(json.body ?? {});
    if (!parsed.success) return zodErrorResponse(parsed.error);

    if (parsed.data.all) {
      const removed = await forgetAllMemories(user.id);
      return NextResponse.json({ removed });
    }

    if (!parsed.data.memoryId) return jsonError("Specify which memory to forget.", 422);

    const removed = await forgetMemory(user.id, parsed.data.memoryId);
    if (!removed) return jsonError("That memory was not found.", 404);
    return NextResponse.json({ removed: 1 });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
