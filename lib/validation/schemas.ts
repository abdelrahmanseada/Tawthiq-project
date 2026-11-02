import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, checkPasswordPolicy } from "@/lib/security/password";
import { validateVerifyBaseUrl } from "@/lib/qr";
import { env } from "@/lib/env";
import { ValidationError } from "@/lib/http";
import { LATIN_TEXT_PATTERN } from "@/lib/config";
import { isValidTimeZone } from "@/lib/timezone";

const latinText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, "required")
    .max(max, "too_long")
    .refine((value) => LATIN_TEXT_PATTERN.test(value), "latin_only");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value && value.length > 0 ? value : null));

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "required").max(PASSWORD_MAX_LENGTH),
});

export const totpCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "invalid_code"),
});

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, "password_too_short")
  .max(PASSWORD_MAX_LENGTH, "password_too_long")
  .superRefine((value, ctx) => {
    const policyError = checkPasswordPolicy(value);
    if (policyError) ctx.addIssue({ code: z.ZodIssueCode.custom, message: policyError });
  });

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "required").max(PASSWORD_MAX_LENGTH),
    new_password: newPasswordSchema,
    confirm_password: z.string().min(1, "required").max(PASSWORD_MAX_LENGTH),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "password_mismatch",
    path: ["confirm_password"],
  })
  .refine((data) => data.new_password !== data.current_password, {
    message: "password_unchanged",
    path: ["new_password"],
  });

export const employeeStatusSchema = z.enum(["ACTIVE", "SUSPENDED", "TERMINATED"]);

const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "invalid_date");

export const employeeInputSchema = z.object({
  employee_code: z
    .string()
    .trim()
    .min(1, "required")
    .max(64, "too_long")
    .regex(/^[\p{L}\p{N}._-]+$/u, "invalid_employee_code"),
  full_name: latinText(2, 200),
  department: optionalText(120).refine((value) => value === null || LATIN_TEXT_PATTERN.test(value), "latin_only"),
  job_title: optionalText(120).refine((value) => value === null || LATIN_TEXT_PATTERN.test(value), "latin_only"),
  status: employeeStatusSchema.default("ACTIVE"),
  expires_at: isoDateSchema.optional().nullable(),
});

export type EmployeeInput = z.infer<typeof employeeInputSchema>;

export const companySettingsSchema = z.object({
  name: latinText(1, 200),
  tagline: z.string().trim().max(120, "too_long").optional().default(""),
  website: z.union([z.string().trim().url("invalid_url").max(255), z.literal("")]).optional().default(""),
  primary_color: z.string().trim().transform((value) => (value.length === 0 ? "#000000" : value)).refine((value) => /^#[0-9a-fA-F]{6}$/.test(value), "invalid_color"),
  secondary_color: z.string().trim().transform((value) => (value.length === 0 ? "#8F0015" : value)).refine((value) => /^#[0-9a-fA-F]{6}$/.test(value), "invalid_color"),
  show_verify_host_on_card: z.enum(["0", "1"]).optional().default("0"),
  contact_phone: z.string().trim().min(3, "required").max(40, "too_long"),
  contact_email: emailSchema,
  verify_base_url: z
    .string()
    .trim()
    .min(1, "required")
    .max(500, "too_long")
    .superRefine((value, ctx) => {
      const check = validateVerifyBaseUrl(value, env.NODE_ENV === "production");
      const allowed = check.ok && (env.NODE_ENV !== "production" || check.productionValid);
      if (!allowed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: check.errors[0] ?? "invalid_url",
        });
      }
    }),
  time_zone: z.string().trim().min(1, "required").max(64, "too_long").refine((value) => isValidTimeZone(value), "invalid_time_zone"),
  idle_timeout_minutes: z.coerce.number().int().min(5).max(1440),
  default_card_validity_days: z.coerce.number().int().min(1).max(3650),
  scan_log_retention_days: z.coerce.number().int().min(30).max(3650),
});

export type CompanySettingsInput = z.infer<typeof companySettingsSchema>;

export const recoveryCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(8, "invalid_recovery_code")
    .max(32, "invalid_recovery_code")
    .regex(/^[A-Za-z0-9-]+$/, "invalid_recovery_code"),
});

export const bulkEmployeeIdsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "no_selection").max(100, "too_many_selected"),
});

export const employeeExportQuerySchema = z.object({
  format: z.enum(["csv", "xlsx"]).default("csv"),
  q: z.string().trim().max(120).optional().default(""),
  status: z.union([employeeStatusSchema, z.literal("")]).optional().default(""),
  department: z.string().trim().max(120).optional().default(""),
});

export const adminRoleSchema = z.enum(["SUPER_ADMIN", "ADMIN", "VIEWER"]);

export const createAdminSchema = z.object({
  name: latinText(2, 120),
  email: emailSchema,
  role: adminRoleSchema,
  password: newPasswordSchema,
});

export const updateAdminRoleSchema = z.object({
  admin_id: z.string().uuid(),
  role: adminRoleSchema,
});

export const duplicateStrategySchema = z.enum(["SKIP", "UPDATE", "FAIL"]);

export const importConfirmSchema = z.object({
  batch_id: z.string().uuid(),
  strategy: duplicateStrategySchema,
});

export const employeeListQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  status: z.union([employeeStatusSchema, z.literal("")]).optional().default(""),
  department: z.string().trim().max(120).optional().default(""),
  page: z.coerce.number().int().min(1).max(100_000).optional().default(1),
  sort: z.enum(["created_at", "full_name", "employee_code", "status"]).optional().default("created_at"),
  dir: z.enum(["asc", "desc"]).optional().default("desc"),
  deleted: z.enum(["0", "1"]).optional().default("0"),
  photo: z.enum(["all", "missing"]).optional().default("all"),
});

export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;

export const scanLogQuerySchema = z.object({
  result: z
    .union([z.enum(["VALID", "INVALID", "EXPIRED", "REVOKED", "SUSPENDED"]), z.literal("")])
    .optional()
    .default(""),
  employee: z.string().trim().max(200).optional().default(""),
  from: z.string().trim().max(10).optional().default(""),
  to: z.string().trim().max(10).optional().default(""),
  page: z.coerce.number().int().min(1).max(100_000).optional().default(1),
});

export const auditLogQuerySchema = z.object({
  action: z.string().trim().max(80).optional().default(""),
  admin: z.string().trim().max(254).optional().default(""),
  page: z.coerce.number().int().min(1).max(100_000).optional().default(1),
});

export const verificationReportSchema = z.object({
  note: z.string().trim().min(3, "too_short").max(500, "too_long"),
});

/** Convert Next.js searchParams into a plain object for zod parsing. */
export function searchParamsToObject(
  params: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") result[key] = value;
    else if (Array.isArray(value) && typeof value[0] === "string") result[key] = value[0];
  }
  return result;
}

/** Parse input with zod, throwing a structured 422 error. */
export function parseInput<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

/** Extract a human-readable message from a form value (keeps zod errors small). */
export function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

