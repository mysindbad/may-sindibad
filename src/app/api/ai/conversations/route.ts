import { NextResponse } from "next/server";
import { and, eq, isNull, desc } from "drizzle-orm";
import { db } from "@/db";
import { aiConversations } from "@/db/schema";
import { getOwnerContext } from "@/lib/auth/owner-context";
import { toClientConversationView } from "@/lib/ai/client-view";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId, guestId } = await getOwnerContext();
  if (!userId && !guestId) return NextResponse.json({ conversations: [] });
  const filter = userId ? eq(aiConversations.userId, userId) : and(isNull(aiConversations.userId), eq(aiConversations.guestId, guestId!));
  const rows = await db.select().from(aiConversations).where(filter).orderBy(desc(aiConversations.updatedAt)).limit(20);
  return NextResponse.json({ conversations: rows.map(toClientConversationView) });
}
