import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/session";
import { roleLabel } from "@/lib/auth/rbac";
import { can } from "@/lib/auth/rbac";
import { env, twoFactorRequired } from "@/lib/env";
import { redirect } from "next/navigation";
import { validateVerifyBaseUrl } from "@/lib/qr";
import { getNotifications } from "@/lib/services/notifications";
import { AdminShell, type ShellNavGroup } from "@/components/AdminShell";
import { copyrightText } from "@/lib/brand";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const t = await getTranslations();
  if (twoFactorRequired && !admin.totpEnabled) redirect("/2fa/setup");

  const nav: ShellNavGroup[] = [
    {
      label: t("nav.groupOverview"),
      items: [
        { href: "/dashboard", label: t("nav.dashboard"), icon: "dashboard" },
        ...(can(admin.role, "logs.scans")
          ? [{ href: "/analytics", label: t("nav.analytics"), icon: "analytics" as const }]
          : []),
      ],
    },
    {
      label: t("nav.groupWorkforce"),
      items: [
        { href: "/employees", label: t("nav.employees"), icon: "employees" },
        { href: "/cards", label: t("nav.cards"), icon: "cards" },
        ...(can(admin.role, "imports.manage")
          ? [{ href: "/imports", label: t("nav.imports"), icon: "imports" as const }]
          : []),
      ],
    },
    {
      label: t("nav.groupOperations"),
      items: [
        { href: "/logs/scans", label: t("nav.scanLogs"), icon: "scanLogs" as const },
        ...(can(admin.role, "logs.audit")
          ? [{ href: "/logs/audit", label: t("nav.auditLog"), icon: "auditLog" as const }]
          : []),
      ],
    },
    ...(can(admin.role, "settings.manage")
      ? [
          {
            label: t("nav.groupSystem"),
            items: [
              { href: "/settings", label: t("nav.settings"), icon: "settings" as const },
              { href: "/admins", label: t("nav.admins"), icon: "admins" as const },
              { href: "/status", label: t("nav.system"), icon: "system" as const },
            ],
          },
        ]
      : []),
  ];

  const breadcrumbLabels = {
    dashboard: t("nav.dashboard"),
    analytics: t("nav.analytics"),
    employees: t("nav.employees"),
    cards: t("nav.cards"),
    imports: t("nav.imports"),
    scanLogs: t("nav.scanLogs"),
    auditLog: t("nav.auditLog"),
    settings: t("nav.settings"),
    admins: t("nav.admins"),
    system: t("nav.system"),
    account: t("nav.account"),
  };

  const notifications = await getNotifications(admin.company);
  const notificationViews = notifications.items.map((item) => ({
    id: item.id,
    label: t(`notifications.${item.id}`, { count: item.count }),
    href: item.href,
    tone: item.tone,
    count: item.count,
  }));

  const urlCheck = validateVerifyBaseUrl(admin.company.verify_base_url, env.NODE_ENV === "production");
  const invalidDomain = !urlCheck.ok || !urlCheck.productionValid;

  return (
    <AdminShell
      admin={{
        name: admin.name,
        email: admin.email,
        roleLabel: roleLabel(admin.role),
      }}
      copyright={copyrightText()}
      nav={nav}
      notifications={notificationViews}
      breadcrumbLabels={breadcrumbLabels}
      invalidDomain={invalidDomain}
    >
      {children}
    </AdminShell>
  );
}
