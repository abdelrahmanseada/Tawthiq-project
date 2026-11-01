import Link from "next/link";
import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { validateVerifyBaseUrl } from "@/lib/qr";
import { markOnboardingCompleteAction, markTestPrintAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const admin = await requirePermission("settings.manage");
  const company = admin.company;
  const [employeeCount, cardCount] = await Promise.all([
    prisma.employee.count({ where: { company_id: company.id, deleted_at: null } }),
    prisma.card.count({ where: { status: "ACTIVE", employee: { company_id: company.id, deleted_at: null } } }),
  ]);
  const urlValid = validateVerifyBaseUrl(company.verify_base_url, env.NODE_ENV === "production").productionValid;
  const profileComplete = Boolean(company.name && company.logo_url && company.contact_email && company.contact_phone);
  const steps = [
    {
      title: "Company profile",
      body: "Add your logo, brand colours, contact details and time zone.",
      done: profileComplete,
      href: "/settings",
      action: "Open company settings",
    },
    {
      title: "Verification URL",
      body: "Use a public HTTPS address so phones can scan the QR. Test it before printing.",
      done: urlValid,
      href: "/settings#domain",
      action: "Set and test URL",
    },
    {
      title: "Add your workforce",
      body: "Create the first employee or import a spreadsheet with optional photos.",
      done: employeeCount > 0 && cardCount > 0,
      href: "/employees/new",
      action: employeeCount > 0 ? "Add another employee" : "Add first employee",
      secondaryHref: "/imports",
      secondary: "Bulk import",
    },
    {
      title: "Print a test card",
      body: "Check the layout with the test print before producing real cards.",
      done: Boolean(company.onboarding_test_print_at),
      href: "/cards?mode=test",
      action: "Open test print",
    },
  ];
  const completed = steps.filter((step) => step.done).length;

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand">Getting started</p>
      <h1 className="mt-1 text-2xl font-bold text-ink">Set up {company.name}</h1>
      <p className="mt-1 text-sm text-muted">Four short steps. You can return here until the workspace is ready.</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-border" aria-hidden="true">
        <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${(completed / steps.length) * 100}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">{completed} of {steps.length} complete</p>

      <ol className="mt-5 space-y-3">
        {steps.map((step, index) => (
          <li key={step.title} className="card p-5">
            <div className="flex items-start gap-3">
              {step.done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-subtle" aria-hidden="true" />}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Step {index + 1}</p>
                <h2 className="mt-0.5 text-sm font-bold text-ink">{step.title}</h2>
                <p className="mt-1 text-sm text-muted">{step.body}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={step.href} className="btn btn-secondary btn-sm">
                    {step.action} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                  {step.secondaryHref ? <Link href={step.secondaryHref} className="btn btn-ghost btn-sm">{step.secondary}</Link> : null}
                  {step.title === "Print a test card" && !step.done ? (
                    <form action={markTestPrintAction}>
                      <button type="submit" className="btn btn-ghost btn-sm">I printed a test card</button>
                    </form>
                  ) : null}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <form action={markOnboardingCompleteAction} className="mt-6 flex items-center gap-3">
        <button type="submit" className="btn btn-primary">Finish setup</button>
        <span className="text-xs text-muted">You can finish now; the checklist remains available in company settings.</span>
      </form>
    </div>
  );
}
