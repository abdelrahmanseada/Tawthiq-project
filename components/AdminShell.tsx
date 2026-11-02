"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  BarChart3,
  Bell,
  ChevronDown,
  ClipboardList,
  FileSpreadsheet,
  Fingerprint,
  IdCard,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { logoutAction } from "@/app/(admin)/actions";
import { Alert, Badge, LogoMark, cn } from "@/components/ui";

const ICONS = {
  dashboard: LayoutDashboard,
  employees: Users,
  cards: IdCard,
  imports: FileSpreadsheet,
  analytics: BarChart3,
  scanLogs: Fingerprint,
  auditLog: ClipboardList,
  settings: Settings,
  admins: ShieldCheck,
  system: ShieldCheck,
} as const;

export type NavIcon = keyof typeof ICONS;

export interface ShellNavItem {
  href: string;
  label: string;
  icon: NavIcon;
}

export interface ShellNavGroup {
  label: string;
  items: ShellNavItem[];
}

export interface ShellNotification {
  id: string;
  label: string;
  href: string;
  tone: "warning" | "danger" | "info";
  count: number;
}

export interface AdminShellProps {
  admin: { name: string; email: string; roleLabel: string };
  copyright: string;
  nav: ShellNavGroup[];
  notifications: ShellNotification[];
  breadcrumbs: Array<{ href: string; label: string }>;
  invalidDomain: boolean;
  children: React.ReactNode;
}

