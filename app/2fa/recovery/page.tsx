import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/ui";
import { RECOVERY_CODES_COOKIE } from "@/lib/auth/constants";
import { getCurrentAdmin } from "@/lib/auth/session";
import { copyrightText } from "@/lib/brand";
import { RecoveryCodes } from "./recovery-codes";
import { acknowledgeRecoveryCodesAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recovery codes" };

export default async function RecoveryCodesPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  const store = await cookies();
  let codes: string[] = [];
  try {
    codes = JSON.parse(store.get(RECOVERY_CODES_COOKIE)?.value ?? "[]") as string[];
  } catch {
    codes = [];
  }
  if (codes.length === 0) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="rounded-card border border-border bg-card p-6 shadow-card sm:p-8">
          <LogoMark className="h-12 w-12" />
          <h1 className="mt-5 text-2xl font-bold text-ink">Save your recovery codes</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Each code can be used once if you lose your authenticator. Store them somewhere safe; this is the only time they are shown.
          </p>
          <RecoveryCodes codes={codes} />
          <form action={acknowledgeRecoveryCodesAction} className="mt-6">
            <button type="submit" className="btn btn-primary">I have saved the codes</button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-subtle">{copyrightText()}</p>
      </div>
    </main>
  );
}
