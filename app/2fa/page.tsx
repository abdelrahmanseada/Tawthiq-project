import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/ui";
import { readMfaTicketCookie } from "@/lib/auth/mfa-cookie";
import { verifyMfaTicket } from "@/lib/security/crypto";
import { prisma } from "@/lib/db";
import { copyrightText } from "@/lib/brand";
import { verifyTwoFactorAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Two-step verification" };

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ticket = verifyMfaTicket(await readMfaTicketCookie());
  if (!ticket || ticket.purpose !== "totp") redirect("/login");
  const admin = await prisma.adminUser.findUnique({ where: { id: ticket.sub } });
  if (!admin || !admin.is_active || !admin.totp_enabled) redirect("/login");
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">
        <div className="rounded-card border border-border bg-card p-6 shadow-card sm:p-8">
          <LogoMark className="h-12 w-12" />
          <h1 className="mt-5 text-2xl font-bold text-ink">Two-step verification</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Enter the 6-digit code from your authenticator app, or one of your recovery codes.
          </p>
          {error ? (
            <p role="alert" className="mt-4 rounded-control border border-danger bg-danger-tint px-3 py-2 text-sm text-danger-fg">
              That code is not valid. Try again.
            </p>
          ) : null}
          <form action={verifyTwoFactorAction} className="mt-6 space-y-4">
            <label className="block">
              <span className="label">Verification code</span>
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                maxLength={32}
                className="input font-mono tracking-[0.2em]"
                placeholder="123456"
              />
            </label>
            <button type="submit" className="btn btn-primary w-full">Verify and sign in</button>
          </form>
          <a href="/login" className="mt-4 block text-center text-xs font-semibold text-muted underline underline-offset-2">
            Back to sign in
          </a>
        </div>
        <p className="mt-6 text-center text-xs text-subtle">{copyrightText()}</p>
      </div>
    </main>
  );
}
