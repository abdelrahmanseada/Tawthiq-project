import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth/session";
import { addDays, formatIsoDate } from "@/lib/format";
import { getActiveCard } from "@/lib/services/cards";
import { employeePhotoUrl, findEmployee } from "@/lib/services/employees";
import { EmployeeForm } from "../../employee-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("employees");
  return { title: t("editEmployee") };
}

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePermission("employees.write");
  const { id } = await params;
  const employee = await findEmployee(admin.companyId, id);
  if (!employee || employee.deleted_at) notFound();

  const t = await getTranslations("employees");
  const activeCard = await getActiveCard(employee.id);
  const expiry = activeCard
    ? formatIsoDate(activeCard.expires_at)
    : formatIsoDate(addDays(new Date(), admin.company.default_card_validity_days));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("editEmployee")} subtitle={employee.full_name} />
      <EmployeeForm
        initial={{
          id: employee.id,
          employee_code: employee.employee_code,
          full_name: employee.full_name,
          department: employee.department,
          job_title: employee.job_title,
          status: employee.status,
          expires_at: expiry,
          photo_url: employeePhotoUrl(employee),
        }}
        company={admin.company}
      />
    </div>
  );
}
