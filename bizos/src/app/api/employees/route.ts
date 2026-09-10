import { crudCreate, crudList } from "@/lib/crud";
import { employeesCfg } from "@/lib/resources";

export const GET = crudList(employeesCfg);
export const POST = crudCreate(employeesCfg);
