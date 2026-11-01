import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { addDays, formatIsoDate } from "@/lib/format";
import { requirePermission } from "@/lib/auth/session";
import { EmployeeForm } from "../employee-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("employees");
  return { title: t("newEmployee") };
}

export default async function NewEmployeePage() {
  const admin = await requirePermission("employees.write");
  const t = await getTranslations("employees");
  const defaultExpiry = formatIsoDate(addDays(new Date(), admin.company.default_card_validity_days));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("newEmployee")} subtitle={t("subtitle")} />
      <EmployeeForm
        initial={{
          employee_code: "",
          full_name: "",
          department: null,
          job_title: null,
          status: "ACTIVE",
          expires_at: defaultExpiry,
          photo_url: null,
        }}
        company={admin.company}
      />
    </div>
  );
}
