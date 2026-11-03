/** Mask an address for audit text: a***@gmail.com. Never store the raw value. */
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return "***";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const first = local.charAt(0).toLowerCase();
  return `${first}***@${domain.toLowerCase()}`;
}
