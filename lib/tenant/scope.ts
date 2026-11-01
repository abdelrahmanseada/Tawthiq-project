import type { Company } from "@prisma/client";
import type { SessionAdmin } from "@/lib/auth/session";

/**
 * Tenant scoping helpers used at the service boundary. Every service receives
 * the company id from the authenticated session; these guards make accidental
 * cross-tenant ids fail closed.
 */
export function requireTenantId(admin: SessionAdmin): string {
  if (!admin.companyId || !admin.company) throw new Error("Tenant context is required");
  return admin.companyId;
}

export function requireTenantCompany(admin: SessionAdmin): { companyId: string; company: Company } {
  if (!admin.companyId || !admin.company) throw new Error("Tenant context is required");
  return { companyId: admin.companyId, company: admin.company };
}

export function assertSameTenant(recordCompanyId: string | null | undefined, tenantCompanyId: string): void {
  if (!recordCompanyId || recordCompanyId !== tenantCompanyId) {
    throw new Error("TENANT_MISMATCH");
  }
}

/** Standard where-clause fragment for tenant tables. */
export function tenantWhere(companyId: string): { company_id: string } {
  return { company_id: companyId };
}
