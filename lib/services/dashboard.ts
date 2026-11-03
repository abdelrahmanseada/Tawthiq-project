import { prisma } from "@/lib/db";
import { addDays, cairoDateString, cairoToday } from "@/lib/format";

export interface DailyScanPoint {
  date: string;
  valid: number;
  invalid: number;
}

export interface RecentScan {
  id: string;
  token_prefix: string;
  result: string;
  created_at: Date;
  employee_name: string | null;
  employee_id: string | null;
}

export interface ExpiringCard {
  cardId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  expiresAt: Date;
  hasPhoto: boolean;
}

export interface DashboardData {
  totalEmployees: number;
  activeEmployees: number;
  suspendedEmployees: number;
  terminatedEmployees: number;
  activeCards: number;
  expiringSoon: number;
  scans24h: number;
  scans24hPrevious: number;
  scans7d: number;
  invalid24h: number;
  invalid24hPrevious: number;
  scans24hTrend: number;
  scans7dTrend: number;
  invalid24hTrend: number;
  series: DailyScanPoint[];
  recentInvalid: RecentScan[];
  expiringCards: ExpiringCard[];
  missingPhotos: number;
  failedImports: number;
  pendingPreviews: number;
  legacyCards: number;
  topInvalidPrefixes: Array<{ token_prefix: string; count: number }>;
}

type RawDaily = { day: Date; valid: bigint | number; invalid: bigint | number };

export async function getScanSeries(companyId: string, days: number, now: Date = new Date()): Promise<DailyScanPoint[]> {
  const since = addDays(now, -days + 1);
  const rows = await prisma.$queryRaw<RawDaily[]>`
    SELECT date_trunc('day', "created_at" AT TIME ZONE 'Africa/Cairo')::date AS day,
           count(*) FILTER (WHERE "result" = 'VALID') AS valid,
           count(*) FILTER (WHERE "result" <> 'VALID') AS invalid
    FROM "ScanLog"
    WHERE "company_id" = ${companyId}::uuid AND "created_at" >= ${since}
    GROUP BY 1
    ORDER BY 1
  `.catch(() => [] as RawDaily[]);

  const byDate = new Map(
    rows.map((row) => [
      cairoDateString(new Date(row.day)),
      { valid: Number(row.valid), invalid: Number(row.invalid) },
    ]),
  );

  const points: DailyScanPoint[] = [];
  const today = cairoToday(now);
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = cairoDateString(addDays(today, -offset));
    const entry = byDate.get(date) ?? { valid: 0, invalid: 0 };
    points.push({ date, ...entry });
  }
  return points;
}

