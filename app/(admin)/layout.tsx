import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/session";
import { roleLabel } from "@/lib/auth/rbac";
import { can } from "@/lib/auth/rbac";
import { env } from "@/lib/env";
import { validateVerifyBaseUrl } from "@/lib/qr";
import { normalizeTheme } from "@/lib/theme";
import { getNotifications } from "@/lib/services/notifications";
import { AdminShell, type ShellNavGroup } from "@/components/AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const t = await getTranslations();
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname") ?? "/dashboard";

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

  const sectionMap: Array<{ prefix: string; label: string }> = [
    { prefix: "/dashboard", label: t("nav.dashboard") },
    { prefix: "/analytics", label: t("nav.analytics") },
    { prefix: "/employees", label: t("nav.employees") },
    { prefix: "/cards", label: t("nav.cards") },
    { prefix: "/imports", label: t("nav.imports") },
    { prefix: "/logs/scans", label: t("nav.scanLogs") },
    { prefix: "/logs/audit", label: t("nav.auditLog") },
    { prefix: "/settings", label: t("nav.settings") },
    { prefix: "/admins", label: t("nav.admins") },
    { prefix: "/status", label: t("nav.system") },
    { prefix: "/account", label: t("nav.account") },
  ];
  const section = sectionMap
    .filter((entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  const breadcrumbs = [{ href: "/dashboard", label: t("nav.dashboard") }];
  if (section && section.prefix !== "/dashboard") {
    breadcrumbs.push({ href: section.prefix, label: section.label });
  }

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
  const logoUrl = admin.company.logo_url
    ? `/api/media/logo?company=${admin.company.id}&v=${encodeURIComponent(admin.company.updated_at.toISOString())}`
    : null;

  return (
    <AdminShell
      admin={{
        name: admin.name,
        email: admin.email,
        roleLabel: roleLabel(admin.role),
        theme: normalizeTheme(admin.theme),
      }}
      company={{ name: admin.company.name, logoUrl }}
      nav={nav}
      notifications={notificationViews}
      breadcrumbs={breadcrumbs}
      invalidDomain={invalidDomain}
    >
      {children}
    </AdminShell>
  );
}
