import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/AuthShell";
import { getCurrentAdmin } from "@/lib/auth/session";
import { ChangePasswordForm } from "./change-password-form";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("passwordChangeTitle") };
}

export default async function ChangePasswordPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  const t = await getTranslations("auth");

  return (
    <AuthShell title={t("passwordChangeTitle")} subtitle={t("passwordChangeSubtitle")}>
      {admin.mustChangePassword ? (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t("forcedPasswordNotice")}
        </p>
      ) : null}
      <ChangePasswordForm />
    </AuthShell>
  );
}