export async function getDashboardData(companyId: string, now: Date = new Date()): Promise<DashboardData> {
  const soon = addDays(now, 30);
  const dayAgo = addDays(now, -1);
  const weekAgo = addDays(now, -7);
  const previousDay = addDays(now, -2);
  const previousWeek = addDays(now, -14);

  const [
    totalEmployees,
    activeEmployees,
    suspendedEmployees,
    terminatedEmployees,
    activeCards,
    expiringSoon,
    scans24h,
    scans7d,
    invalid24h,
    scansPrevious24h,
    scansPrevious7d,
    invalidPrevious24h,
    recentInvalid,
    expiringCards,
    missingPhotos,
    failedImports,
    pendingPreviews,
    legacyCards,
    topInvalidPrefixes,
    series,
  ] = await Promise.all([
    prisma.employee.count({ where: { company_id: companyId, deleted_at: null } }),
    prisma.employee.count({ where: { company_id: companyId, deleted_at: null, status: "ACTIVE" } }),
    prisma.employee.count({ where: { company_id: companyId, deleted_at: null, status: "SUSPENDED" } }),
    prisma.employee.count({ where: { company_id: companyId, deleted_at: null, status: "TERMINATED" } }),
    prisma.card.count({
      where: {
        status: "ACTIVE",
        expires_at: { gte: now },
        employee: { company_id: companyId, deleted_at: null, status: "ACTIVE" },
      },
    }),
    prisma.card.count({
      where: {
        status: "ACTIVE",
        expires_at: { gte: now, lte: soon },
        employee: { company_id: companyId, deleted_at: null, status: "ACTIVE" },
      },
    }),
    prisma.scanLog.count({ where: { company_id: companyId, created_at: { gte: dayAgo } } }),
    prisma.scanLog.count({ where: { company_id: companyId, created_at: { gte: weekAgo } } }),
    prisma.scanLog.count({ where: { company_id: companyId, created_at: { gte: dayAgo }, result: { not: "VALID" } } }),
    prisma.scanLog.count({ where: { company_id: companyId, created_at: { gte: previousDay, lt: dayAgo } } }),
    prisma.scanLog.count({ where: { company_id: companyId, created_at: { gte: previousWeek, lt: weekAgo } } }),
    prisma.scanLog.count({
      where: { company_id: companyId, created_at: { gte: previousDay, lt: dayAgo }, result: { not: "VALID" } },
    }),
    prisma.scanLog.findMany({
      where: { company_id: companyId, result: { not: "VALID" } },
      orderBy: { created_at: "desc" },
      take: 8,
      include: { card: { include: { employee: { select: { id: true, full_name: true } } } } },
    }),
    prisma.card.findMany({
      where: {
        status: "ACTIVE",
        expires_at: { gte: now, lte: soon },
        employee: { company_id: companyId, deleted_at: null, status: "ACTIVE" },
      },
      orderBy: { expires_at: "asc" },
      take: 8,
      include: { employee: { select: { id: true, full_name: true, employee_code: true, photo_path: true } } },
    }),
    prisma.employee.count({ where: { company_id: companyId, deleted_at: null, photo_path: null } }),
    prisma.importBatch.count({ where: { company_id: companyId, status: "FAILED" } }),
    prisma.importBatch.count({ where: { company_id: companyId, status: "PENDING" } }),
    prisma.card.count({
      where: { status: "ACTIVE", token_enc: null, employee: { company_id: companyId, deleted_at: null } },
    }),
    prisma.scanLog.groupBy({
      by: ["token_prefix"],
      where: { company_id: companyId, result: { not: "VALID" } },
      _count: { _all: true },
      orderBy: { _count: { token_prefix: "desc" } },
      take: 5,
    }),
    getScanSeries(companyId, 30, now),
  ]);

  const trend = (current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  return {
    totalEmployees,
    activeEmployees,
    suspendedEmployees,
    terminatedEmployees,
    activeCards,
    expiringSoon,
    scans24h,
    scans24hPrevious: scansPrevious24h,
    scans7d,
    invalid24h,
    invalid24hPrevious: invalidPrevious24h,
    scans24hTrend: trend(scans24h, scansPrevious24h),
    scans7dTrend: trend(scans7d, scansPrevious7d),
    invalid24hTrend: trend(invalid24h, invalidPrevious24h),
    series,
    recentInvalid: recentInvalid.map((scan) => ({
      id: scan.id,
      token_prefix: scan.token_prefix,
      result: scan.result,
      created_at: scan.created_at,
      employee_name: scan.card?.employee.full_name ?? null,
      employee_id: scan.card?.employee.id ?? null,
    })),
    expiringCards: expiringCards.map((card) => ({
      cardId: card.id,
      employeeId: card.employee.id,
      employeeName: card.employee.full_name,
      employeeCode: card.employee.employee_code,
      expiresAt: card.expires_at,
      hasPhoto: Boolean(card.employee.photo_path),
    })),
    missingPhotos,
    failedImports,
    pendingPreviews,
    legacyCards,
    topInvalidPrefixes: topInvalidPrefixes.map((row) => ({
      token_prefix: row.token_prefix,
      count: row._count._all,
    })),
  };
}

export async function getScansByHour(now: Date = new Date()) {
  const since = addDays(now, -1);
  const rows = await prisma.$queryRaw<Array<{ hour: Date; count: bigint | number }>>`
    SELECT date_trunc('hour', "created_at" AT TIME ZONE 'Africa/Cairo') AS hour, count(*) AS count
    FROM "ScanLog" WHERE "created_at" >= ${since}
    GROUP BY 1 ORDER BY 1
  `.catch(() => []);
  return rows.map((row) => ({ hour: new Date(row.hour), count: Number(row.count) }));
}

export async function getTopScannedEmployees(companyId: string, take = 10) {
  const rows = await prisma.scanLog.groupBy({
    by: ["card_id"],
    where: { card: { employee: { company_id: companyId } } },
    _count: { _all: true },
    orderBy: { _count: { card_id: "desc" } },
    take,
  });
  const cardIds = rows.map((row) => row.card_id).filter((id): id is string => Boolean(id));
  const cards = await prisma.card.findMany({
    where: { id: { in: cardIds } },
    select: { id: true, employee: { select: { id: true, full_name: true, employee_code: true } } },
  });
  const map = new Map(cards.map((card) => [card.id, card.employee]));
  return rows
    .map((row) => {
      const employee = row.card_id ? map.get(row.card_id) : undefined;
      return employee ? { employee, count: row._count._all } : null;
    })
    .filter(
      (value): value is { employee: { id: string; full_name: string; employee_code: string }; count: number } =>
        Boolean(value),
    );
}

export async function getEmployeeScanStats(employeeId: string) {
  const cards = await prisma.card.findMany({ where: { employee_id: employeeId }, select: { id: true } });
  const cardIds = cards.map((card) => card.id);
  const [total, valid, invalid] = await Promise.all([
    prisma.scanLog.count({ where: { card_id: { in: cardIds } } }),
    prisma.scanLog.count({ where: { card_id: { in: cardIds }, result: "VALID" } }),
    prisma.scanLog.count({ where: { card_id: { in: cardIds }, result: { not: "VALID" } } }),
  ]);
  return { total, valid, invalid };
}
