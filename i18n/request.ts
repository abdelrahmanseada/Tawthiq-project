import { getRequestConfig } from "next-intl/server";
import en from "@/messages/en.json";
import { DEFAULT_LOCALE } from "@/lib/config";

/**
 * English is the only active locale. The Arabic catalog and shaping code are
 * deliberately dormant and are not imported here, so they are not bundled.
 */
export default getRequestConfig(async () => ({
  locale: DEFAULT_LOCALE,
  messages: en as Record<string, unknown>,
  timeZone: process.env.DEFAULT_TIME_ZONE ?? "Africa/Cairo",
  now: new Date(),
}));
