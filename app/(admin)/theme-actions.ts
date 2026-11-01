"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireActionAdmin } from "@/lib/auth/session";
import { THEME_COOKIE, normalizeTheme } from "@/lib/theme";

export async function setThemeAction(theme: string): Promise<{ ok: boolean }> {
  const admin = await requireActionAdmin();
  const normalized = normalizeTheme(theme);
  await prisma.adminUser.update({ where: { id: admin.id }, data: { theme: normalized } });
  const store = await cookies();
  store.set({
    name: THEME_COOKIE,
    value: normalized,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
