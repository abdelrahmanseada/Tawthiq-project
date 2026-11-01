/**
 * Server-side role-based access control. The UI hides what a role cannot do, but
 * every page, Server Action and Route Handler re-checks permissions here.
 */
export type Role = "PLATFORM_ADMIN" | "SUPER_ADMIN" | "ADMIN" | "VIEWER";

export type Permission =
  | "dashboard.view"
  | "employees.read"
  | "employees.write"
  | "cards.read"
  | "cards.write"
  | "imports.manage"
  | "logs.scans"
  | "logs.audit"
  | "settings.manage"
  | "admins.manage";

const ALL_ROLES: readonly Role[] = ["SUPER_ADMIN", "ADMIN", "VIEWER"];
const MANAGERS: readonly Role[] = ["SUPER_ADMIN", "ADMIN"];
const SUPER_ONLY: readonly Role[] = ["SUPER_ADMIN"];

const PERMISSION_MATRIX: Record<Permission, readonly Role[]> = {
  "dashboard.view": ALL_ROLES,
  "employees.read": ALL_ROLES,
  "employees.write": MANAGERS,
  "cards.read": ALL_ROLES,
  "cards.write": MANAGERS,
  "imports.manage": MANAGERS,
  "logs.scans": ALL_ROLES,
  "logs.audit": MANAGERS,
  "settings.manage": SUPER_ONLY,
  "admins.manage": SUPER_ONLY,
};

export class ForbiddenError extends Error {
  readonly status = 403;
  readonly code = "FORBIDDEN";
  constructor(message = "You do not have permission to perform this action") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function can(role: Role, permission: Permission): boolean {
  if (role === "PLATFORM_ADMIN") return false;
  return PERMISSION_MATRIX[permission].includes(role);
}

export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) throw new ForbiddenError();
}

export function permissionsFor(role: Role): Permission[] {
  return (Object.keys(PERMISSION_MATRIX) as Permission[]).filter((permission) => can(role, permission));
}

export function roleLabel(role: Role): string {
  return role === "SUPER_ADMIN" ? "Owner" : role === "PLATFORM_ADMIN" ? "Platform admin" : role === "ADMIN" ? "Admin" : "Viewer";
}
