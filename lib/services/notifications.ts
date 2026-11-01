import { prisma } from "@/lib/db";
import { validateVerifyBaseUrl } from "@/lib/qr";
import { addDays } from "@/lib/format";

export interface NotificationItem {
  id: string;
  count: number;
  href: string;
  tone: "warning" | "danger" | "info";
}

export interface NotificationsResult {
  items: NotificationItem[];
  total: number;
}

/** In-app "needs attention" notifications, computed from live data. */
export async function getNotifications(company: {
  id: string;
  verify_base_url: string;
}): Promise<NotificationsResult> {
  const now = new Date();
  const in7 = addDays(now, 7);
  const in30 = addDays(now, 30);

  const [expiring30, expiring7, missingPhotos, failedImports, pendingPreviews, legacyCards] = await Promise.all([
    prisma.card.count({
      where: {
        status: "ACTIVE",
        expires_at: { gte: now, lte: in30 },
        employee: { company_id: company.id, deleted_at: null, status: "ACTIVE" },
      },
    }),
    prisma.card.count({
      where: {
        status: "ACTIVE",
        expires_at: { gte: now, lte: in7 },
        employee: { company_id: company.id, deleted_at: null, status: "ACTIVE" },
      },
    }),
    prisma.employee.count({ where: { company_id: company.id, deleted_at: null, photo_path: null } }),
    prisma.importBatch.count({ where: { company_id: company.id, status: "FAILED" } }),
    prisma.importBatch.count({ where: { company_id: company.id, status: "PENDING" } }),
    prisma.card.count({
      where: { status: "ACTIVE", token_enc: null, employee: { company_id: company.id, deleted_at: null } },
    }),
  ]);

  const urlCheck = validateVerifyBaseUrl(company.verify_base_url, true);
  const items: NotificationItem[] = [];

  if (!urlCheck.ok || !urlCheck.productionValid) {
    items.push({ id: "verifyDomain", count: 1, href: "/settings#domain", tone: "danger" });
  }
  if (expiring7 > 0) items.push({ id: "expiring7", count: expiring7, href: "/dashboard?chart=30", tone: "danger" });
  else if (expiring30 > 0) items.push({ id: "expiring30", count: expiring30, href: "/dashboard?chart=30", tone: "warning" });
  if (missingPhotos > 0) items.push({ id: "missingPhotos", count: missingPhotos, href: "/employees?photo=missing", tone: "warning" });
  if (failedImports > 0) items.push({ id: "failedImports", count: failedImports, href: "/imports", tone: "danger" });
  if (pendingPreviews > 0) items.push({ id: "pendingPreviews", count: pendingPreviews, href: "/imports", tone: "info" });
  if (legacyCards > 0) items.push({ id: "legacyCards", count: legacyCards, href: "/cards", tone: "warning" });

  return { items, total: items.reduce((total, item) => total + item.count, 0) };
}
