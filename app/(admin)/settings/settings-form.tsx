"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, ImagePlus, Loader2, Save, Trash2, XCircle } from "lucide-react";
import { saveCompanySettingsAction, testVerifyUrlAction, type SettingsState } from "./actions";
import { CardPreview } from "@/components/CardPreview";
import { Alert, Field, SectionCard, cn } from "@/components/ui";
import { DEFAULT_PRIMARY_COLOR, DEFAULT_SECONDARY_COLOR, contrastRatio, normalizeHexColor, readableTextOn } from "@/lib/colors";
import { supportedTimeZones } from "@/lib/timezone";

export interface SettingsFormValues {
  name: string;
  primary_color: string;
  secondary_color: string;
  contact_phone: string;
  contact_email: string;
  verify_base_url: string;
  time_zone: string;
  custom_domain: string | null;
  idle_timeout_minutes: number;
  default_card_validity_days: number;
  scan_log_retention_days: number;
  logoUrl: string | null;
}

export function SettingsForm({
  initial,
  activeCardCount,
  domainWarning,
}: {
  initial: SettingsFormValues;
  activeCardCount: number;
  domainWarning: boolean;
}) {
  const t = useTranslations("settings");
  const tv = useTranslations("validation");
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(saveCompanySettingsAction, {});
  const [testing, startTest] = useTransition();

  const [name, setName] = useState(initial.name);
  const [primary, setPrimary] = useState(initial.primary_color);
  const [secondary, setSecondary] = useState(initial.secondary_color);
  const [phone, setPhone] = useState(initial.contact_phone);
  const [email, setEmail] = useState(initial.contact_email);
  const [url, setUrl] = useState(initial.verify_base_url);
  const [timeZone, setTimeZone] = useState(initial.time_zone);
  const [customDomain, setCustomDomain] = useState(initial.custom_domain ?? "");
  const [idle, setIdle] = useState(initial.idle_timeout_minutes);
  const [validity, setValidity] = useState(initial.default_card_validity_days);
  const [retention, setRetention] = useState(initial.scan_log_retention_days);
  const [logoPreview, setLogoPreview] = useState(initial.logoUrl);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const timeZones = useMemo(() => supportedTimeZones(), []);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const fieldError = (field: string) => {
    const code = state.fieldErrors?.[field];
    if (!code) return undefined;
    if (tv.has(code)) return tv(code);
    if (t.has(code)) return t(code);
    return tv("unknown");
  };

  const primaryPreview = normalizeHexColor(primary, DEFAULT_PRIMARY_COLOR);
  const secondaryPreview = normalizeHexColor(secondary, DEFAULT_SECONDARY_COLOR);
  const primaryContrast = contrastRatio(primaryPreview, "#ffffff");
  const secondaryContrast = contrastRatio(secondaryPreview, "#ffffff");
  const colorError = (value: string) =>
    fieldError("primary_color") ??
    (value.trim() && !/^#[0-9a-fA-F]{6}$/.test(value.trim()) ? tv("invalid_color") : undefined);
  const secondaryColorError = (value: string) =>
    fieldError("secondary_color") ??
    (value.trim() && !/^#[0-9a-fA-F]{6}$/.test(value.trim()) ? tv("invalid_color") : undefined);
  const failedFields = Object.keys(state.fieldErrors ?? {});
  const fieldLabel = (key: string): string => {
    const labels: Record<string, string> = {
      name: t("companyName"),
      primary_color: t("primaryColor"),
      secondary_color: t("secondaryColor"),
      contact_phone: t("contactPhone"),
      contact_email: t("contactEmail"),
      verify_base_url: t("verifyBaseUrl"),
      time_zone: "Time zone",
      custom_domain: "Custom domain",
      idle_timeout_minutes: t("idleTimeout"),
      default_card_validity_days: t("validityDays"),
      scan_log_retention_days: t("retentionDays"),
    };
    return labels[key] ?? key;
  };
  const domainHost = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  })();

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <form
        action={formAction}
        className="space-y-5"
        noValidate
        onChange={() => setDirty(true)}
        onInput={() => setDirty(true)}
      >
        {state.error === "validation" ? (
          <Alert tone="danger" title={te("invalidInput")}>
            {failedFields.length > 0
              ? `Please fix these fields: ${failedFields.map(fieldLabel).join(", ")}.`
              : "Please check the highlighted fields."}
          </Alert>
        ) : null}
        {state.error === "invalid_logo" ? <Alert tone="danger">{t("logoUploadFailed")}</Alert> : null}
        {state.error === "unknown" ? <Alert tone="danger">{te("serverBody")}</Alert> : null}
        {state.error === "domain_confirmation_required" ? (
          <Alert tone="warning" title={t("domainChangeTitle")}>
            {t("domainChangeBody", { count: state.affectedCards ?? activeCardCount })}
          </Alert>
        ) : null}
        {state.error === "invalid_verify_url" ? (
          <Alert tone="danger" title={t("invalidUrlTitle")}>
            {fieldError("verify_base_url")}
          </Alert>
        ) : null}

        <SectionCard title={t("identity")} description={t("companyNameHint")}>
          <div className="space-y-4">
            <Field label={t("companyName")} htmlFor="name" error={fieldError("name")}>
              <input
                id="name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="input"
                required
                maxLength={200}
              />
            </Field>

            <Field label="Time zone" htmlFor="time_zone" error={fieldError("time_zone")}>
              <input
                id="time_zone"
                name="time_zone"
                value={timeZone}
                onChange={(event) => setTimeZone(event.target.value)}
                className="input"
                list="time-zone-options"
                autoComplete="off"
                required
                maxLength={64}
                placeholder="Search time zones, e.g. Africa/Cairo"
              />
              <datalist id="time-zone-options">
                {timeZones.map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
              <p className="mt-1 text-xs text-muted">Searchable IANA time zone list. Defaults to Africa/Cairo.</p>
            </Field>

            <Field label="Custom domain (optional)" htmlFor="custom_domain" error={fieldError("custom_domain")}>
              <input
                id="custom_domain"
                name="custom_domain"
                value={customDomain}
                onChange={(event) => setCustomDomain(event.target.value)}
                className="input"
                maxLength={255}
                placeholder="verify.example.com"
              />
              <p className="mt-1 text-xs text-muted">Point a CNAME at the app, then enter the hostname here. Tokens presented on another tenant’s host are invalid.</p>
            </Field>

            <div>
              <p className="label">{t("logo")}</p>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-card border border-border bg-white p-2">
                  {logoPreview && !removeLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoPreview} alt={t("logo")} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <ImagePlus className="h-6 w-6 text-subtle" aria-hidden="true" />
                  )}
                </div>
                <div className="space-y-2">
                  <input
                    id="logo"
                    name="logo"
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        setLogoPreview(URL.createObjectURL(file));
                        setRemoveLogo(false);
                        setDirty(true);
                      }
                    }}
                  />
                  <label htmlFor="logo" className="btn btn-secondary btn-sm cursor-pointer">
                    <ImagePlus className="h-4 w-4" aria-hidden="true" />
                    {t("uploadLogo")}
                  </label>
                  <p className="hint">{t("logoHint")}</p>
                  {initial.logoUrl ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-danger-fg"
                      onClick={() => {
                        setRemoveLogo(true);
                        setLogoPreview(null);
                        setDirty(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      {t("removeLogo")}
                    </button>
                  ) : null}
                </div>
              </div>
              <input type="hidden" name="remove_logo" value={removeLogo ? "1" : "0"} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t("branding")} description={t("coloursHint")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("primaryColor")} htmlFor="primary_color" error={colorError(primary)}>
              <div className="flex items-center gap-2">
                <input
                  id="primary_color"
                  type="color"
                  value={primaryPreview}
                  onChange={(event) => setPrimary(event.target.value)}
                  className="h-11 w-14 cursor-pointer rounded-control border border-border bg-card p-1"
                />
                <input
                  aria-label={t("primaryColor")}
                  name="primary_color"
                  value={primary}
                  onChange={(event) => setPrimary(event.target.value)}
                  className="input font-mono text-sm uppercase"
                  dir="ltr"
                />
              </div>
            </Field>
            <Field label={t("secondaryColor")} htmlFor="secondary_color" error={secondaryColorError(secondary)}>
              <div className="flex items-center gap-2">
                <input
                  id="secondary_color"
                  type="color"
                  value={secondaryPreview}
                  onChange={(event) => setSecondary(event.target.value)}
                  className="h-11 w-14 cursor-pointer rounded-control border border-border bg-card p-1"
                />
                <input
                  aria-label={t("secondaryColor")}
                  name="secondary_color"
                  value={secondary}
                  onChange={(event) => setSecondary(event.target.value)}
                  className="input font-mono text-sm uppercase"
                  dir="ltr"
                />
              </div>
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span
              className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 font-semibold"
              style={{ background: primaryPreview, color: readableTextOn(primaryPreview) }}
            >
              {primaryPreview} · {primaryContrast.toFixed(2)}:1
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 font-semibold"
              style={{ background: secondaryPreview, color: readableTextOn(secondaryPreview) }}
            >
              {secondaryPreview} · {secondaryContrast.toFixed(2)}:1
            </span>
            <span className={cn("inline-flex items-center gap-1", primaryContrast >= 4.5 ? "text-success" : "text-warning")}>
              {primaryContrast >= 4.5 ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              {primaryContrast >= 4.5 ? t("contrastOk") : t("contrastLow")}
            </span>
          </div>
        </SectionCard>

        <SectionCard title={t("contact")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("contactPhone")} htmlFor="contact_phone" error={fieldError("contact_phone")}>
              <input
                id="contact_phone"
                name="contact_phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="input"
                dir="ltr"
                required
              />
            </Field>
            <Field label={t("contactEmail")} htmlFor="contact_email" error={fieldError("contact_email")}>
              <input
                id="contact_email"
                name="contact_email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="input"
                dir="ltr"
                required
              />
            </Field>
          </div>
        </SectionCard>


        <SectionCard id="domain" title={t("domain")} description={t("verifyBaseUrlHint", { url: "https://verify.example.com", token: "…" })}>
          <Field label={t("verifyBaseUrl")} htmlFor="verify_base_url" error={fieldError("verify_base_url")}>
            <input
              id="verify_base_url"
              name="verify_base_url"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                setTestResult(null);
              }}
              className="input font-mono text-sm"
              dir="ltr"
              required
              placeholder="https://verify.example.com"
            />
          </Field>
          <p className="hint mt-1">{t("verifyUrlProductionRequired")}</p>
          <p className="mt-1 text-xs text-muted">On a phone, open the LAN address on the same Wi-Fi. Windows may prompt to allow Node.js on private networks; allow it. For HTTPS, use Cloudflare Tunnel or ngrok and paste the tunnel URL here.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={testing}
              onClick={() =>
                startTest(async () => {
                  const result = await testVerifyUrlAction(url);
                  setTestResult(result);
                })
              }
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {testing ? t("testingUrl") : t("testUrl")}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                const response = await fetch("/api/admin/network", { cache: "no-store" });
                if (!response.ok) return;
                const data = (await response.json()) as { url?: string };
                if (data.url) {
                  setUrl(data.url);
                  setTestResult(null);
                }
              }}
            >
              Use my LAN address
            </button>
            {testResult ? (
              <span className={cn("flex items-center gap-1 text-sm", testResult.ok ? "text-success" : "text-danger")}>
                {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {testResult.ok ? t("testUrlOk") : t("testUrlFailed")}
                <span className="text-xs text-muted" dir="ltr">
                  ({testResult.detail})
                </span>
              </span>
            ) : null}
          </div>

          <div className="mt-4 space-y-2">
            {domainWarning ? (
              <Alert tone="warning" title={t("domainWarning")}>
                {t("domainWarningDev")}
              </Alert>
            ) : null}
            {activeCardCount > 0 ? (
              <div className="rounded-control border border-warning bg-warning-tint p-3 text-sm text-warning-fg">
                <p className="font-semibold">{t("domainChangeTitle")}</p>
                <p className="mt-1">{t("domainChangeBody", { count: activeCardCount })}</p>
                <label className="mt-2 flex items-start gap-2">
                  <input type="checkbox" name="confirm_domain_change" value="1" className="mt-1 h-4 w-4 rounded border-border text-brand" />
                  <span>{t("confirmDomainChange")}</span>
                </label>
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title={t("cards")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("validityDays")} htmlFor="default_card_validity_days" error={fieldError("default_card_validity_days")}>
              <input
                id="default_card_validity_days"
                name="default_card_validity_days"
                type="number"
                min={1}
                max={3650}
                value={validity}
                onChange={(event) => setValidity(Number(event.target.value))}
                className="input"
                dir="ltr"
              />
            </Field>
            <Field label={t("idleTimeout")} htmlFor="idle_timeout_minutes" hint={t("idleTimeoutHint")} error={fieldError("idle_timeout_minutes")}>
              <input
                id="idle_timeout_minutes"
                name="idle_timeout_minutes"
                type="number"
                min={5}
                max={1440}
                value={idle}
                onChange={(event) => setIdle(Number(event.target.value))}
                className="input"
                dir="ltr"
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title={t("retention")}>
          <Field label={t("retentionDays")} htmlFor="scan_log_retention_days" hint={t("retentionHint")} error={fieldError("scan_log_retention_days")}>
            <input
              id="scan_log_retention_days"
              name="scan_log_retention_days"
              type="number"
              min={30}
              max={3650}
              value={retention}
              onChange={(event) => setRetention(Number(event.target.value))}
              className="input max-w-xs"
              dir="ltr"
            />
          </Field>
        </SectionCard>

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-border bg-surface/95 py-3 backdrop-blur">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            <Save className="h-4 w-4" aria-hidden="true" />
            {pending ? tc("saving") : t("saveSettings")}
          </button>
          {dirty ? <span className="text-xs text-warning">{t("unsavedChanges")}</span> : null}
        </div>
      </form>

      <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <div className="card p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{t("cardPreview")}</p>
          <CardPreview
            data={{
              companyName: name || t("sampleName"),
              companyLogoUrl: logoPreview && !removeLogo ? logoPreview : null,
              primaryColor: primaryPreview,
              secondaryColor: secondaryPreview,
              employeeName: t("sampleName"),
              jobTitle: t("sampleJob"),
              department: t("sampleDepartment"),
              employeeCode: "BRM-0001",
              photoUrl: null,
              validUntil: "31 Oct 2027",
              domain: domainHost,
              phone,
              email,
            }}
          />
          <p className="mt-2 text-xs text-muted">{t("cardPreviewHint")}</p>
        </div>

        <div className="card overflow-hidden">
          <div className="px-4 py-3" style={{ background: primary, color: readableTextOn(primary) }}>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{t("verifyPreview")}</p>
            <p className="mt-1 text-lg font-bold">{name || t("sampleName")}</p>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success-tint text-success">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">{t("sampleName")}</p>
                <p className="text-xs text-muted">{t("sampleJob")}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted">{t("securityNote")}</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
