import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import { writeAuditLog } from "@/lib/audit";

const CODE_COUNT = 10;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(): string {
  const bytes = randomBytes(10);
  let raw = "";
  for (let index = 0; index < 10; index += 1) {
    raw += ALPHABET[bytes[index]! % ALPHABET.length];
  }
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

/** Generates 10 single-use codes, stores only Argon2id hashes, returns plaintext once. */
export async function generateRecoveryCodes(adminId: string): Promise<string[]> {
  const codes = Array.from({ length: CODE_COUNT }, randomCode);
  const hashes = await Promise.all(codes.map((code) => hashPassword(code)));
  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { admin_id: adminId } }),
    prisma.recoveryCode.createMany({
      data: hashes.map((code_hash) => ({ admin_id: adminId, code_hash })),
    }),
  ]);
  return codes;
}

export async function verifyRecoveryCode(adminId: string, code: string): Promise<boolean> {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{5}-?[A-Z0-9]{5}$/.test(normalized)) return false;
  const withDash = normalized.includes("-")
    ? normalized
    : `${normalized.slice(0, 5)}-${normalized.slice(5)}`;
  const candidates = await prisma.recoveryCode.findMany({
    where: { admin_id: adminId, used_at: null },
    orderBy: { created_at: "asc" },
  });
  for (const candidate of candidates) {
    if (await verifyPassword(candidate.code_hash, withDash)) {
      const updated = await prisma.recoveryCode.updateMany({
        where: { id: candidate.id, used_at: null },
        data: { used_at: new Date() },
      });
      return updated.count === 1;
    }
  }
  return false;
}

export async function countUnusedRecoveryCodes(adminId: string): Promise<number> {
  return prisma.recoveryCode.count({ where: { admin_id: adminId, used_at: null } });
}

/** SUPER_ADMIN action: remove TOTP, recovery codes and sessions for another admin. */
export async function resetAdminTwoFactor(
  companyId: string,
  targetAdminId: string,
  actorId: string,
  ip: string | null,
): Promise<void> {
  const target = await prisma.adminUser.findFirst({
    where: { id: targetAdminId, company_id: companyId },
    select: { id: true, email: true },
  });
  if (!target) throw new Error("Administrator not found");

  await prisma.$transaction([
    prisma.adminUser.update({
      where: { id: targetAdminId },
      data: { totp_enabled: false, totp_secret: null, failed_logins: 0, locked_until: null },
    }),
    prisma.recoveryCode.deleteMany({ where: { admin_id: targetAdminId } }),
    prisma.userSession.updateMany({
      where: { admin_id: targetAdminId, revoked_at: null },
      data: { revoked_at: new Date() },
    }),
  ]);

  await writeAuditLog({
    adminId: actorId,
    action: "admin.2fa_reset",
    entity: "AdminUser",
    entityId: targetAdminId,
    metadata: { email: target.email },
    ip,
  });
}
