import localFont from "next/font/local";

/** Self-hosted Inter only. Arabic fonts live in assets/dormant and are not loaded. */
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
