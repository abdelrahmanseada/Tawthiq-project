import localFont from "next/font/local";

/** Self-hosted Inter for the product UI. Arabic fonts live in assets/dormant and are not loaded. */
export const latinFont = localFont({
  src: [
    { path: "../assets/fonts/inter-400.ttf", weight: "400", style: "normal" },
    { path: "../assets/fonts/inter-500.ttf", weight: "500", style: "normal" },
    { path: "../assets/fonts/inter-600.ttf", weight: "600", style: "normal" },
    { path: "../assets/fonts/inter-700.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-latin",
  display: "swap",
  fallback: ["Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
});

/** Nord Medium: card name, wordmark and ESTD. line. */
export const cardDisplayFont = localFont({
  src: "../assets/fonts/nord-medium.ttf",
  variable: "--font-card-display",
  display: "swap",
  fallback: ["Arial Narrow", "Arial", "sans-serif"],
});

/** Nord Book: card job title and claim. */
export const cardBodyFont = localFont({
  src: "../assets/fonts/nord-book.ttf",
  variable: "--font-card-body",
  display: "swap",
  fallback: ["Arial Narrow", "Arial", "sans-serif"],
});

/** Arvo: card employee code. */
export const cardMonoFont = localFont({
  src: "../assets/fonts/arvo-regular.ttf",
  variable: "--font-card-mono",
  display: "swap",
  fallback: ["Georgia", "serif"],
});
