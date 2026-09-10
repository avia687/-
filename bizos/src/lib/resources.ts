import { z } from "zod";
import type { Permission } from "@/lib/rbac";

// Central resource definitions shared by list/create and [id] routes so the
// CRUD config lives outside the route files (which may only export handlers).

const isoDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string())
  .transform((s) => new Date(s));

export const servicesCfg = {
  model: "service" as const,
  readPerm: "services:read" as Permission,
  writePerm: "services:write" as Permission,
  createSchema: z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(1000).nullish(),
    category: z.string().max(80).nullish(),
    price: z.number().min(0).default(0),
    cost: z.number().min(0).default(0),
    durationMin: z.number().int().min(0).default(60),
    active: z.boolean().default(true),
  }),
  get updateSchema() {
    return this.createSchema.partial();
  },
  searchFields: ["name", "category"],
  orderBy: { createdAt: "desc" as const },
};

export const leadsCfg = {
  model: "lead" as const,
  readPerm: "leads:read" as Permission,
  writePerm: "leads:write" as Permission,
  createSchema: z.object({
    title: z.string().min(1).max(160),
    customerId: z.string().nullish(),
    contactName: z.string().max(120).nullish(),
    contactPhone: z.string().max(40).nullish(),
    source: z.string().max(80).nullish(),
    status: z.string().max(40).default("new"),
    value: z.number().min(0).default(0),
    probability: z.number().int().min(0).max(100).default(50),
    notes: z.string().max(2000).nullish(),
  }),
  get updateSchema() {
    return this.createSchema.partial();
  },
  searchFields: ["title", "contactName", "contactPhone"],
  orderBy: { createdAt: "desc" as const },
};

export const expensesCfg = {
  model: "expense" as const,
  readPerm: "expenses:read" as Permission,
  writePerm: "expenses:write" as Permission,
  createSchema: z.object({
    category: z.string().max(40).default("other"),
    description: z.string().max(500).nullish(),
    amount: z.number().min(0).default(0),
    receipt: z.string().nullish(),
    spentAt: isoDate.optional(),
  }),
  get updateSchema() {
    return z
      .object({
        category: z.string().max(40),
        description: z.string().max(500).nullish(),
        amount: z.number().min(0),
        spentAt: isoDate,
      })
      .partial();
  },
  searchFields: ["description", "category"],
  orderBy: { spentAt: "desc" as const },
};

export const employeesCfg = {
  model: "employee" as const,
  readPerm: "employees:read" as Permission,
  writePerm: "employees:write" as Permission,
  createSchema: z.object({
    name: z.string().min(1).max(120),
    phone: z.string().max(40).nullish(),
    role: z.enum(["OWNER", "ADMIN", "MANAGER", "EMPLOYEE"]).default("EMPLOYEE"),
    title: z.string().max(80).nullish(),
    hourlyRate: z.number().min(0).default(0),
    active: z.boolean().default(true),
  }),
  get updateSchema() {
    return this.createSchema.partial();
  },
  searchFields: ["name", "title"],
  orderBy: { createdAt: "desc" as const },
};
