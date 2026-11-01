/** Product identity — never tenant data. */
export const PRODUCT_NAME = "Tawthiq";
export const TAGLINE = "Verified identity for every workforce.";
export const PRODUCT_DESCRIPTION = "Multi-company employee identity and verification.";
export const POWERED_BY = `Powered by ${PRODUCT_NAME}`;

/** Support URL is optional at build time; set SUPPORT_URL in production. */
export const SUPPORT_URL = process.env.SUPPORT_URL ?? "https://support.tawthiq.example";

export const BRAND = {
  name: PRODUCT_NAME,
  tagline: TAGLINE,
  description: PRODUCT_DESCRIPTION,
  poweredBy: POWERED_BY,
} as const;

export function brandFor(_locale?: string) {
  return BRAND;
}
