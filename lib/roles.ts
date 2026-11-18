/**
 * Staff roles. Mirrors role_rank() / set_member_role() in the database, which is what
 * actually enforces these rules; this file only decides which buttons to show.
 *
 *   superadmin  sets owners and co-admins
 *   owner       sets co-admins
 *   admin       co-admin / front desk / guard: desk work only
 *   member      everyone else
 */
export type Role = "member" | "admin" | "owner" | "superadmin";

export const ROLE_RANK: Record<Role, number> = { member: 0, admin: 1, owner: 2, superadmin: 3 };

export const ROLE_LABEL: Record<Role, string> = {
  member: "Member",
  admin: "Co-admin",
  owner: "Owner",
  superadmin: "Super admin",
};

export const ROLE_HINT: Record<Role, string> = {
  member: "Checks their own membership and clocks in.",
  admin: "Front desk work: renewals, walk-ins, attendance, QR. Can't change anyone's access.",
  owner: "Everything at the front desk, plus adding and removing co-admins.",
  superadmin: "Everything, plus setting owners.",
};

const rank = (r: string | null | undefined) => ROLE_RANK[(r as Role) ?? "member"] ?? 0;

/**
 * The super admin is invisible to everyone else (owners and co-admins see them as a
 * regular member). Use this for anything shown on screen.
 */
export function visibleRole(role: Role, viewer: Role | null): Role {
  return role === "superadmin" && viewer !== "superadmin" ? "member" : role;
}

/** Any staff role (co-admin and up) uses the front desk screens. */
export const isStaff = (r: string | null | undefined) => rank(r) >= 1;

/** Can `actor` edit / turn off / reset the PIN of an account with role `target`? */
export const canManage = (actor: string | null | undefined, target: string | null | undefined) =>
  rank(actor) >= 1 && rank(actor) > rank(target);

/** Roles `actor` may give to someone (always below the actor's own). Empty = can't change roles. */
export function assignableRoles(actor: string | null | undefined): Role[] {
  if (rank(actor) < 2) return [];
  return (Object.keys(ROLE_RANK) as Role[]).filter((r) => ROLE_RANK[r] < rank(actor));
}
