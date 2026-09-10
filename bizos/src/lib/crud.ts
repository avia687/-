import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import type { Permission } from "@/lib/rbac";

// Generic tenant-scoped CRUD for straightforward resources. Every query is
// filtered by organizationId so tenant isolation holds automatically.

type ModelName =
  | "service"
  | "lead"
  | "expense"
  | "employee"
  | "payment"
  | "job"
  | "review";

type CrudConfig<C extends z.ZodTypeAny, U extends z.ZodTypeAny> = {
  model: ModelName;
  readPerm: Permission;
  writePerm: Permission;
  createSchema: C;
  updateSchema: U;
  searchFields?: string[];
  orderBy?: Record<string, "asc" | "desc">;
  include?: Record<string, unknown>;
  transform?: (data: z.infer<C>) => Record<string, unknown>;
};

function delegate(model: ModelName) {
  return (prisma as unknown as Record<string, any>)[model];
}

export function crudList<C extends z.ZodTypeAny, U extends z.ZodTypeAny>(cfg: CrudConfig<C, U>) {
  return async (req: Request) => {
    try {
      const tenant = await requirePermission(cfg.readPerm);
      const q = new URL(req.url).searchParams.get("q")?.trim();
      const where: Record<string, unknown> = { organizationId: tenant.organizationId };
      if (q && cfg.searchFields?.length) {
        where.OR = cfg.searchFields.map((f) => ({ [f]: { contains: q } }));
      }
      const rows = await delegate(cfg.model).findMany({
        where,
        orderBy: cfg.orderBy ?? { createdAt: "desc" },
        ...(cfg.include ? { include: cfg.include } : {}),
      });
      return NextResponse.json({ rows });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function crudCreate<C extends z.ZodTypeAny, U extends z.ZodTypeAny>(cfg: CrudConfig<C, U>) {
  return async (req: Request) => {
    try {
      const tenant = await requirePermission(cfg.writePerm);
      const parsed = cfg.createSchema.parse(await req.json());
      const data = cfg.transform ? cfg.transform(parsed) : (parsed as Record<string, unknown>);
      const row = await delegate(cfg.model).create({
        data: { ...data, organizationId: tenant.organizationId },
      });
      await audit(tenant, `${cfg.model}.create`, cfg.model, row.id);
      return NextResponse.json({ row });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function crudUpdate<C extends z.ZodTypeAny, U extends z.ZodTypeAny>(cfg: CrudConfig<C, U>) {
  return async (req: Request, ctx: { params: { id: string } }) => {
    try {
      const tenant = await requirePermission(cfg.writePerm);
      const existing = await delegate(cfg.model).findFirst({
        where: { id: ctx.params.id, organizationId: tenant.organizationId },
      });
      if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
      const data = cfg.updateSchema.parse(await req.json());
      const row = await delegate(cfg.model).update({
        where: { id: ctx.params.id },
        data: data as Record<string, unknown>,
      });
      await audit(tenant, `${cfg.model}.update`, cfg.model, ctx.params.id);
      return NextResponse.json({ row });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function crudDelete<C extends z.ZodTypeAny, U extends z.ZodTypeAny>(cfg: CrudConfig<C, U>) {
  return async (_req: Request, ctx: { params: { id: string } }) => {
    try {
      const tenant = await requirePermission(cfg.writePerm);
      const existing = await delegate(cfg.model).findFirst({
        where: { id: ctx.params.id, organizationId: tenant.organizationId },
      });
      if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
      await delegate(cfg.model).delete({ where: { id: ctx.params.id } });
      await audit(tenant, `${cfg.model}.delete`, cfg.model, ctx.params.id);
      return NextResponse.json({ ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}
