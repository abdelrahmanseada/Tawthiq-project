"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { profileAction, type ProfileState } from "./actions";

const initial: ProfileState = {};

export function ProfileForm({
  initialName,
  initialEmail,
  totpEnabled,
  labels,
}: {
  initialName: string;
  initialEmail: string;
  totpEnabled: boolean;
  labels: {
    name: string;
    email: string;
    currentPassword: string;
    code: string;
    save: string;
    saving: string;
    success: string;
    emailSuccess: string;
    emailHint: string;
    codeHint: string;
    invalidPassword: string;
    invalidCode: string;
    locked: string;
    rateLimited: string;
    forbidden: string;
    unsaved: string;
  };
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [baseline, setBaseline] = useState({ name: initialName, email: initialEmail.toLowerCase() });
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastEmailChanged, setLastEmailChanged] = useState(false);
  const latest = useRef({ name, email });
  latest.current = { name, email };
  const [state, formAction] = useActionState(profileAction, initial);

  const dirty = name !== baseline.name || email.trim().toLowerCase() !== baseline.email || password.length > 0 || code.length > 0;
  const emailChanged = email.trim().toLowerCase() !== baseline.email;
  const errors = state.fieldErrors ?? {};

  useEffect(() => {
    if (!state.success) return;
    setBaseline({ name: latest.current.name, email: latest.current.email.trim().toLowerCase() });
    setPassword("");
    setCode("");
    setLastEmailChanged(Boolean(state.emailChanged));
    setShowSuccess(true);
    router.refresh();
    const timeout = window.setTimeout(() => setShowSuccess(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [state.success, state.emailChanged, router]);

  useEffect(() => {
    function guard(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = labels.unsaved;
    }
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, labels.unsaved]);

  function fieldMessage(value: string | undefined): string | undefined {
    if (!value) return undefined;
    return ({
      required: "This field is required.",
      too_short: "Use at least 2 characters.",
      too_long: "This value is too long.",
      latin_only: "Use Latin letters, numbers and punctuation only.",
      invalid_current_password: "The current password is incorrect.",
      invalid_code: "Enter the current 6-digit authenticator code.",
      email_taken: "That e-mail address is already in use.",
    } as Record<string, string>)[value] ?? "Check this field.";
  }

  const generalError = useMemo(() => {
    switch (state.error) {
      case "account_locked":
        return labels.locked;
      case "rate_limited":
        return labels.rateLimited;
      case "forbidden":
        return labels.forbidden;
      default:
        return null;
    }
  }, [state.error, labels]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {generalError ? <Alert tone="danger">{generalError}</Alert> : null}
      <div>
        <label className="label" htmlFor="profile-name">{labels.name}</label>
        <input
          id="profile-name"
          name="name"
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          minLength={2}
          maxLength={80}
          autoComplete="name"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "profile-name-error" : undefined}
          required
        />
        {errors.name ? <p id="profile-name-error" role="alert" className="field-error">{fieldMessage(errors.name)}</p> : null}
      </div>

      <div>
        <label className="label" htmlFor="profile-email">{labels.email}</label>
        <input
          id="profile-email"
          name="email"
          type="email"
          className="input"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={254}
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "profile-email-error" : "profile-email-hint"}
          required
        />
        {errors.email ? <p id="profile-email-error" role="alert" className="field-error">{fieldMessage(errors.email)}</p> : null}
        <p id="profile-email-hint" className="hint">{labels.emailHint}</p>
      </div>

      {emailChanged ? (
        <div className="space-y-4 rounded-control border border-border bg-surface p-3">
          <p className="text-xs leading-relaxed text-muted">{labels.codeHint}</p>
          <div>
            <label className="label" htmlFor="profile-password">{labels.currentPassword}</label>
            <input
              id="profile-password"
              name="current_password"
              type="password"
              className="input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              aria-invalid={Boolean(errors.current_password)}
              aria-describedby={errors.current_password ? "profile-password-error" : undefined}
            />
            {errors.current_password ? <p id="profile-password-error" role="alert" className="field-error">{fieldMessage(errors.current_password)}</p> : null}
          </div>
          {totpEnabled ? (
            <div>
              <label className="label" htmlFor="profile-code">{labels.code}</label>
              <input
                id="profile-code"
                name="code"
                className="input"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                aria-invalid={Boolean(errors.code)}
                aria-describedby={errors.code ? "profile-code-error" : undefined}
              />
              {errors.code ? <p id="profile-code-error" role="alert" className="field-error">{fieldMessage(errors.code)}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className="btn btn-primary" pendingText={labels.saving} disabled={!dirty}>
          {labels.save}
        </SubmitButton>
        {dirty ? <span className="text-xs text-muted">{labels.unsaved}</span> : null}
      </div>

      {showSuccess ? (
        <div role="status" className="toast-enter fixed bottom-4 end-4 z-[80] max-w-sm rounded-control border border-success bg-success-tint px-4 py-3 text-sm font-medium text-success-fg shadow-raised">
          {lastEmailChanged ? labels.emailSuccess : labels.success}
        </div>
      ) : null}
    </form>
  );
}
