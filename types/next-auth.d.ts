import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }

  interface User {
    role?: string;
    companyId?: string;
    mustChangePassword?: boolean;
  }
}
