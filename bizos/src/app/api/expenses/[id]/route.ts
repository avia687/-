import { crudDelete, crudUpdate } from "@/lib/crud";
import { expensesCfg } from "@/lib/resources";

export const PATCH = crudUpdate(expensesCfg);
export const DELETE = crudDelete(expensesCfg);
