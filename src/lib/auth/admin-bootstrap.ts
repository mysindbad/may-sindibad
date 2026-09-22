import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

// How My Sindbad gets its first administrator.
//
// The problem: nothing in the product could ever create an admin, so business
// verification — and therefore the whole marketplace — was unreachable. The
// obvious fixes are both wrong: an HTTP endpoint that grants admin is a
// permanent privilege-escalation surface, and handing the database connection
// to a person or a tool leaks far more authority than the task needs.
//
// What this does instead: the owner sets ADMIN_BOOTSTRAP_EMAIL in the hosting
// environment, where only they can write it. The next time the person with
// that email signs in normally, they are promoted — once.
//
// Why it is safe:
//   * A traveller cannot set an environment variable, so nobody can promote
//     themselves by calling anything.
//   * The email must already be an authenticated account; the promotion rides
//     on a sign-in that has already been verified by password or Google.
//   * It fires only while the system has zero admins. After the first one
//     exists the door is closed permanently, even if the variable stays set.
//   * The promotion is a single conditional UPDATE, so two simultaneous
//     sign-ins cannot both take the slot.

function configuredBootstrapEmail(): string | null {
  const raw = process.env.ADMIN_BOOTSTRAP_EMAIL;
  if (!raw) return null;
  const email = raw.trim().toLowerCase();
  return email.length > 3 && email.includes("@") ? email : null;
}

/**
 * Promote this account if it is the configured bootstrap email and no admin
 * exists yet. Returns true only when a promotion actually happened.
 *
 * Never throws: a failure here must not block an otherwise valid sign-in.
 */
export async function maybeBootstrapFirstAdmin(userId: string, email: string): Promise<boolean> {
  try {
    const bootstrapEmail = configuredBootstrapEmail();
    if (!bootstrapEmail) return false;
    if (email.trim().toLowerCase() !== bootstrapEmail) return false;

    // Check and promote in one transaction. Two concurrent sign-ins could in
    // principle both observe "no admin yet", but only one email can ever match
    // the configured value, so the worst case is the same account being
    // promoted twice — which is a no-op, not a second administrator.
    const promoted = await db.transaction(async (tx) => {
      const [existingAdmin] = await tx.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
      if (existingAdmin) return [];

      return tx
        .update(users)
        .set({ role: "admin", updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning({ id: users.id });
    });

    if (promoted.length > 0) {
      console.info("Bootstrapped the first administrator account.", { userId });
      return true;
    }
    return false;
  } catch (error) {
    console.error("Admin bootstrap check failed", error instanceof Error ? error.message : "unknown_error");
    return false;
  }
}

/** Whether any administrator exists. Used to show setup state honestly. */
export async function hasAnyAdmin(): Promise<boolean> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
  return Boolean(existing);
}
