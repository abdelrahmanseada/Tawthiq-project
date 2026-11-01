import { hash, verify, type Options } from "@node-rs/argon2";

/**
 * Argon2id parameters aligned with OWASP's recommended minimum for interactive
 * logins: 19 MiB memory, 2 iterations, 1 lane, 32-byte output, unique salt.
 *
 * The algorithm is referenced by its numeric value because @node-rs/argon2
 * exposes it as an ambient const enum, which is incompatible with isolatedModules.
 */
const ARGON2_ALGORITHM_ID = 2; // Argon2id
const ARGON2_OPTIONS: Options = {
  algorithm: ARGON2_ALGORITHM_ID as Options["algorithm"],
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordPolicyError = "too_short" | "too_long" | "missing_letter" | "missing_number" | "too_common";

const COMMON_PASSWORDS = new Set([
  "password",
  "password1234",
  "123456789012",
  "qwertyuiop12",
  "changeme1234",
  "administrator1",
]);

/** Returns a policy error code, or null when the password is acceptable. */
export function checkPasswordPolicy(password: string): PasswordPolicyError | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "too_short";
  if (password.length > PASSWORD_MAX_LENGTH) return "too_long";
  if (!/\p{L}/u.test(password)) return "missing_letter";
  if (!/\p{N}/u.test(password)) return "missing_number";
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return "too_common";
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  if (!passwordHash || passwordHash.length > 1024 || password.length > PASSWORD_MAX_LENGTH) return false;
  try {
    return await verify(passwordHash, password, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

let dummyHashPromise: Promise<string> | null = null;

/**
 * Constant-ish-time comparison for unknown accounts: verify the supplied password
 * against a throwaway Argon2id hash so a missing user costs the same as a wrong
 * password (mitigates user enumeration by timing).
 */
export async function burnPasswordVerification(password: string): Promise<void> {
  dummyHashPromise ??= hashPassword("dummy-password-for-timing-equalization");
  const dummy = await dummyHashPromise;
  await verifyPassword(dummy, password);
}
