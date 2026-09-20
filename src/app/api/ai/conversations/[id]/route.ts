import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiConversations, aiMessages } from "@/db/schema";
import { getOwnerContext } from "@/lib/auth/owner-context";
import { jsonError } from "@/lib/api-utils";
import { toClientConversationView, toClientMessageView } from "@/lib/ai/client-view";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const owner = await getOwnerContext();

  const [conversation] = await db.select().from(aiConversations).where(eq(aiConversations.id, id)).limit(1);
  if (!conversation) return jsonError("Conversation not found.", 404);

  // A read-only request may legitimately have no guest cookie yet. Never let
  // `null === null` turn an ownerless legacy/corrupt conversation into public
  // data. Guests must present the exact opaque guest id that owns the record.
  const owns = owner.userId
    ? conversation.userId === owner.userId
    : Boolean(owner.guestId) && conversation.userId === null && conversation.guestId === owner.guestId;
  if (!owns) return jsonError("You don't have permission to view this conversation.", 403);

  const messages = await db.select().from(aiMessages).where(eq(aiMessages.conversationId, id)).orderBy(asc(aiMessages.createdAt));
  return NextResponse.json({ conversation: toClientConversationView(conversation), messages: messages.map(toClientMessageView) });
}
