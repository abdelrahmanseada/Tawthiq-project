import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/ui";
import { copyrightText } from "@/lib/brand";

export const metadata: Metadata = { title: "Access denied" };

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-4 text-center">
      <LogoMark className="h-14 w-14" />
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-brand">403</p>
      <h1 className="text-3xl font-bold tracking-tight text-ink">You do not have access</h1>
      <p className="max-w-md text-sm leading-relaxed text-muted">
        Your account does not have permission for this page. Ask the Bremer owner if you need access.
      </p>
      <Link href="/dashboard" className="btn btn-primary mt-2">Back to dashboard</Link>
      <p className="mt-4 text-xs text-subtle">{copyrightText()}</p>
    </main>
  );
}
