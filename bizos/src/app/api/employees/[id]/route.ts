import { crudDelete, crudUpdate } from "@/lib/crud";
import { employeesCfg } from "@/lib/resources";

export const PATCH = crudUpdate(employeesCfg);
export const DELETE = crudDelete(employeesCfg);
