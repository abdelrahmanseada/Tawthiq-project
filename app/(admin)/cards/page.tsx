import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { Alert, PageHeader, Pagination, SectionCard } from "@/components/ui";
import { CardsSelector } from "@/components/CardsSelector";
import { ConfirmForm } from "@/components/ConfirmForm";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import { env } from "@/lib/env";
import type { Locale } from "@/lib/locale";
import { validateVerifyBaseUrl } from "@/lib/qr";
import { prisma } from "@/lib/db";
import { employeePhotoUrl, listEmployees } from "@/lib/services/employees";
import { employeeListQuerySchema, searchParamsToObject } from "@/lib/validation/schemas";
import { reissueAllCardsAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cards");
  return { title: t("title") };
}

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requirePermission("cards.read");
  const [t, tp, tc, tn] = await Promise.all([
    getTranslations("cards"),
    getTranslations("pagination"),
    getTranslations("common"),
    getTranslations("nav"),
  ]);
  const locale = (await getLocale()) as Locale;
  const canWrite = can(admin.role, "cards.write");

  const params = await searchParams;
  const parsed = employeeListQuerySchema.safeParse({ ...searchParamsToObject(params), deleted: "0" });
  const query = parsed.success ? parsed.data : employeeListQuerySchema.parse({});
  const data = await listEmployees(admin.companyId, query);
  const rows = data.rows.map((row) => ({ ...row, photoUrl: employeePhotoUrl(row) }));
  const selected = Array.isArray(params.ids) ? params.ids : typeof params.ids === "string" ? [params.ids] : [];

  const legacyCount = await prisma.card.count({
    where: { status: "ACTIVE", token_enc: null, employee: { company_id: admin.companyId, deleted_at: null } },
  });
  const urlCheck = validateVerifyBaseUrl(admin.company.verify_base_url, env.NODE_ENV === "production");
  const printingAllowed = urlCheck.ok && urlCheck.productionValid;

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {params.reissued ? <Alert tone="success">{t("reissued", { count: Number(params.reissued) })}</Alert> : null}

      {!printingAllowed ? (
        <Alert tone="warning" title={t("blockedTitle")}>
          <div className="flex flex-wrap items-center gap-2">
            <span>{t("blockedDomain")}</span>
            <Link href="/settings#domain" className="link">
              {tn("settings")}
            </Link>
          </div>
        </Alert>
      ) : null}

      {legacyCount > 0 ? (
        <div className="mt-4">
          <Alert tone="warning" title={t("legacyWarning", { count: legacyCount })}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                {t("reissueWarning")}
              </span>
              {canWrite ? (
                <ConfirmForm action={reissueAllCardsAction} message={t("confirmReissue")}>
                  <button type="submit" className="btn btn-secondary btn-sm">
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    {t("reissueAll")}
                  </button>
                </ConfirmForm>
              ) : null}
            </div>
          </Alert>
        </div>
      ) : null}

      <SectionCard className="mt-4 mb-4">
        <form action="/cards" method="get" className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="q">
              {tc("search")}
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={query.q}
              placeholder={t("searchPlaceholder")}
              className="input"
            />
          </div>
          <button type="submit" className="btn btn-primary">
            {tc("search")}
          </button>
          <Link href="/cards" className="btn btn-secondary">
            {tc("reset")}
          </Link>
        </form>
        <p className="hint mt-3">{t("selectHint")}</p>
      </SectionCard>

      <CardsSelector
        rows={rows}
        selected={selected}
        company={admin.company}
        locale={locale}
        printingAllowed={printingAllowed}
        canWrite={canWrite}
      />

      <Pagination
        basePath="/cards"
        query={{ q: query.q }}
        page={data.page}
        pageCount={data.pageCount}
        labels={{ previous: tc("previous"), next: tc("next"), pageOf: tp("pageOf", { page: data.page, pages: data.pageCount }) }}
      />
    </div>
  );
}
