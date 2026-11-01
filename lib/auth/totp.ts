import { authenticator } from "otplib";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import { renderQrDataUrl } from "@/lib/qr";

/** Accept the current 30-second window plus one step of clock drift. */
authenticator.options = { window: 1, step: 30 };

export const TOTP_ISSUER = "Employee Verification System";

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function encryptTotpSecret(secret: string): string {
  return encryptSecret(secret);
}

export function decryptTotpSecret(ciphertext: string): string {
  return decryptSecret(ciphertext);
}

export function buildTotpKeyUri(secret: string, accountEmail: string): string {
  return authenticator.keyuri(accountEmail, TOTP_ISSUER, secret);
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const normalized = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  try {
    return authenticator.verify({ token: normalized, secret });
  } catch {
    return false;
  }
}

/** QR code for the setup screen, as a data URL (no extra network request). */
export async function totpSetupQrDataUrl(secret: string, accountEmail: string): Promise<string> {
  return renderQrDataUrl(buildTotpKeyUri(secret, accountEmail));
}
