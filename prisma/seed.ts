import "dotenv/config";
import { prisma } from "../lib/db";
import { env, initialVerifyBaseUrl } from "../lib/env";
import { hashPassword, checkPasswordPolicy } from "../lib/security/password";

/**
 * Base seed: exactly one company (Bremer) and one owner account.
 * Demo employees are added separately with `npm run db:demo` so a production
 * install never receives fake staff records.
 */
async function main() {
  const password = env.SEED_SUPERADMIN_PASSWORD;
  const policy = checkPasswordPolicy(password);
  if (policy) throw new Error(`SEED_SUPERADMIN_PASSWORD violates the password policy: ${policy}`);

  const company = await prisma.company.upsert({
    where: { slug: "bremer" },
    create: {
      name: "Bremer",
      slug: "bremer",
      status: "ACTIVE",
      tagline: "Established 1989",
      website: "https://bremer.example",
      contact_phone: env.SEED_COMPANY_PHONE,
      contact_email: env.SEED_COMPANY_EMAIL,
      verify_base_url: initialVerifyBaseUrl,
      primary_color: "#000000",
      secondary_color: "#8F0015",
      time_zone: "Africa/Cairo",
      onboarding_completed_at: new Date(),
    },
    update: {
      name: "Bremer",
      status: "ACTIVE",
      tagline: "Established 1989",
      website: "https://bremer.example",
      contact_phone: env.SEED_COMPANY_PHONE,
      contact_email: env.SEED_COMPANY_EMAIL,
      primary_color: "#000000",
      secondary_color: "#8F0015",
    },
  });

  const email = env.SEED_SUPERADMIN_EMAIL.toLowerCase();
  await prisma.adminUser.upsert({
    where: { email },
    create: {
      company_id: company.id,
      name: "Bremer Owner",
      email,
      password_hash: await hashPassword(password),
      role: "SUPER_ADMIN",
      must_change_password: true,
      totp_enabled: false,
      is_active: true,
    },
    update: {
      company_id: company.id,
      role: "SUPER_ADMIN",
      is_active: true,
    },
  });

  console.log(`[seed] company ${company.name} ready`);
  console.log(`[seed] owner ${email} ready (must change password)`);
  console.log("[seed] add demo staff with: npm run db:demo");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
