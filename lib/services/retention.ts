import { prisma } from "@/lib/db";
import { addDays } from "@/lib/format";

export interface RetentionResult {
  scansDeleted: number;
  reportsDeleted: number;
  rateLimitRowsDeleted: number;
}

/**
 * Enforce each company's ScanLog retention setting (default 365 days) and remove
 * stale rate-limit counters. VerificationReport has no company column, so reports
 * are purged only in a single-company deployment.
 */
export async function purgeExpiredData(now: Date = new Date()): Promise<RetentionResult> {
  const companies = await prisma.company.findMany({
    select: { id: true, scan_log_retention_days: true },
  });
  const singleCompany = companies.length === 1;
  let scansDeleted = 0;
  let reportsDeleted = 0;

  for (const company of companies) {
    const cutoff = addDays(now, -company.scan_log_retention_days);
    const result = await prisma.scanLog.deleteMany({
      where: {
        created_at: { lt: cutoff },
        OR: [{ card: { employee: { company_id: company.id } } }, ...(singleCompany ? [{ card_id: null }] : [])],
      },
    });
    scansDeleted += result.count;

    if (singleCompany) {
      const reportResult = await prisma.verificationReport.deleteMany({
        where: { created_at: { lt: cutoff } },
      });
      reportsDeleted += reportResult.count;
    }
  }

  const rateLimitResult = await prisma.rateLimitCounter.deleteMany({
    where: { window_start: { lt: addDays(now, -7) } },
  });

  return {
    scansDeleted,
    reportsDeleted,
    rateLimitRowsDeleted: rateLimitResult.count,
  };
}
