"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileSpreadsheet, Images, Upload } from "lucide-react";
import { Alert } from "@/components/ui";

const ERROR_MESSAGES = new Set([
  "missing_headers",
  "duplicate_headers",
  "row_limit",
  "empty_file",
  "file_too_large",
  "invalid_file_type",
  "zip_invalid",
  "image_invalid",
  "sheet_not_found",
  "too_many_attempts",
]);

export function ImportWizard() {
  const t = useTranslations("imports");
  const tv = useTranslations("validation");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spreadsheetName, setSpreadsheetName] = useState<string | null>(null);
  const [zipName, setZipName] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const spreadsheet = formData.get("spreadsheet");
    if (!(spreadsheet instanceof File) || spreadsheet.size === 0) {
      setError(t("noSpreadsheet"));
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/admin/import/preview", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json()) as {
        batch_id?: string;
        error?: { code?: string; message?: string };
      };
      if (!response.ok || !body.batch_id) {
        const code = body.error?.code ?? "";
        if (ERROR_MESSAGES.has(code)) {
          setError(tv(code));
        } else if (code === "RATE_LIMITED") {
          setError(tv("too_many_attempts"));
        } else {
          setError(t("uploadFailed"));
        }
        setPending(false);
        return;
      }
      router.push(`/imports/${body.batch_id}`);
    } catch {
      setError(t("uploadFailed"));
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" encType="multipart/form-data">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div>
        <label className="label" htmlFor="spreadsheet">
          {t("spreadsheet")}
        </label>
        <input
          id="spreadsheet"
          name="spreadsheet"
          type="file"
          required
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="sr-only"
          onChange={(event) => setSpreadsheetName(event.target.files?.[0]?.name ?? null)}
        />
        <label
          htmlFor="spreadsheet" className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-surface px-4 py-7 text-center hover:border-brand"
        >
          <FileSpreadsheet className="h-8 w-8 text-brand" aria-hidden="true" />
          <span className="text-sm font-semibold text-ink">{t("dropSpreadsheet")}</span>
          <span className="text-xs text-muted">{t("spreadsheetHint")}</span>
          {spreadsheetName ? (
            <span className="mt-1 rounded-pill bg-brand-tint px-3 py-1 text-xs font-medium text-brand" dir="ltr">
              {t("fileSelected", { name: spreadsheetName })}
            </span>
          ) : null}
        </label>
      </div>

      <div>
        <label className="label" htmlFor="photo_zip">
          {t("photoZip")}
        </label>
        <input
          id="photo_zip"
          name="photo_zip"
          type="file"
          accept=".zip,application/zip" className="sr-only"
          onChange={(event) => setZipName(event.target.files?.[0]?.name ?? null)}
        />
        <label
          htmlFor="photo_zip" className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-surface px-4 py-6 text-center hover:border-brand"
        >
          <Images className="h-7 w-7 text-muted" aria-hidden="true" />
          <span className="text-sm font-semibold text-ink">{t("dropZip")}</span>
          <span className="text-xs text-muted">{t("photoZipHint")}</span>
          {zipName ? (
            <span className="mt-1 rounded-pill bg-brand-tint px-3 py-1 text-xs font-medium text-brand" dir="ltr">
              {t("fileSelected", { name: zipName })}
            </span>
          ) : null}
        </label>
      </div>

      <div className="rounded-control bg-surface p-3 text-xs leading-relaxed text-muted">
        <p>{t("requiredHeadersNote")}</p>
        <p className="mt-1">{t("maxRowsNote")}</p>
        <p className="mt-1">{t("photoZipNote")}</p>
      </div>

      <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending}>
        <Upload className="h-4 w-4" aria-hidden="true" />
        {pending ? t("uploading") : t("uploadAndPreview")}
      </button>
    </form>
  );
}
