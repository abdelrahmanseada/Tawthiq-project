"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { Badge, cn } from "@/components/ui";
import { logoutAction } from "@/app/(admin)/actions";

export function UserMenu({ name, email, roleLabel }: { name: string; email: string; roleLabel: string }) {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function close(returnFocus = false) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) close(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        className="flex min-h-10 items-center gap-2 rounded-control px-2 hover:bg-surface"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="user-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-fg">
          {name.trim().charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-[130px] truncate text-sm font-medium text-ink sm:block">{name}</span>
        <ChevronDown className={cn("hidden h-4 w-4 text-subtle transition-transform duration-[180ms] sm:block", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open ? (
        <div
          id="user-menu"
          role="menu"
          className="menu-enter absolute end-0 top-full z-[70] mt-2 w-64 rounded-card border border-border bg-card p-2 shadow-raised"
        >
          <div className="border-b border-border px-2 py-2">
            <p className="truncate text-sm font-semibold text-ink">{name}</p>
            <p className="truncate text-xs text-muted">{email}</p>
            <Badge tone="info">{roleLabel}</Badge>
          </div>
          <Link
            href="/account"
            role="menuitem"
            className="mt-1 flex rounded-control px-3 py-2 text-sm text-ink hover:bg-surface"
            onClick={() => close(false)}
          >
            {t("nav.account")}
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full rounded-control px-3 py-2 text-start text-sm text-danger-fg hover:bg-danger-tint"
            >
              {t("common.logout")}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
