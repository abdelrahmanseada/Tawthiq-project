"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RECOVERY_CODES_COOKIE } from "@/lib/auth/constants";

export async function acknowledgeRecoveryCodesAction(): Promise<void> {
  const store = await cookies();
  store.delete(RECOVERY_CODES_COOKIE);
  redirect("/dashboard");
}
