import { Check } from "lucide-react";
import { cn } from "@/components/ui";

export function ImportStepper({
  steps,
  active,
}: {
  steps: string[];
  active: number;
}) {
  return (
    <ol className="mb-5 grid grid-cols-4 gap-1" aria-label="Progress">
      {steps.map((step, index) => {
        const done = index < active;
        const current = index === active;
        return (
          <li key={step} className="flex flex-col gap-1.5">
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold",
                done ? "bg-success text-white" : current ? "bg-brand text-brand-fg" : "bg-surface text-subtle ring-1 ring-border",
              )}
              aria-current={current ? "step" : undefined}
            >
              {done ? <Check className="h-4 w-4" aria-hidden="true" /> : index + 1}
            </span>
            <span className={cn("text-xs font-medium", current ? "text-ink" : "text-muted")}>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}
