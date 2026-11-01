import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Alert, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { validateVerifyBaseUrl } from "@/lib/qr";
import { countActiveCards } from "@/lib/services/company";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requirePermission("settings.manage");
  const [t, params] = await Promise.all([getTranslations("settings"), searchParams]);
  const company = admin.company;
  const logoUrl = company.logo_url
    ? `/api/media/logo?company=${company.id}&v=${encodeURIComponent(company.updated_at.toISOString())}`
    : null;
  const activeCards = await countActiveCards(company.id);
  const urlCheck = validateVerifyBaseUrl(company.verify_base_url, env.NODE_ENV === "production");
  const domainWarning = !urlCheck.ok || !urlCheck.productionValid;

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {params.saved === "1" ? (
        <div className="mb-4">
          <Alert tone="success">{t("saved")}</Alert>
        </div>
      ) : null}
      <SettingsForm
        initial={{
          name: company.name,
          primary_color: company.primary_color,
          secondary_color: company.secondary_color,
          contact_phone: company.contact_phone,
          contact_email: company.contact_email,
          verify_base_url: company.verify_base_url,
          time_zone: company.time_zone,
          custom_domain: company.custom_domain,
          idle_timeout_minutes: company.idle_timeout_minutes,
          default_card_validity_days: company.default_card_validity_days,
          scan_log_retention_days: company.scan_log_retention_days,
          logoUrl,
        }}
        activeCardCount={activeCards}
        domainWarning={domainWarning}
      />
    </div>
  );
}
