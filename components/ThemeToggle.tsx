"use client";

import { useTransition } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { setThemeAction } from "@/app/(admin)/theme-actions";
import type { Theme } from "@/lib/theme";
import { cn } from "@/components/ui";

export function ThemeToggle({ current }: { current: Theme }) {
  const t = useTranslations("common");
  const [pending, startTransition] = useTransition();

  function choose(theme: Theme) {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    if (theme !== "system") root.classList.add(theme);
    root.dataset.theme = theme;
    startTransition(async () => {
      await setThemeAction(theme);
    });
  }

  const options: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
    { value: "light", label: t("light"), icon: Sun },
    { value: "dark", label: t("dark"), icon: Moon },
    { value: "system", label: t("systemTheme"), icon: Monitor },
  ];

  return (
    <details className="group relative">
      <summary
        className="btn btn-secondary btn-icon list-none cursor-pointer [&::-webkit-details-marker]:hidden"
        aria-label={t("theme")}
        title={t("theme")}
      >
        {current === "dark" ? <Moon className="h-4 w-4" /> : current === "light" ? <Sun className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
      </summary>
      <div className="absolute end-0 z-50 mt-2 w-44 rounded-card border border-border bg-card p-1.5 shadow-raised">
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => choose(option.value)}
              disabled={pending}
              className={cn(
                "flex w-full items-center gap-2 rounded-control px-3 py-2 text-start text-sm hover:bg-surface disabled:opacity-60",
                current === option.value ? "font-semibold text-brand" : "text-ink",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {option.label}
              {current === option.value ? <span className="ms-auto text-brand">•</span> : null}
            </button>
          );
        })}
      </div>
    </details>
  );
}
