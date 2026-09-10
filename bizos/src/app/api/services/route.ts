import { crudCreate, crudList } from "@/lib/crud";
import { servicesCfg } from "@/lib/resources";

export const GET = crudList(servicesCfg);
export const POST = crudCreate(servicesCfg);
