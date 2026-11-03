export interface Breadcrumb {
  href: string;
  label: string;
}

const SECTIONS: Array<{ prefix: string; key: string }> = [
  { prefix: "/dashboard", key: "dashboard" },
  { prefix: "/analytics", key: "analytics" },
  { prefix: "/employees", key: "employees" },
  { prefix: "/cards", key: "cards" },
  { prefix: "/imports", key: "imports" },
  { prefix: "/logs/scans", key: "scanLogs" },
  { prefix: "/logs/audit", key: "auditLog" },
  { prefix: "/settings", key: "settings" },
  { prefix: "/admins", key: "admins" },
  { prefix: "/status", key: "system" },
  { prefix: "/account", key: "account" },
];

/**
 * One source of truth for admin breadcrumbs. The route path wins over any
 * stale header so Dashboard and My account can never inherit Employees.
 */
export function breadcrumbsForPath(pathname: string, labels: Record<string, string>): Breadcrumb[] {
  const path = `/${(pathname || "/dashboard").split("?")[0]!.split("#")[0]!.replace(/^\/+|\/+$/g, "")}`;
  const home = { href: "/dashboard", label: labels.dashboard ?? "Dashboard" };
  const section = SECTIONS.filter(
    (entry) => path === entry.prefix || path.startsWith(`${entry.prefix}/`),
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  if (!section || section.prefix === "/dashboard") return [home];
  return [home, { href: section.prefix, label: labels[section.key] ?? section.key }];
}
