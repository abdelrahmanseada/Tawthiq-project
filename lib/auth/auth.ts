import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { verifyMfaTicket } from "@/lib/security/crypto";

class InvalidLoginError extends CredentialsSignin {
  override code = "invalid_login";
}

const credentialsSchema = z.object({
  ticket: z.string().min(1).max(1024),
});

/**
 * Password-only sign-in. The password is verified by `startLoginAction`, which then
 * issues a short-lived HMAC-signed ticket. This provider only accepts
 * `password_only` tickets, so a client cannot mint a session directly.
 *
 * Sign-in is password-only up to this provider: accounts with TOTP enrolled are
 * routed to /2fa for a code before the ticket is issued, and accounts without it
 * are sent to /2fa/setup by the admin layout.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.AUTH_SECRET,
  trustHost: true,
  useSecureCookies: env.APP_URL.startsWith("https://"),
  session: {
    strategy: "jwt",
    maxAge: env.SESSION_MAX_AGE,
    updateAge: 15 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      id: "credentials",
      name: "Credentials",
      credentials: {
        ticket: { label: "Login ticket", type: "text" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) throw new InvalidLoginError();

        const ticket = verifyMfaTicket(parsed.data.ticket);
        if (!ticket || ticket.purpose !== "password_only") throw new InvalidLoginError();

        const user = await prisma.adminUser.findUnique({ where: { id: ticket.sub } });
        if (!user || !user.is_active) throw new InvalidLoginError();

        const now = new Date();
        if (user.locked_until && user.locked_until > now) throw new InvalidLoginError();

        await prisma.adminUser.update({
          where: { id: user.id },
          data: { last_login_at: now, failed_logins: 0, locked_until: null },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          companyId: user.company_id ?? undefined,
          mustChangePassword: user.must_change_password,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
