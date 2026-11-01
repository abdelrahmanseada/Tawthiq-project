"use client";

import { useState } from "react";
import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Save, X } from "lucide-react";
import { saveEmployeeAction, type EmployeeFormState } from "./actions";
import { PhotoCropper } from "@/components/PhotoCropper";
import { CardPreview } from "@/components/CardPreview";
import { Alert, Field } from "@/components/ui";
import { formatDate } from "@/lib/format";

export interface EmployeeFormValues {
  id?: string;
  employee_code: string;
  full_name: string;
  department: string | null;
  job_title: string | null;
  status: "ACTIVE" | "SUSPENDED" | "TERMINATED";
  expires_at: string;
  photo_url: string | null;
}

export interface FormCompany {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  contact_phone: string;
  contact_email: string;
  time_zone: string;
  verify_base_url: string;
}

export function EmployeeForm({
  initial,
  company,
}: {
  initial: EmployeeFormValues;
  company: FormCompany;
}) {
  const t = useTranslations("employees");
  const tv = useTranslations("validation");
  const te = useTranslations("errors");
  const ts = useTranslations("statuses");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState<EmployeeFormState, FormData>(saveEmployeeAction, {});

  const [fullName, setFullName] = useState(initial.full_name);
  const [department, setDepartment] = useState(initial.department ?? "");
  const [jobTitle, setJobTitle] = useState(initial.job_title ?? "");
  const [employeeCode, setEmployeeCode] = useState(initial.employee_code);
  const [expiresAt, setExpiresAt] = useState(initial.expires_at);
  const [photoUrl, setPhotoUrl] = useState(initial.photo_url);

  const fieldError = (field: string) => {
    const code = state.fieldErrors?.[field];
    if (!code) return undefined;
    return tv.has(code) ? tv(code) : tv("unknown");
  };

  let domain = company.verify_base_url;
  try {
    domain = new URL(company.verify_base_url).host;
  } catch {
    // keep the raw value for preview
  }

  return (
    <form action={formAction} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]" noValidate>
      {initial.id ? <input type="hidden" name="employee_id" value={initial.id} /> : null}

      <div className="space-y-5">
        {state.error === "employee_code_taken" ? <Alert tone="danger">{t("employeeCodeTaken")}</Alert> : null}
        {state.error === "invalid_photo" ? <Alert tone="danger">{t("invalidPhoto")}</Alert> : null}
        {state.error === "validation" ? <Alert tone="danger">{te("invalidInput")}</Alert> : null}
        {state.error === "not_found" ? <Alert tone="danger">{te("notFoundTitle")}</Alert> : null}
        {state.error === "unknown" ? <Alert tone="danger">{te("serverBody")}</Alert> : null}

        <section className="panel space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t("code")}
              htmlFor="employee_code"
              hint={initial.id ? t("codeReadonly") : t("codeHint")}
              error={fieldError("employee_code")}
            >
              <input
                id="employee_code"
                name="employee_code"
                type="text"
                required
                maxLength={64}
                value={employeeCode}
                onChange={(event) => setEmployeeCode(event.target.value)}
                readOnly={Boolean(initial.id)}
                className="input read-only:bg-surface read-only:text-muted"
                dir="ltr"
              />
            </Field>

            <Field label={t("fullName")} htmlFor="full_name" error={fieldError("full_name")}>
              <input
                id="full_name"
                name="full_name"
                type="text"
                required
                minLength={2}
                maxLength={200}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="input"
              />
            </Field>

            <Field label={t("department")} htmlFor="department" error={fieldError("department")}>
              <input
                id="department"
                name="department"
                type="text"
                maxLength={120}
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                className="input"
              />
            </Field>

            <Field label={t("jobTitle")} htmlFor="job_title" error={fieldError("job_title")}>
              <input
                id="job_title"
                name="job_title"
                type="text"
                maxLength={120}
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
                className="input"
              />
            </Field>

            <Field label={t("statusLabel")} htmlFor="status" error={fieldError("status")}>
              <select id="status" name="status" defaultValue={initial.status} className="input">
                <option value="ACTIVE">{ts("employeeActive")}</option>
                <option value="SUSPENDED">{ts("employeeSuspended")}</option>
                <option value="TERMINATED">{ts("employeeTerminated")}</option>
              </select>
            </Field>

            <Field label={t("expiresAt")} htmlFor="expires_at" hint={t("expiresHint")} error={fieldError("expires_at")}>
              <input
                id="expires_at"
                name="expires_at"
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                className="input"
                dir="ltr"
              />
            </Field>
          </div>
        </section>

        <section className="panel">
          <h2 className="mb-3 text-base font-semibold text-ink">{t("photo")}</h2>
          <PhotoCropper
            name="photo"
            initialUrl={initial.photo_url}
            labels={{
              upload: t("photoUpload"),
              camera: t("photoCamera"),
              remove: t("removePhoto"),
              zoom: t("zoom"),
              hint: t("photoHint"),
              error: t("invalidPhoto"),
              noPhoto: t("noPhoto"),
            }}
            onPreview={setPhotoUrl}
          />
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            <Save className="h-4 w-4" aria-hidden="true" />
            {pending ? tc("saving") : tc("save")}
          </button>
          <Link href={initial.id ? `/employees/${initial.id}` : "/employees"} className="btn btn-secondary">
            <X className="h-4 w-4" aria-hidden="true" />
            {tc("cancel")}
          </Link>
        </div>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="panel">
          <CardPreview
            data={{
              companyName: company.name,
              companyLogoUrl: company.logo_url ? `/api/media/logo?company=${company.id}&v=${encodeURIComponent(company.logo_url)}` : null,
              primaryColor: company.primary_color,
              secondaryColor: company.secondary_color,
              employeeName: fullName || t("sampleName"),
              jobTitle: jobTitle || null,
              department: department || null,
              employeeCode: employeeCode || "—",
              photoUrl,
              validUntil: expiresAt ? formatDate(new Date(`${expiresAt}T12:00:00.000Z`), "en", company.time_zone) : "—",
              domain,
              phone: company.contact_phone,
              email: company.contact_email,
            }}
          />
          <p className="mt-3 text-xs leading-relaxed text-muted">{t("previewHint")}</p>
        </div>
      </aside>
    </form>
  );
}
