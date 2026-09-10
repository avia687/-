import { crudDelete, crudUpdate } from "@/lib/crud";
import { servicesCfg } from "@/lib/resources";

export const PATCH = crudUpdate(servicesCfg);
export const DELETE = crudDelete(servicesCfg);
