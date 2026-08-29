/**
 * Canonical blocked-time scope semantics, shared by the availability engine,
 * the admin in-memory conflict checks, and (mirrored in SQL) the repository's
 * blocked-time overlap query. Client code keeps its own mirror in
 * src/admin/admin-utils.ts (blockedTimeAppliesToBarberLocation); a parity test
 * pins the two together.
 *
 * Rules:
 * - scope "business": blocks every barber at every location.
 * - scope "location": blocks every barber, but only at that location.
 * - scope "barber": blocks only that barber — everywhere when the row has no
 *   location, otherwise only at the row's location.
 */
export interface BlockedTimeScopeInput {
    scope: "business" | "location" | "barber";
    barberId?: string | null;
    locationId?: string | null;
}

export function blockedTimeAppliesToBarberAtLocation(
    blockedTime: BlockedTimeScopeInput,
    barberId: string,
    locationId: string,
): boolean {
    if (blockedTime.scope === "business") {
        return true;
    }

    if (blockedTime.scope === "location") {
        return blockedTime.locationId === locationId;
    }

    return (
        blockedTime.barberId === barberId &&
        (!blockedTime.locationId || blockedTime.locationId === locationId)
    );
}
