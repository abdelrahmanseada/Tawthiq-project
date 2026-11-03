"use client";

import { useId } from "react";

export function LogoMark({ className }: { className?: string }) {
  const gradientId = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" preserveAspectRatio="xMidYMid meet" className={`h-9 w-9 shrink-0 ${className ?? ""}`}>
      <defs>
        <linearGradient id={gradientId} x1="10" y1="6" x2="54" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0F766E" />
          <stop offset="1" stopColor="#115E59" />
        </linearGradient>
      </defs>
      <path d="M32 4 54 12v17c0 13.8-9 24.4-22 30C19 53.4 10 42.8 10 29V12L32 4Z" fill={`url(#${gradientId})`} />
      <path d="M21 32.5 28.5 40 41 25" fill="none" stroke="#fff" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M42 12h8v8h-8z" fill="none" stroke="#fff" strokeWidth="2" opacity=".9" />
      <rect x="44.7" y="14.7" width="2.6" height="2.6" fill="#F59E0B" />
    </svg>
  );
}
