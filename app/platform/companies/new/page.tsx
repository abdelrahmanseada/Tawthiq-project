import Link from "next/link";
import { Alert } from "@/components/ui";
import { createPlatformCompanyAction } from "../../actions";

export const dynamic = "force-dynamic";

const ERROR_COPY: Record<string, string> = {
  validation: "Check the fields. Names must use English letters only, the slug must be lowercase letters/numbers/dashes, and the temporary password must meet the policy.",
  slug_taken: "That slug is already in use.",
  email_taken: "An account with that e-mail already exists.",
  invalid_url: "PUBLIC_VERIFY_URL is not a usable verification URL.",
};

export default async function NewCompanyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">Platform console</p>
      <h1 className="mt-1 text-2xl font-bold text-ink">Create company</h1>
      <p className="mt-1 text-sm text-muted">The owner receives a temporary password and must change it on first sign-in. There is no self-signup and no e-mail is sent.</p>
      {error ? (
        <div className="mt-4">
          <Alert tone="danger">{ERROR_COPY[error] ?? "The company could not be created."}</Alert>
        </div>
      ) : null}

      <form action={createPlatformCompanyAction} className="mt-5 card space-y-5 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Company name</span>
            <input name="name" className="input" required minLength={2} maxLength={200} placeholder="Acme Manufacturing" />
          </label>
          <label className="block">
            <span className="label">Slug</span>
            <input name="slug" className="input" required minLength={2} maxLength={80} pattern="[a-z0-9-]+" placeholder="acme-manufacturing" />
            <span className="mt-1 block text-xs text-muted">Lowercase letters, numbers and dashes. Used in support and URLs.</span>
          </label>
          <label className="block">
            <span className="label">Owner name</span>
            <input name="owner_name" className="input" required minLength={2} maxLength={120} placeholder="Alex Morgan" />
          </label>
          <label className="block">
            <span className="label">Owner e-mail</span>
            <input name="owner_email" type="email" className="input" required maxLength={254} placeholder="owner@acme.example" />
          </label>
          <label className="block">
            <span className="label">Temporary password</span>
            <input name="temporary_password" type="password" className="input" required minLength={12} maxLength={128} autoComplete="new-password" />
            <span className="mt-1 block text-xs text-muted">At least 12 characters with a letter and a number. The owner must change it.</span>
          </label>
          <label className="block">
            <span className="label">Employee limit</span>
            <input name="max_employees" type="number" className="input" min={1} max={100000} defaultValue={100} required />
          </label>
          <label className="block">
            <span className="label">Time zone</span>
            <input name="time_zone" className="input" defaultValue="Africa/Cairo" required maxLength={64} />
            <span className="mt-1 block text-xs text-muted">IANA time zone, e.g. Europe/London.</span>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" className="btn btn-primary">Create company</button>
          <Link href="/platform/companies" className="btn btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
