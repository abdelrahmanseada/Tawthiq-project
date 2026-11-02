"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm mt-2"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      {copied ? "Copied" : label}
    </button>
  );
}