export function AdminShell({
  admin,
  copyright,
  nav,
  notifications,
  breadcrumbs,
  invalidDomain,
  children,
}: AdminShellProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("evs:sidebar") === "collapsed");
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem("evs:sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const notificationCount = notifications.reduce((total, item) => total + item.count, 0);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 items-center gap-3 border-b border-border px-4", collapsed && "lg:justify-center lg:px-2")}>
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
          <LogoMark className="h-9 w-9 shrink-0" />
          <span className={cn("truncate text-sm font-bold text-ink", collapsed && "lg:hidden")}>{t("brand.name")}</span>
        </Link>
        <button type="button" className="btn btn-ghost btn-icon ms-auto lg:hidden" onClick={() => setMobileOpen(false)} aria-label={t("common.close")}>
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav aria-label={t("nav.dashboard")} className="flex-1 overflow-y-auto px-2 py-3">
        {nav.map((group) => (
          <div key={group.label} className="mb-4">
            <p className={cn("px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle", collapsed && "lg:hidden")}>
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-10 items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-colors duration-150",
                        active ? "bg-brand-tint text-brand" : "text-muted hover:bg-surface hover:text-ink",
                        collapsed && "lg:justify-center lg:px-2",
                      )}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                      <span className={cn("truncate", collapsed && "lg:hidden")}>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className={cn("border-t border-border px-4 py-3 text-[11px] text-subtle", collapsed && "lg:hidden")}>{copyright}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-3 focus:top-3 focus:z-[100] focus:rounded-control focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-fg">
        {t("common.skipToContent")}
      </a>

      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-40 hidden border-e border-border bg-card transition-[width] duration-200 lg:block",
          collapsed ? "w-[76px]" : "w-[260px]",
        )}
        aria-label={t("nav.dashboard")}
      >
        {sidebar}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-ink/50" aria-label={t("common.close")} onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-[280px] max-w-[85vw] border-e border-border bg-card shadow-raised">{sidebar}</aside>
        </div>
      ) : null}

      <div className={cn("min-h-screen", collapsed ? "lg:ps-[76px]" : "lg:ps-[260px]")}>
        <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
          <div className="flex h-16 items-center gap-2 px-3 sm:px-5">
            <button type="button" className="btn btn-ghost btn-icon lg:hidden" onClick={() => setMobileOpen(true)} aria-label={t("nav.expand")}>
              <Menu className="h-5 w-5" />
            </button>
            <button
              type="button" className="btn btn-ghost btn-icon hidden lg:inline-flex"
              onClick={toggleCollapsed}
              aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
              aria-expanded={!collapsed}
            >
              {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </button>

            <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm text-muted md:flex">
              {breadcrumbs.map((crumb, index) => (
                <span key={crumb.href} className="flex min-w-0 items-center gap-1.5">
                  {index > 0 ? <span className="text-subtle">/</span> : null}
                  {index === breadcrumbs.length - 1 ? (
                    <span className="truncate font-semibold text-ink" aria-current="page">
                      {crumb.label}
                    </span>
                  ) : (
                    <Link href={crumb.href} className="truncate hover:text-ink">
                      {crumb.label}
                    </Link>
                  )}
                </span>
              ))}
            </nav>

            <form className="relative ms-auto hidden w-full max-w-xs sm:block"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                const value = search.trim();
                router.push(value ? `/employees?q=${encodeURIComponent(value)}` : "/employees");
              }}
            >
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)} className="input h-10 ps-9 text-sm"
                placeholder={t("employees.searchPlaceholder")}
                aria-label={t("common.search")}
              />
            </form>

            <div className="ms-auto flex items-center gap-1 sm:ms-2">
              <details className="group relative">
                <summary className="btn btn-secondary btn-icon relative list-none cursor-pointer [&::-webkit-details-marker]:hidden"
                  title={t("notifications.title")}
                >
                  <span className="sr-only">{t("notifications.title")}</span>
                  <Bell className="h-4 w-4" />
                  {notificationCount > 0 ? (
                    <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-pill bg-danger px-1 text-[10px] font-bold text-white">
                      {notificationCount > 99 ? "99+" : notificationCount}
                    </span>
                  ) : null}
                </summary>
                <div className="absolute end-0 z-50 mt-2 w-[min(92vw,360px)] rounded-card border border-border bg-card shadow-raised">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <p className="text-sm font-semibold text-ink">{t("notifications.title")}</p>
                    <span className="text-xs text-subtle">{t("notifications.markHint")}</span>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-muted">{t("notifications.empty")}</p>
                  ) : (
                    <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
                      {notifications.map((item) => (
                        <li key={item.id}>
                          <Link href={item.href} className="flex items-start gap-3 px-4 py-3 hover:bg-surface">
                            <span
                              className={cn(
                                "mt-1 h-2 w-2 shrink-0 rounded-full",
                                item.tone === "danger" ? "bg-danger" : item.tone === "warning" ? "bg-warning" : "bg-info",
                              )}
                            />
                            <span className="text-sm text-ink">{item.label}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>

              <details className="group relative">
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-control px-2 hover:bg-surface [&::-webkit-details-marker]:hidden">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-fg">
                    {admin.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="hidden max-w-[130px] truncate text-sm font-medium text-ink sm:block">{admin.name}</span>
                  <ChevronDown className="hidden h-4 w-4 text-subtle sm:block" aria-hidden="true" />
                </summary>
                <div className="absolute end-0 z-50 mt-2 w-64 rounded-card border border-border bg-card p-2 shadow-raised">
                  <div className="border-b border-border px-2 py-2">
                    <p className="truncate text-sm font-semibold text-ink">{admin.name}</p>
                    <p className="truncate text-xs text-muted">{admin.email}</p>
                    <Badge tone="info">{admin.roleLabel}</Badge>
                  </div>
                  <Link href="/account" className="mt-1 flex rounded-control px-3 py-2 text-sm text-ink hover:bg-surface">
                    {t("nav.account")}
                  </Link>
                  <form action={logoutAction}>
                    <button type="submit" className="flex w-full rounded-control px-3 py-2 text-start text-sm text-danger-fg hover:bg-danger-tint">
                      {t("common.logout")}
                    </button>
                  </form>
                </div>
              </details>
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
          {invalidDomain ? (
            <div className="mb-5">
              <Alert tone="danger" title={t("settings.domainWarning")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span>{t("settings.verifyUrlProductionRequired")}</span>
                  <Link href="/settings#domain" className="link">
                    {t("dashboard.openSettings")}
                  </Link>
                </div>
              </Alert>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
