import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/ui";
import { getCurrentAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { encryptTotpSecret, generateTotpSecret, totpSetupQrDataUrl } from "@/lib/auth/totp";
import { copyrightText } from "@/lib/brand";
import { CopyButton } from "@/components/CopyButton";
import { enableTwoFactorAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set up two-step verification" };

export default async function SetupTwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/login");
  let admin = await prisma.adminUser.findUnique({ where: { id: session.id } });
  if (!admin) redirect("/login");
  if (admin.totp_enabled) redirect("/dashboard");
  if (!admin.totp_secret) {
    admin = await prisma.adminUser.update({
      where: { id: admin.id },
      data: { totp_secret: encryptTotpSecret(generateTotpSecret()) },
    });
  }
  const secret = admin.totp_secret!;
  const { error } = await searchParams;
  const { decryptTotpSecret, buildTotpKeyUri } = await import("@/lib/auth/totp");
  const plain = decryptTotpSecret(secret);
  const uri = buildTotpKeyUri(plain, admin.email);
  const qr = await totpSetupQrDataUrl(plain, admin.email);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="rounded-card border border-border bg-card p-6 shadow-card sm:p-8">
          <LogoMark className="h-12 w-12" />
          <h1 className="mt-5 text-2xl font-bold text-ink">Set up two-step verification</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Your account needs an authenticator app before you can use the dashboard. This keeps Bremer employee records protected.
          </p>
          <div className="mt-6 grid gap-6 sm:grid-cols-[180px_1fr]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code for authenticator setup" className="h-[180px] w-[180px] rounded-control border border-border" />
            <div className="text-sm">
              <p className="font-semibold text-ink">1. Scan the QR code</p>
              <p className="mt-1 text-muted">Use Google Authenticator, Microsoft Authenticator, 1Password or any TOTP app.</p>
              <p className="mt-4 font-semibold text-ink">2. Or enter this key manually</p>
              <code className="mt-1 block break-all rounded-control bg-surface p-2 font-mono text-xs text-ink">{plain}</code>
              <CopyButton text={plain} label="Copy setup key" />
              <p className="mt-4 text-xs text-muted" dir="ltr">{uri}</p>
            </div>
          </div>
          {error ? (
            <p role="alert" className="mt-4 rounded-control border border-danger bg-danger-tint px-3 py-2 text-sm text-danger-fg">
              That code is not valid. Wait for a new code and try again.
            </p>
          ) : null}
          <form action={enableTwoFactorAction} className="mt-6 space-y-4">
            <label className="block">
              <span className="label">3. Enter the 6-digit code</span>
              <input name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} className="input max-w-[220px] font-mono tracking-[0.2em]" placeholder="123456" />
            </label>
            <button type="submit" className="btn btn-primary">Turn on two-step verification</button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-subtle">{copyrightText()}</p>
      </div>
    </main>
  );
}
