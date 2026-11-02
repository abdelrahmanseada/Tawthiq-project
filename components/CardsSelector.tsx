"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, IdCard, Loader2, Printer, ShieldAlert } from "lucide-react";
import { Badge, EmptyState, cn } from "@/components/ui";
import { CardPreview } from "@/components/CardPreview";
import type { Locale } from "@/lib/locale";
import { formatDate } from "@/lib/format";

export interface CardPickerRow {
  id: string;
  employee_code: string;
  full_name: string;
  department: string | null;
  job_title: string | null;
  photoUrl: string | null;
  card: {
    status: string;
    expires_at: Date;
    has_token: boolean;
  } | null;
}

type Mode = "cr80" | "print_shop" | "a4" | "test";

export function CardsSelector({
  rows,
  selected: initialSelected,
  company,
  locale,
  printingAllowed,
  canWrite,
}: {
  rows: CardPickerRow[];
  selected: string[];
  company: {
    id: string;
    name: string;
    logo_url: string | null;
    logo_bg_dark: boolean;
    primary_color: string;
    secondary_color: string;
    contact_phone: string;
    contact_email: string;
    verify_base_url: string;
    time_zone: string;
  };
  locale: Locale;
  printingAllowed: boolean;
  canWrite: boolean;
}) {
  const t = useTranslations("cards");
  const tc = useTranslations("common");
  const ts = useTranslations("statuses");
  const [selected, setSelected] = useState<string[]>(initialSelected.filter((id) => rows.some((row) => row.id === id)));
  const [mode, setMode] = useState<Mode>("cr80");
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const selectedRows = rows.filter((row) => selected.includes(row.id));
  const first = selectedRows[0] ?? null;

  let domain = company.verify_base_url;
  try {
    domain = new URL(company.verify_base_url).host;
  } catch {
    // raw value
  }

  const blockers = useMemo(() => {
    const list: string[] = [];
    if (selected.length === 0) return list;
    if (!printingAllowed && mode !== "test") list.push(t("blockedDomain"));
    for (const row of selectedRows) {
      if (!row.card || row.card.status !== "ACTIVE") list.push(t("blockedExpired"));
      else if (!row.card.has_token) list.push(t("blockedReissue"));
      else if (row.card.expires_at.getTime() <= Date.now()) list.push(t("blockedExpired"));
      if (!row.photoUrl && mode !== "test") list.push(t("blockedPhoto"));
    }
    if (!selectedRows.some((row) => !row.photoUrl && mode === "test") && selectedRows.some((row) => !row.photoUrl) && mode === "test") {
      // test prints may omit photos; no blocker here
    }
    return [...new Set(list)];
  }, [mode, printingAllowed, selected, selectedRows, t]);

  const blocked = blockers.length > 0;

  const endpoint = mode === "a4" ? "/api/admin/cards/pdf" : "/api/admin/cards/zip";
  const payloadMode = mode === "print_shop" ? "print_shop" : mode === "test" ? "test" : "cr80";

  async function downloadCards() {
    if (selected.length === 0 || blocked) return;
    setDownloading(true);
    setToast(null);
    try {
      const body = new FormData();
      for (const id of selected) body.append("ids", id);
      body.append("mode", payloadMode);
      const response = await fetch(endpoint, { method: "POST", body, headers: { Accept: "application/pdf,application/zip" } });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setToast({ kind: "error", message: payload?.error?.message ?? t("failed") });
        return;
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? (mode === "a4" ? "employee-cards-a4.pdf" : "employee-cards.zip");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setToast({ kind: "success", message: t("generated") });
      window.setTimeout(() => setToast(null), 4000);
    } catch {
      setToast({ kind: "error", message: t("failed") });
    } finally {
      setDownloading(false);
    }
  }

  const options: Array<{ value: Mode; title: string; description: string }> = [
    { value: "cr80", title: t("modeCr80"), description: t("modeCr80Hint") },
    { value: "print_shop", title: t("modePrint"), description: t("modePrintHint") },
    { value: "a4", title: t("modeA4"), description: t("modeA4Hint") },
    { value: "test", title: t("modeTest"), description: t("modeTestHint") },
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-4">
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-ink">{t("selectedCount", { count: selected.length })}</p>
            <button
              type="button" className="btn btn-ghost btn-sm"
              onClick={() => setSelected(rows.map((row) => row.id))}
            >
              {t("selectAll")}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected([])} disabled={selected.length === 0}>
              {t("clearSelection")}
            </button>
          </div>
        </div>

        <div className="table-wrap">
          {rows.length === 0 ? (
            <EmptyState title={t("noEmployees")} />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th className="th w-10">
                    <span className="sr-only">{t("selectEmployees")}</span>
                  </th>
                  <th className="th">{t("selectEmployees")}</th>
                  <th className="th hidden sm:table-cell">{tc("status")}</th>
                  <th className="th">{t("cardPreview")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className={cn(selected.includes(row.id) && "bg-brand-tint")}>
                    <td className="td">
                      <input
                        type="checkbox"
                        aria-label={`${t("selectEmployees")} ${row.full_name}`}
                        checked={selected.includes(row.id)}
                        onChange={() =>
                          setSelected((current) =>
                            current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id],
                          )
                        } className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                      />
                    </td>
                    <td className="td">
                      <p className="font-semibold text-ink">{row.full_name}</p>
                      <p className="text-xs text-muted" dir="ltr">{row.employee_code}</p>
                    </td>
                    <td className="td hidden sm:table-cell">
                      <div className="flex flex-wrap gap-1.5">
                        {row.card ? (
                          <Badge tone={row.card.status === "ACTIVE" ? "success" : "danger"}>
                            {row.card.status === "ACTIVE" ? ts("cardActive") : ts("cardRevoked")}
                          </Badge>
                        ) : (
                          <Badge tone="neutral">{t("photoMissing")}</Badge>
                        )}
                        {!row.photoUrl ? <Badge tone="warning">{t("photoMissing")}</Badge> : null}
                        {!row.card?.has_token && row.card ? <Badge tone="warning">{t("blockedReissue")}</Badge> : null}
                      </div>
                      {row.card ? <p className="mt-1 text-xs text-muted">{formatDate(row.card.expires_at, locale)}</p> : null}
                    </td>
                    <td className="td">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelected([row.id])}>
                        {tc("preview")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className={cn("card space-y-4 p-4", !canWrite && "hidden")}>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">{t("outputMode")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {options.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-control border p-3",
                    mode === option.value ? "border-brand bg-brand-tint" : "border-border hover:bg-surface",
                  )}
                >
                  <input
                    type="radio"
                    name="output_choice"
                    value={option.value}
                    checked={mode === option.value}
                    onChange={() => setMode(option.value)} className="mt-1 h-4 w-4 text-brand focus:ring-brand"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink">{option.title}</span>
                    <span className="block text-xs leading-relaxed text-muted">{option.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {blocked ? (
            <div className="rounded-control border border-warning bg-warning-tint p-3 text-sm text-warning-fg">
              <p className="flex items-center gap-1.5 font-semibold">
                <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                {t("blockedTitle")}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 ps-5">
                {blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={downloadCards} className="btn btn-primary" disabled={selected.length === 0 || blocked || downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : mode === "a4" ? <Printer className="h-4 w-4" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
              {downloading ? t("generating") : mode === "a4" ? t("downloadA4") : t("downloadZip")}
            </button>
            <span className="text-xs text-muted">{t("printHint")}</span>
          </div>
        </div>
        {toast ? (
          <div
            role={toast.kind === "error" ? "alert" : "status"}
            className={cn(
              "fixed bottom-4 end-4 z-50 max-w-sm rounded-control border px-4 py-3 text-sm shadow-raised",
              toast.kind === "error" ? "border-danger bg-danger-tint text-danger-fg" : "border-success bg-success-tint text-success-fg",
            )}
          >
            {toast.message}
          </div>
        ) : null}
      </div>

      <aside className="xl:sticky xl:top-20 xl:self-start">
        <div className="card p-4">
          {first ? (
            <CardPreview
              data={{
                companyName: company.name,
                companyLogoUrl: company.logo_url ? `/api/media/logo?company=${company.id}&v=${encodeURIComponent(company.logo_url)}` : null,
                logoBgDark: company.logo_bg_dark,
                primaryColor: company.primary_color,
                secondaryColor: company.secondary_color,
                employeeName: first.full_name,
                jobTitle: first.job_title,
                department: first.department,
                employeeCode: first.employee_code,
                photoUrl: first.photoUrl,
                validUntil: first.card ? formatDate(first.card.expires_at, "en") : "—",
                domain,
                phone: company.contact_phone,
                email: company.contact_email,
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted">
              <IdCard className="h-10 w-10 text-subtle" aria-hidden="true" />
              <p className="text-sm">{t("previewEmpty")}</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
