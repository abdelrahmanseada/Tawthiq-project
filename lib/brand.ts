/** Single-company identity. The Company row is the source of truth at runtime. */
import en from "@/messages/en.json";

export const PRODUCT_NAME = en.brand.name;
export const COMPANY_NAME = PRODUCT_NAME;
export const TAGLINE = en.brand.tagline;
export const COMPANY_DESCRIPTION = en.brand.description;
export const DEFAULT_COPYRIGHT_TEMPLATE = `© {year} ${PRODUCT_NAME}`;

export function copyrightText(year = new Date().getFullYear()): string {
  const template = process.env.COPYRIGHT_TEXT?.trim() || DEFAULT_COPYRIGHT_TEMPLATE;
  return template.replaceAll("{year}", String(year));
}

export const BRAND = {
  name: COMPANY_NAME,
  tagline: TAGLINE,
  description: COMPANY_DESCRIPTION,
  copyright: copyrightText(),
} as const;

export function brandFor(_locale?: string) {
  return BRAND;
}
