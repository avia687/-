// Role-based access control. Roles are ordered; a role inherits every
// permission of the roles below it. Enforced server-side (see tenant.ts).

export const ROLES = ["EMPLOYEE", "MANAGER", "ADMIN", "OWNER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "בעלים",
  ADMIN: "מנהל",
  MANAGER: "אחראי",
  EMPLOYEE: "עובד",
};

export type Permission =
  | "customers:read"
  | "customers:write"
  | "leads:read"
  | "leads:write"
  | "quotes:read"
  | "quotes:write"
  | "services:read"
  | "services:write"
  | "jobs:read"
  | "jobs:write"
  | "payments:read"
  | "payments:write"
  | "expenses:read"
  | "expenses:write"
  | "reviews:read"
  | "reviews:write"
  | "employees:read"
  | "employees:write"
  | "settings:read"
  | "settings:write"
  | "marketing:read"
  | "ai:use";

// Minimum role required for each permission.
const REQUIRED: Record<Permission, Role> = {
  "customers:read": "EMPLOYEE",
  "customers:write": "EMPLOYEE",
  "leads:read": "EMPLOYEE",
  "leads:write": "EMPLOYEE",
  "quotes:read": "EMPLOYEE",
  "quotes:write": "MANAGER",
  "services:read": "EMPLOYEE",
  "services:write": "MANAGER",
  "jobs:read": "EMPLOYEE",
  "jobs:write": "EMPLOYEE",
  "payments:read": "MANAGER",
  "payments:write": "MANAGER",
  "expenses:read": "MANAGER",
  "expenses:write": "MANAGER",
  "reviews:read": "EMPLOYEE",
  "reviews:write": "MANAGER",
  "employees:read": "MANAGER",
  "employees:write": "ADMIN",
  "settings:read": "MANAGER",
  "settings:write": "ADMIN",
  "marketing:read": "MANAGER",
  "ai:use": "EMPLOYEE",
};

function rank(role: string): number {
  const i = ROLES.indexOf(role as Role);
  return i === -1 ? 0 : i;
}

export function can(role: string, permission: Permission): boolean {
  return rank(role) >= rank(REQUIRED[permission]);
}

export function atLeast(role: string, minimum: Role): boolean {
  return rank(role) >= rank(minimum);
}
