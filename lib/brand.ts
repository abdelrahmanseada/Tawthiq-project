/** Single-company identity. The Company row is the source of truth at runtime. */
export const PRODUCT_NAME = "Tawthiq";
export const COMPANY_NAME = PRODUCT_NAME;
export const TAGLINE = "Verified identity for every workforce.";
export const COMPANY_DESCRIPTION = "Employee identity and verification.";
export const DEFAULT_COPYRIGHT_TEMPLATE = "© {year} Tawthiq";

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
