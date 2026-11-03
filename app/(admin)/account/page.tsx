import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { KeyRound, Monitor } from "lucide-react";
import { Alert, Badge, EmptyState, PageHeader, SectionCard } from "@/components/ui";
import { ConfirmForm } from "@/components/ConfirmForm";
import { requirePermission } from "@/lib/auth/session";
import { listUserSessions } from "@/lib/auth/session-registry";
import { friendlyUserAgent } from "@/lib/user-agent";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/lib/locale";
import { ProfileForm } from "./profile-form";
import { revokeSessionAction, signOutOtherSessionsAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admins");
  return { title: t("accountTitle") };
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requirePermission("dashboard.view");
  const [t, tr, ta] = await Promise.all([
    getTranslations("admins"),
    getTranslations("roles"),
    getTranslations("auth"),
  ]);
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const sessions = await listUserSessions(admin.id);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t("accountTitle")}
        subtitle={t("accountSubtitle")}
        actions={
          <Link href="/dashboard" className="btn btn-secondary btn-sm">
            {t("backToDashboard")}
          </Link>
        }
      />
      {params.sessions ? (
        <Alert tone="success">{t("signedOutOthers", { count: Number(params.sessions) || 0 })}</Alert>
      ) : null}
      {params.revoked ? <Alert tone="success">{t("sessionRevoked")}</Alert> : null}

      <div className="mt-4 grid items-start gap-5 lg:grid-cols-2">
        <SectionCard title={t("profile")} description={t("profileHint")}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-sm text-muted">{t("role")}</span>
            <Badge tone="info">{tr(admin.role)}</Badge>
          </div>
          <ProfileForm
            initialName={admin.name}
            initialEmail={admin.email}
            totpEnabled={admin.totpEnabled}
            labels={{
              name: t("name"),
              email: t("email"),
              currentPassword: t("currentPassword"),
              code: t("code"),
              save: t("saveProfile"),
              saving: t("savingProfile"),
              success: t("profileSaved"),
              emailSuccess: t("profileEmailSaved"),
              emailHint: t("emailHint"),
              codeHint: t("codeHint"),
              invalidPassword: t("profileInvalidPassword"),
              invalidCode: t("profileInvalidCode"),
              locked: t("profileLocked"),
              rateLimited: t("profileRateLimited"),
              forbidden: t("profileForbidden"),
              unsaved: t("profileUnsaved"),
            }}
          />
          <div className="mt-5 border-t border-border pt-4">
            <Link href="/change-password" className="btn btn-secondary btn-sm">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              {ta("changePassword")}
            </Link>
          </div>
        </SectionCard>

        <SectionCard title={t("sessionsTitle")} description={t("sessionsHint")}>
          {sessions.length === 0 ? (
            <EmptyState title={t("noSessions")} />
          ) : (
            <ul className="max-h-[32rem] space-y-2 overflow-y-auto pe-1">
              {sessions.map((session) => {
                const current = session.id === admin.sessionId;
                return (
                  <li key={session.id} className="rounded-control border border-border p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-medium text-ink">
                          <Monitor className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                          <span className="truncate">{friendlyUserAgent(session.user_agent)}</span>
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {t("sessionLastActive")}: {formatDateTime(session.last_seen_at, locale)}{current ? ` · ${t("sessionCurrentHint")}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {current ? <Badge tone="success">{t("sessionCurrent")}</Badge> : null}
                        {!current ? (
                          <ConfirmForm action={revokeSessionAction} message={t("confirmRevokeSession")}>
                            <input type="hidden" name="session_id" value={session.id} />
                            <button type="submit" className="btn btn-secondary btn-sm">
                              {t("revokeSession")}
                            </button>
                          </ConfirmForm>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <ConfirmForm action={signOutOtherSessionsAction} message={t("confirmSignOutOthers")} className="mt-4">
            <button type="submit" className="btn btn-secondary btn-sm">
              {t("signOutOthers")}
            </button>
          </ConfirmForm>
        </SectionCard>
      </div>
    </div>
  );
}
