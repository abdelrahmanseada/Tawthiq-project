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
}: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value} aria-busy={pending}>
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
