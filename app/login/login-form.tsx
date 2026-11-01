"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { startLoginAction, type LoginState } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Field } from "@/components/ui";

const ERROR_KEYS = {
  invalid_credentials: "invalidCredentials",
  account_locked: "accountLocked",
  too_many_attempts: "tooManyAttempts",
  invalid_code: "invalidCode",
  validation: "invalidCredentials",
} as const;

export function LoginForm() {
  const t = useTranslations("auth");
  const [state, formAction] = useActionState<LoginState, FormData>(startLoginAction, {});

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error ? <Alert tone="danger">{t(ERROR_KEYS[state.error])}</Alert> : null}

      <Field label={t("email")} htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          maxLength={254}
          defaultValue={state.email ?? ""}
          className="input"
          dir="ltr"
        />
      </Field>

      <Field label={t("password")} htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          className="input"
          dir="ltr"
        />
      </Field>

      <SubmitButton className="btn btn-primary w-full" pendingText={t("signingIn")}>
        {t("signIn")}
      </SubmitButton>
    </form>
  );
}
