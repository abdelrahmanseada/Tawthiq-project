import type { Metadata } from "next";
import Link from "next/link";
import { Building2, LayoutDashboard, Plus, ShieldCheck } from "lucide-react";
import { PRODUCT_NAME } from "@/lib/brand";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { logoutAction } from "@/app/(admin)/actions";

export const metadata: Metadata = {
  title: { default: "Platform console", template: `%s · ${PRODUCT_NAME}` },
};

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformAdmin();
  return (
    <div
      className="min-h-screen bg-surface"
      style={
        {
          "--brand": "#4338CA",
          "--brand-fg": "#FFFFFF",
          "--brand-hover": "#3730A3",
          "--brand-active": "#312E81",
          "--brand-tint": "#EEF2FF",
          "--brand-soft": "#E0E7FF",
          "--secondary": "#22D3EE",
          "--secondary-fg": "#083344",
          "--secondary-tint": "#ECFEFF",
        } as React.CSSProperties
      }
    >
      <header className="border-b border-indigo-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/platform" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-mark.svg" alt="" className="h-9 w-9" />
            <span>
              <span className="block text-sm font-bold text-indigo-950">{PRODUCT_NAME}</span>
              <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">Platform console</span>
            </span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-indigo-900 sm:inline">{admin.name}</span>
            <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-800">Platform admin</span>
            <form action={logoutAction}><button type="submit" className="text-indigo-700 underline underline-offset-2">Sign out</button></form>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <nav className="space-y-1" aria-label="Platform navigation">
            <Link href="/platform" className="flex items-center gap-2 rounded-control px-3 py-2 text-sm font-medium text-indigo-900 hover:bg-indigo-50">
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> Overview
            </Link>
            <Link href="/platform/companies" className="flex items-center gap-2 rounded-control px-3 py-2 text-sm font-medium text-indigo-900 hover:bg-indigo-50">
              <Building2 className="h-4 w-4" aria-hidden="true" /> Companies
            </Link>
            <Link href="/platform/companies/new" className="flex items-center gap-2 rounded-control px-3 py-2 text-sm font-medium text-indigo-900 hover:bg-indigo-50">
              <Plus className="h-4 w-4" aria-hidden="true" /> Create company
            </Link>
          </nav>
          <div className="mt-6 rounded-card border border-indigo-200 bg-indigo-50 p-3 text-xs leading-relaxed text-indigo-900">
            <p className="flex items-center gap-1.5 font-semibold"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Operator area</p>
            <p className="mt-1">No impersonation. Every platform action is written to the platform audit log.</p>
          </div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
