"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { changePasswordAction, type ChangePasswordState } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Field } from "@/components/ui";

export function ChangePasswordForm() {
  const t = useTranslations("auth");
  const tv = useTranslations("validation");
  const te = useTranslations("errors");
  const [state, formAction] = useActionState<ChangePasswordState, FormData>(changePasswordAction, {});

  const message = (code: string | undefined): string | undefined => {
    if (!code) return undefined;
    return tv.has(code) ? tv(code) : tv("unknown");
  };

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error === "invalid_current_password" ? (
        <Alert tone="danger">{t("invalidCurrentPassword")}</Alert>
      ) : null}
      {state.error === "validation" && !state.fieldErrors?.current_password ? (
        <Alert tone="danger">{te("invalidInput")}</Alert>
      ) : null}

      <Field
        label={t("currentPassword")}
        htmlFor="current_password"
        error={message(state.fieldErrors?.current_password)}
      >
        <input
          id="current_password"
          name="current_password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          className="input"
          dir="ltr"
        />
      </Field>

      <Field
        label={t("newPassword")}
        htmlFor="new_password"
        hint={t("passwordPolicyHint")}
        error={message(state.fieldErrors?.new_password)}
      >
        <input
          id="new_password"
          name="new_password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          className="input"
          dir="ltr"
        />
      </Field>

      <Field
        label={t("confirmPassword")}
        htmlFor="confirm_password"
        error={message(state.fieldErrors?.confirm_password)}
      >
        <input
          id="confirm_password"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          className="input"
          dir="ltr"
        />
      </Field>

      <SubmitButton className="btn btn-primary w-full" pendingText={t("saving")}>
        {t("changePassword")}
      </SubmitButton>
    </form>
  );
}
