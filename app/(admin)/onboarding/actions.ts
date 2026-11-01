"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireActionPermission } from "@/lib/auth/session";

export async function markTestPrintAction(): Promise<void> {
  const admin = await requireActionPermission("cards.write");
  await prisma.company.update({
    where: { id: admin.companyId },
    data: { onboarding_test_print_at: new Date() },
  });
  redirect("/onboarding");
}

export async function markOnboardingCompleteAction(): Promise<void> {
  const admin = await requireActionPermission("settings.manage");
  await prisma.company.update({
    where: { id: admin.companyId },
    data: { onboarding_completed_at: new Date() },
  });
  redirect("/dashboard?onboarding=done");
}
