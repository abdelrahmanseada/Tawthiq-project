"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { cn } from "@/components/ui";
import {
  CARD_COLORS,
  CARD_WIDTH_MM,
  FRONT,
  accentTop,
  layoutCard,
  type TextBlock,
} from "@/lib/card/layout";
import { DEFAULT_SECONDARY_COLOR, normalizeHexColor } from "@/lib/colors";

export interface CardPreviewData {
  companyName: string;
  secondaryColor: string;
  employeeName: string;
  jobTitle: string | null;
  employeeCode: string;
  validUntil: string;
  domain: string;
  showVerifyHostOnCard?: boolean;
  qrValue?: string;
}

const mm = (value: number) => `${(value / CARD_WIDTH_MM) * 100}cqw`;
const pt = (value: number) => `${(value * 0.352778 / CARD_WIDTH_MM) * 100}cqw`;

function boxStyle(box: { x: number; y: number; w: number; h: number }) {
  return {
    left: mm(box.x),
    top: mm(box.y),
    width: mm(box.w),
    height: mm(box.h),
  } as const;
}

function TextBox({ block, title }: { block: TextBlock; title?: string }) {
  return (
    <div className="absolute overflow-hidden"
      style={{
        ...boxStyle(block),
        color: block.color,
        fontFamily: "var(--font-latin)",
        fontSize: pt(block.fontSizePt),
        lineHeight: `${block.lineHeightPt * 0.352778 / 85.6 * 100}cqw`,
        fontWeight: block.weight === "bold" ? 700 : 400,
        textAlign: block.align,
      }}
      title={title ?? block.text}
    >
      {block.lines.map((line, index) => (
        <div key={index} className="truncate">
          {line}
        </div>
      ))}
    </div>
  );
}

export function CardPreview({
  data,
  className,
  onSideChange,
  initialSide = "front",
}: {
  data: CardPreviewData;
  className?: string;
  onSideChange?: (side: "front" | "back") => void;
  initialSide?: "front" | "back";
}) {
  const [side, setSide] = useState<"front" | "back">(initialSide);
  const [animateFlip, setAnimateFlip] = useState(false);
  const secondaryColor = normalizeHexColor(data.secondaryColor, DEFAULT_SECONDARY_COLOR);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const layout = layoutCard({
    fullName: data.employeeName,
    jobTitle: data.jobTitle,
    employeeCode: data.employeeCode,
    companyName: data.companyName,
    validUntil: data.validUntil,
    host: data.showVerifyHostOnCard ? data.domain : null,
    showVerifyHostOnCard: data.showVerifyHostOnCard ?? false,
  });

  useEffect(() => {
    let cancelled = false;
    const value = data.qrValue ?? data.domain;
    QRCode.toDataURL(value, {
      errorCorrectionLevel: "Q",
      margin: 4,
      width: 520,
      color: { dark: "#FFFFFF", light: "#00000000" },
    })
      .then((url) => {
        if (!cancelled) setQrUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [data.qrValue, data.domain]);

  const toggle = () => {
    setAnimateFlip(true);
    const next = side === "front" ? "back" : "front";
    setSide(next);
    onSideChange?.(next);
  };

  const bracket = {
    borderColor: secondaryColor,
    width: mm(3.2),
    height: mm(3.2),
  } as const;

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="inline-flex rounded-control border border-border bg-card p-0.5" role="group" aria-label="Card side">
          <button
            type="button"
            onClick={() => {
              setAnimateFlip(true);
              setSide("front");
              onSideChange?.("front");
            }}
            className={cn("rounded-[8px] px-3 py-1.5 text-xs font-semibold", side === "front" ? "bg-brand text-brand-fg" : "text-muted hover:text-ink")}
            aria-pressed={side === "front"}
          >
            Front
          </button>
          <button
            type="button"
            onClick={() => {
              setAnimateFlip(true);
              setSide("back");
              onSideChange?.("back");
            }}
            className={cn("rounded-[8px] px-3 py-1.5 text-xs font-semibold", side === "back" ? "bg-brand text-brand-fg" : "text-muted hover:text-ink")}
            aria-pressed={side === "back"}
          >
            Back
          </button>
        </div>
        <button type="button" onClick={toggle} className="btn btn-ghost btn-sm">
          Flip card
        </button>
      </div>

      <div key={side} className={cn("relative aspect-[85.6/54] w-full overflow-hidden rounded-[12px] shadow-raised ring-1 ring-black/20 [container-type:inline-size]", animateFlip && "card-flip")}
        style={
          { background: side === "front" ? CARD_COLORS.front : CARD_COLORS.back } as React.CSSProperties
        }
        data-card-side={side}
      >
        {side === "front" ? (
          <>
            <TextBox block={layout.front.name} />
            {layout.front.title ? <TextBox block={layout.front.title} /> : null}
            <div className="absolute" style={{ ...boxStyle({ x: FRONT.accent.x, y: accentTop(layout), w: FRONT.accent.w, h: FRONT.accent.h }), background: secondaryColor }} />
            <div className="absolute" style={boxStyle(FRONT.qr)}>
              {qrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrUrl} alt="QR code to verify this employee card" className="h-full w-full object-contain" />
              ) : (
                <div className="h-full w-full" aria-hidden="true" />
              )}
              <span className="absolute left-0 top-0 rounded-tl-[3px] border-l-2 border-t-2" style={bracket} aria-hidden="true" />
              <span className="absolute right-0 top-0 rounded-tr-[3px] border-r-2 border-t-2" style={bracket} aria-hidden="true" />
              <span className="absolute bottom-0 left-0 rounded-bl-[3px] border-b-2 border-l-2" style={bracket} aria-hidden="true" />
            </div>
            <TextBox block={layout.front.code} />
          </>
        ) : (
          <>
            <TextBox block={layout.back.brand} />
            <TextBox block={layout.back.meta} />
          </>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">
        CR80 85.6 × 54 mm · front and back use the same layout specification as the printable PDF.
      </p>
    </div>
  );
}
