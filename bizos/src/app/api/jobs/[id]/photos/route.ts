import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { requirePermission, AuthError } from "@/lib/tenant";
import { audit } from "@/lib/audit";

const schema = z.object({
  kind: z.enum(["before", "after"]),
  data: z.string().startsWith("data:image/").max(3_000_000),
});

async function ownedJob(id: string, organizationId: string) {
  const job = await prisma.job.findFirst({ where: { id, organizationId } });
  if (!job) throw new AuthError(404, "לא נמצא");
  return job;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const tenant = await requirePermission("jobs:read");
    await ownedJob(params.id, tenant.organizationId);
    const photos = await prisma.jobPhoto.findMany({ where: { jobId: params.id }, orderBy: { createdAt: "asc" } });
    return NextResponse.json({ photos });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const tenant = await requirePermission("jobs:write");
    await ownedJob(params.id, tenant.organizationId);
    const { kind, data } = schema.parse(await req.json());
    const photo = await prisma.jobPhoto.create({
      data: { organizationId: tenant.organizationId, jobId: params.id, kind, data },
    });
    await audit(tenant, "jobPhoto.create", "job", params.id);
    return NextResponse.json({ photo });
  } catch (err) {
    return errorResponse(err);
  }
}
