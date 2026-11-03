"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/** Submit button that disables itself while the enclosing form action is pending. */
export function SubmitButton({
  children,
  pendingText,
  className = "btn btn-primary",
  name,
  value,
  disabled,
}: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} name={name} value={value} aria-busy={pending}>
      {pending ? <span className="spinner" aria-hidden="true" /> : null}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
