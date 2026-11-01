"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createAdminAction, type AdminFormState } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Field } from "@/components/ui";

export function AdminForm() {
  const t = useTranslations("admins");
  const tr = useTranslations("roles");
  const tv = useTranslations("validation");
  const te = useTranslations("errors");
  const [state, formAction] = useActionState<AdminFormState, FormData>(createAdminAction, {});

  const fieldError = (field: string) => {
    const code = state.fieldErrors?.[field];
    if (!code) return undefined;
    return tv.has(code) ? tv(code) : tv("unknown");
  };

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error === "validation" ? <Alert tone="danger">{te("invalidInput")}</Alert> : null}
      {state.error === "email_taken" ? <Alert tone="danger">{t("emailTaken")}</Alert> : null}
      {state.error === "unknown" ? <Alert tone="danger">{te("serverBody")}</Alert> : null}

      <Field label={t("name")} htmlFor="admin_name" error={fieldError("name")}>
        <input id="admin_name" name="name" type="text" required maxLength={120} className="input" />
      </Field>
      <Field label={t("email")} htmlFor="admin_email" error={fieldError("email")}>
        <input id="admin_email" name="email" type="email" required maxLength={254} className="input" dir="ltr" />
      </Field>
      <Field label={t("role")} htmlFor="admin_role" error={fieldError("role")}>
        <select id="admin_role" name="role" defaultValue="ADMIN" className="input">
          <option value="ADMIN">{tr("ADMIN")}</option>
          <option value="SUPER_ADMIN">{tr("SUPER_ADMIN")}</option>
          <option value="VIEWER">{tr("VIEWER")}</option>
        </select>
      </Field>
      <Field label={t("password")} htmlFor="admin_password" hint={t("passwordHint")} error={fieldError("password")}>
        <input
          id="admin_password"
          name="password"
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          className="input"
          dir="ltr"
        />
      </Field>

      <SubmitButton className="btn btn-primary">{t("createAdmin")}</SubmitButton>
    </form>
  );
}
