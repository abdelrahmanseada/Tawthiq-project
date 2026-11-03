import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { BRAND } from "@/lib/brand";
import { PRODUCT_PRIMARY_COLOR, PRODUCT_SECONDARY_COLOR, mixHex, readableTextOn } from "@/lib/colors";
import { latinFont } from "@/lib/web-fonts";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const name = BRAND.name;
  return {
    title: { default: name, template: `%s · ${name}` },
    description: BRAND.description,
    applicationName: name,
    robots: { index: false, follow: false },
    other: { "color-scheme": "light" },
    icons: {
      icon: [
        { url: "/api/brand/icon?size=16", sizes: "16x16", type: "image/png" },
        { url: "/api/brand/icon?size=32", sizes: "32x32", type: "image/png" },
        { url: "/api/brand/icon?size=48", sizes: "48x48", type: "image/png" },
        { url: "/api/brand/icon?size=192", sizes: "192x192", type: "image/png" },
        { url: "/api/brand/icon?size=512", sizes: "512x512", type: "image/png" },
      ],
      apple: "/api/brand/icon?size=180",
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname") ?? "";
  const isPublicVerifyPage = pathname.startsWith("/v/");
  const primary = PRODUCT_PRIMARY_COLOR;
  const secondary = PRODUCT_SECONDARY_COLOR;
  const variables = {
    "--brand": primary,
    "--brand-fg": readableTextOn(primary),
    "--brand-hover": mixHex(primary, "#000000", 0.12),
    "--brand-active": mixHex(primary, "#000000", 0.22),
    "--brand-tint": mixHex(primary, "#FFFFFF", 0.9),
    "--brand-soft": mixHex(primary, "#FFFFFF", 0.82),
    "--secondary": secondary,
    "--secondary-fg": readableTextOn(secondary),
    "--secondary-tint": mixHex(secondary, "#FFFFFF", 0.88),
  } as CSSProperties;

  return (
    <html lang="en" dir="ltr" data-theme="light" style={variables} suppressHydrationWarning>
      <body className={`${latinFont.variable} min-h-screen bg-surface text-ink antialiased`}>
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
