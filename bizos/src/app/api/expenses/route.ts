import { crudCreate, crudList } from "@/lib/crud";
import { expensesCfg } from "@/lib/resources";

export const GET = crudList(expensesCfg);
export const POST = crudCreate(expensesCfg);
