"use client";

import type { ReactNode } from "react";

/**
 * Wraps a Server Action form with a native confirmation dialog so destructive
 * actions (revoke, delete, rollback) always require an explicit confirmation.
 */
export function ConfirmForm({
  action,
  message,
  children,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  message: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
