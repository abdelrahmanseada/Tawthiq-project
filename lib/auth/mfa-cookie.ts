import { cookies } from "next/headers";
import { MFA_TICKET_COOKIE } from "./constants";

export { MFA_TICKET_COOKIE };

const TEN_MINUTES = 10 * 60;

function secureCookies(): boolean {
  return process.env.NODE_ENV === "production" || (process.env.APP_URL ?? "").startsWith("https://");
}

/** Short-lived, HMAC-signed ticket that proves the password step succeeded. */
export async function setMfaTicketCookie(ticket: string): Promise<void> {
  const store = await cookies();
  store.set({
    name: MFA_TICKET_COOKIE,
    value: ticket,
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    maxAge: TEN_MINUTES,
  });
}

export async function readMfaTicketCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(MFA_TICKET_COOKIE)?.value;
}

export async function clearMfaTicketCookie(): Promise<void> {
  const store = await cookies();
  store.delete(MFA_TICKET_COOKIE);
}
