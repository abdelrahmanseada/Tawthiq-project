"use client";

import { useMemo, useState } from "react";
import QRCode from "qrcode";
import { cn } from "@/components/ui";
import {
  BACK,
  CARD_COLORS,
  CARD_HEIGHT_MM,
  CARD_WIDTH_MM,
  FRONT,
  type CardFont,
  layoutCard,
  type TextBlock,
} from "@/lib/card/layout";

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

const FONT_VARS: Record<CardFont, string> = {
  display: "var(--font-card-display)",
  body: "var(--font-card-body)",
  mono: "var(--font-card-mono)",
};

function SvgText({ block }: { block: TextBlock }) {
  const fontSizeMm = block.fontSizePt * 0.352778;
  return (
    <text
      fontFamily={FONT_VARS[block.font]}
      fontSize={fontSizeMm}
      fontWeight={block.weight === "bold" ? 700 : 400}
      letterSpacing={block.trackingEm * fontSizeMm}
      fill={block.color}
      textAnchor={block.align === "right" ? "end" : block.align === "center" ? "middle" : "start"}
      xmlSpace="preserve"
    >
      <title>{block.text}</title>
      {block.lines.map((line, index) => (
        <tspan
          key={index}
          x={block.align === "right" ? block.x + block.w : block.align === "center" ? block.x + block.w / 2 : block.x}
          y={block.baselines[index]}
        >
          {line}
        </tspan>
      ))}
    </text>
  );
}

function QrArt({ value }: { value: string }) {
  const qr = useMemo(() => {
    try {
      const code = QRCode.create(value, { errorCorrectionLevel: "Q" });
      return { size: code.modules.size, data: code.modules.data };
    } catch {
      return null;
    }
  }, [value]);

  if (!qr) return null;

  const moduleMm = FRONT.qr.w / qr.size;
  const eyeMm = moduleMm * 7;
  const eyeInnerMm = moduleMm * 3;
  const corner = moduleMm * 0.3;
  const eyes: Array<[number, number]> = [
    [0, 0],
    [qr.size - 7, 0],
    [0, qr.size - 7],
  ];

  return (
    <g transform={`translate(${FRONT.qr.x} ${FRONT.qr.y})`} aria-label="QR code to verify this employee card">
      <title>QR code to verify this employee card</title>
      {Array.from(qr.data).map((dark, index) => {
        if (!dark) return null;
        const row = Math.floor(index / qr.size);
        const column = index % qr.size;
        return (
          <rect
            key={index}
            x={column * moduleMm + moduleMm * 0.08}
            y={row * moduleMm + moduleMm * 0.08}
            width={moduleMm * 0.84}
            height={moduleMm * 0.84}
            rx={corner}
            fill={CARD_COLORS.white}
          />
        );
      })}
      {eyes.map(([row, column]) => (
        <g key={`${row}-${column}`}>
          <rect
            x={column * moduleMm}
            y={row * moduleMm}
            width={eyeMm}
            height={eyeMm}
            rx={eyeMm * 0.24}
            fill={CARD_COLORS.white}
          />
          <rect
            x={column * moduleMm + moduleMm * 2}
            y={row * moduleMm + moduleMm * 2}
            width={eyeInnerMm}
            height={eyeInnerMm}
            rx={eyeInnerMm * 0.3}
            fill={CARD_COLORS.qrEye}
          />
        </g>
      ))}
    </g>
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
  const layout = layoutCard({
    fullName: data.employeeName,
    jobTitle: data.jobTitle,
    employeeCode: data.employeeCode,
    companyName: data.companyName,
    validUntil: data.validUntil,
    host: data.showVerifyHostOnCard ? data.domain : null,
    showVerifyHostOnCard: data.showVerifyHostOnCard ?? false,
  });

  const toggle = () => {
    setAnimateFlip(true);
    const next = side === "front" ? "back" : "front";
    setSide(next);
    onSideChange?.(next);
  };

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

      <div
        key={side}
        className={cn("relative aspect-[85.6/54] w-full overflow-hidden rounded-[12px] shadow-raised ring-1 ring-black/20", animateFlip && "card-flip")}
        style={{ background: side === "front" ? CARD_COLORS.front : CARD_COLORS.back }}
        data-card-side={side}
      >
        <svg
          viewBox={`0 0 ${CARD_WIDTH_MM} ${CARD_HEIGHT_MM}`}
          className="block h-full w-full"
          role="img"
          aria-label={side === "front" ? "Employee ID card front" : "Employee ID card back"}
        >
          <rect width={CARD_WIDTH_MM} height={CARD_HEIGHT_MM} fill={side === "front" ? CARD_COLORS.front : CARD_COLORS.back} />
          {side === "front" ? (
            <>
              <SvgText block={layout.front.name} />
              {layout.front.title ? <SvgText block={layout.front.title} /> : null}
              <rect
                x={FRONT.accent.x}
                y={layout.front.accentY}
                width={FRONT.accent.w}
                height={FRONT.accent.h}
                fill={CARD_COLORS.accent}
              />
              <QrArt value={data.qrValue ?? data.domain} />
              <SvgText block={layout.front.code} />
            </>
          ) : (
            <>
              <SvgText block={layout.back.brand} />
              <SvgText block={layout.back.claim} />
              <line
                x1={BACK.slash.x1}
                y1={BACK.slash.y1}
                x2={BACK.slash.x2}
                y2={BACK.slash.y2}
                stroke={CARD_COLORS.accent}
                strokeWidth={BACK.slash.thickness}
                strokeLinecap="round"
              />
              <SvgText block={layout.back.established} />
            </>
          )}
        </svg>
      </div>
      <p className="mt-2 text-xs text-muted">
        CR80 85.6 × 54 mm · front and back use the same layout specification as the printable PDF.
      </p>
    </div>
  );
}
