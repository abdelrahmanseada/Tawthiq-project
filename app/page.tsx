import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const admin = await getCurrentAdmin();
  if (admin) redirect(admin.mustChangePassword ? "/change-password" : "/dashboard");
  redirect("/login");
}
