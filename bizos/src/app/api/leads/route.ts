import { crudCreate, crudList } from "@/lib/crud";
import { leadsCfg } from "@/lib/resources";

export const GET = crudList(leadsCfg);
export const POST = crudCreate(leadsCfg);
