// Pure logic describing how guest-owned records should be re-attached to a
// user account after signup/login, so no locally created trip data is lost.
export interface GuestOwnedRecord {
  id: string;
  userId: string | null;
  guestId: string | null;
}

export interface MigrationPlan {
  idsToClaim: string[];
}

/**
 * Given a set of records that may belong to a guest session, return the ids
 * that should be re-assigned to `userId`. A record is only claimed when it
 * currently has no owning user (never overwrite another user's data) and its
 * guestId matches the guest session being migrated.
 */
export function planGuestMigration(records: GuestOwnedRecord[], guestId: string): MigrationPlan {
  const idsToClaim = records
    .filter((record) => record.userId === null && record.guestId === guestId)
    .map((record) => record.id);
  return { idsToClaim };
}
