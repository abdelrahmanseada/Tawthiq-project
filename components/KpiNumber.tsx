"use client";

import { useEffect, useRef, useState } from "react";

/** Accessible count-up: final value is always in aria-label and DOM fallback. */
export function KpiNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const frame = useRef<number | null>(null);
  const formatted = value.toLocaleString("en-US");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const duration = Math.min(600, 280 + value * 8);
    setDisplay(0);
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value]);

  return (
    <span role="img" aria-label={formatted} title={formatted}>
      <span aria-hidden="true">{display.toLocaleString("en-US")}</span>
    </span>
  );
}
