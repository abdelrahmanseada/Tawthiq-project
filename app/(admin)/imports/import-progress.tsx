"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface Status {
  status: "PENDING" | "PROCESSING" | "DONE" | "FAILED" | "ROLLED_BACK";
  total_rows: number;
  processed_rows: number;
  success_count: number;
  failed_count: number;
  skipped_count: number;
  error_message: string | null;
}

export function ImportProgress({ batchId, initial }: { batchId: string; initial: Status }) {
  const t = useTranslations("imports");
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initial);

  useEffect(() => {
    if (status.status !== "PROCESSING") return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/admin/import/${batchId}/status`, { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as Status;
        if (cancelled) return;
        setStatus(body);
        if (body.status !== "PROCESSING") {
          clearInterval(timer);
          router.refresh();
        }
      } catch {
        // transient network error: keep polling
      }
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [batchId, router, status.status]);

  const percent =
    status.total_rows > 0 ? Math.min(100, Math.round((status.processed_rows / status.total_rows) * 100)) : 0;

  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-ink-800">
          {status.status === "PROCESSING" ? t("processing") : t("completed")}
        </span>
        <span className="tabular-nums text-ink-600">
          {t("processedRows", { processed: status.processed_rows, total: status.total_rows })}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("progress")}
        className="h-3 w-full overflow-hidden rounded-full bg-ink-200"
      >
        <div
          className="h-full rounded-full bg-teal-600 transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-lg bg-green-50 p-2">
          <p className="text-xs text-green-800">{t("successCount")}</p>
          <p className="font-bold tabular-nums text-green-900">{status.success_count}</p>
        </div>
        <div className="rounded-lg bg-red-50 p-2">
          <p className="text-xs text-red-800">{t("failedCount")}</p>
          <p className="font-bold tabular-nums text-red-900">{status.failed_count}</p>
        </div>
        <div className="rounded-lg bg-ink-100 p-2">
          <p className="text-xs text-ink-600">{t("skippedCount")}</p>
          <p className="font-bold tabular-nums text-ink-800">{status.skipped_count}</p>
        </div>
      </div>
    </div>
  );
}
