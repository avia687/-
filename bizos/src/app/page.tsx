import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant";

export default async function Home() {
  const tenant = await getTenant();
  redirect(tenant ? "/dashboard" : "/login");
}
