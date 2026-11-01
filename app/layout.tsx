import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { cookies, headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { BRAND } from "@/lib/brand";
import { mixHex, readableTextOn } from "@/lib/colors";
import { THEME_COOKIE, normalizeTheme } from "@/lib/theme";
import { latinFont } from "@/lib/web-fonts";
import { getCurrentAdmin } from "@/lib/auth/session";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
    description: BRAND.description,
    applicationName: BRAND.name,
    robots: { index: false, follow: false },
    icons: {
      icon: [
        { url: "/brand/favicon.ico" },
        { url: "/brand/favicon.svg", type: "image/svg+xml" },
        { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      ],
      apple: "/brand/apple-touch-icon.png",
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname") ?? "";
  const isPublicVerifyPage = pathname.startsWith("/v/");
  const cookieStore = await cookies();
  const cookieTheme = normalizeTheme(cookieStore.get(THEME_COOKIE)?.value);

  let theme = cookieTheme;
  let primary = "#0F766E";
  let secondary = "#F59E0B";
  if (!isPublicVerifyPage) {
    const admin = await getCurrentAdmin();
    if (admin?.company) {
      theme = normalizeTheme(admin.theme);
      primary = admin.company.primary_color;
      secondary = admin.company.secondary_color;
    }
  }

  const onPrimary = readableTextOn(primary);
  const onSecondary = readableTextOn(secondary);
  const variables = {
    "--brand": primary,
    "--brand-fg": onPrimary,
    "--brand-hover": mixHex(primary, "#000000", 0.12),
    "--brand-active": mixHex(primary, "#000000", 0.22),
    "--brand-tint": mixHex(primary, "#FFFFFF", 0.9),
    "--brand-soft": mixHex(primary, "#FFFFFF", 0.82),
    "--secondary": secondary,
    "--secondary-fg": onSecondary,
    "--secondary-tint": mixHex(secondary, "#FFFFFF", 0.88),
  } as CSSProperties;

  const className = [latinFont.variable, theme === "dark" ? "dark" : theme === "light" ? "light" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <html lang="en" dir="ltr" className={className} data-theme={theme} style={variables} suppressHydrationWarning>
      <body className="min-h-screen bg-surface text-ink antialiased">
        {isPublicVerifyPage ? (
          children
        ) : (
          <NextIntlClientProvider locale="en" messages={await getMessages()}>
            {children}
          </NextIntlClientProvider>
        )}
      </body>
    </html>
  );
}
