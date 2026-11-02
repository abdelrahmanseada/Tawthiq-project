"use client";

import { useState } from "react";

export function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(codes.join("\n"));
    setCopied(true);
  }
  return (
    <div className="mt-5">
      <div className="grid gap-2 rounded-control border border-border bg-surface p-4 font-mono text-sm sm:grid-cols-2">
        {codes.map((code) => (
          <span key={code} className="text-ink">{code}</span>
        ))}
      </div>
      <button type="button" onClick={copy} className="btn btn-secondary btn-sm mt-3">
        {copied ? "Copied" : "Copy all codes"}
      </button>
    </div>
  );
}
