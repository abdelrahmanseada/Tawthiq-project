"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActionPermission } from "@/lib/auth/session";
import { getClientIp } from "@/lib/http";
import { headers } from "next/headers";
import { reissueLegacyCards } from "@/lib/services/cards";

export async function reissueAllCardsAction(): Promise<void> {
  const admin = await requireActionPermission("cards.write");
  const { reissued } = await reissueLegacyCards(admin.companyId, admin.id, getClientIp(await headers()));
  revalidatePath("/cards");
  revalidatePath("/dashboard");
  redirect(`/cards?reissued=${reissued}`);
}
