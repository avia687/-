import { crudDelete, crudUpdate } from "@/lib/crud";
import { leadsCfg } from "@/lib/resources";

export const PATCH = crudUpdate(leadsCfg);
export const DELETE = crudDelete(leadsCfg);
