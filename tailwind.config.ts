import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "var(--surface)",
        card: "var(--card)",
        ink: "var(--ink)",
        border: "var(--border)",
        muted: "var(--muted)",
        subtle: "var(--subtle)",
        brand: {
          DEFAULT: "var(--brand)",
          fg: "var(--brand-fg)",
          hover: "var(--brand-hover)",
          active: "var(--brand-active)",
          tint: "var(--brand-tint)",
          soft: "var(--brand-soft)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          fg: "var(--secondary-fg)",
          tint: "var(--secondary-tint)",
        },
        success: { DEFAULT: "var(--success)", tint: "var(--success-tint)", fg: "var(--success-fg)" },
        danger: { DEFAULT: "var(--danger)", tint: "var(--danger-tint)", fg: "var(--danger-fg)" },
        warning: { DEFAULT: "var(--warning)", tint: "var(--warning-tint)", fg: "var(--warning-fg)" },
        info: { DEFAULT: "var(--info)", tint: "var(--info-tint)", fg: "var(--info-fg)" },
      },
      fontFamily: {
        sans: ["var(--font-latin)", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
      },
      borderRadius: {
        card: "12px",
        control: "10px",
        pill: "999px",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15,23,42,.05)",
        card: "0 1px 2px rgba(15,23,42,.04), 0 10px 30px -18px rgba(15,23,42,.25)",
        raised: "0 18px 50px -24px rgba(15,23,42,.35)",
      },
      minHeight: { touch: "44px" },
      minWidth: { touch: "44px" },
      transitionDuration: { 150: "150ms", 200: "200ms" },
    },
  },
  plugins: [],
};

export default config;
