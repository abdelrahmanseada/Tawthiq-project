"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/components/ui";
import {
  BACK,
  CARD_COLORS,
  CARD_WIDTH_MM,
  FRONT,
  layoutCard,
  type TextBlock,
} from "@/lib/card/layout";
import { PRODUCT_NAME } from "@/lib/brand";
import { DEFAULT_PRIMARY_COLOR, DEFAULT_SECONDARY_COLOR, normalizeHexColor } from "@/lib/colors";

export interface CardPreviewData {
  companyName: string;
  companyLogoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  employeeName: string;
  jobTitle: string | null;
  department: string | null;
  employeeCode: string;
  photoUrl: string | null;
  validUntil: string;
  domain: string;
  phone: string;
  email: string;
  qrValue?: string;
  hasPhoto?: boolean;
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
    <div
      className="absolute overflow-hidden"
      style={{
        ...boxStyle(block),
        color: block.color === "primary" ? "var(--card-primary)" : block.color,
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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
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
  const primaryColor = normalizeHexColor(data.primaryColor, DEFAULT_PRIMARY_COLOR);
  const secondaryColor = normalizeHexColor(data.secondaryColor, DEFAULT_SECONDARY_COLOR);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const layout = layoutCard({
    fullName: data.employeeName,
    jobTitle: data.jobTitle,
    department: data.department,
    employeeCode: data.employeeCode,
    companyName: data.companyName,
    validUntil: data.validUntil,
    host: data.domain,
    phone: data.phone,
    email: data.email,
    hasPhoto: Boolean(data.photoUrl),
  });

  useEffect(() => {
    let cancelled = false;
    const value = data.qrValue ?? data.domain;
    QRCode.toDataURL(value, { errorCorrectionLevel: "Q", margin: 4, width: 520 })
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
        className="relative aspect-[85.6/54] w-full overflow-hidden rounded-[12px] bg-white shadow-raised ring-1 ring-black/10 [container-type:inline-size]"
        style={
          {
            "--card-primary": primaryColor,
            "--card-secondary": secondaryColor,
          } as React.CSSProperties
        }
        data-card-side={side}
      >
        {side === "front" ? (
          <>
            <div className="absolute inset-x-0 top-0" style={{ height: mm(FRONT.header.h), background: primaryColor }} />
            <div className="absolute inset-x-0" style={{ top: mm(FRONT.accent.y), height: mm(FRONT.accent.h), background: secondaryColor }} />
            <div
              className="absolute flex items-center justify-center overflow-hidden rounded-[3px] bg-white"
              style={{ ...boxStyle(FRONT.logo), padding: mm(FRONT.logo.padding) }}
            >
              {data.companyLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.companyLogoUrl} alt="" className="h-full w-full object-contain" />
              ) : (
                <span style={{ color: primaryColor, fontSize: pt(14), fontWeight: 700 }}>{initials(data.companyName)}</span>
              )}
            </div>
            <TextBox block={layout.front.company} />
            <div
              className="absolute overflow-hidden bg-slate-200"
              style={{
                ...boxStyle(FRONT.photo),
                border: `${mm(FRONT.photo.borderPt / 2.834645669)} solid ${secondaryColor}`,
                borderRadius: mm(FRONT.photo.radius),
              }}
            >
              {data.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.photoUrl} alt={data.employeeName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center text-slate-400" aria-label="No photo">
                  <span className="block rounded-full bg-slate-300" style={{ width: mm(8), height: mm(8) }} />
                  <span className="block rounded-t-full bg-slate-300" style={{ width: mm(14), height: mm(9), marginTop: mm(2) }} />
                </div>
              )}
            </div>
            <TextBox block={layout.front.name} />
            {layout.front.title ? <TextBox block={layout.front.title} /> : null}
            {layout.front.department ? <TextBox block={layout.front.department} /> : null}
            <TextBox block={layout.front.code} />
            <TextBox block={layout.front.validUntil} />
            <ShieldCheck
              aria-hidden="true"
              className="absolute"
              style={{ left: mm(37.5), top: mm(FRONT.footer.y + 0.1), width: mm(2.2), height: mm(2.2), color: primaryColor }}
            />
          </>
        ) : (
          <>
            <div className="absolute inset-x-0 top-0" style={{ height: mm(BACK.header.h), background: primaryColor }} />
            <div className="absolute inset-x-0" style={{ top: mm(BACK.accent.y), height: mm(BACK.accent.h), background: secondaryColor }} />
            <TextBox block={layout.back.company} />
            <div
              className="absolute rounded-[4px] border bg-white p-0"
              style={{ ...boxStyle(BACK.panel), borderColor: CARD_COLORS.border }}
            >
              <div className="h-full w-full p-[6.666%]">
                {qrUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrUrl} alt="QR code to verify this employee card" className="h-full w-full object-contain" />
                ) : (
                  <div className="h-full w-full bg-slate-100" aria-hidden="true" />
                )}
              </div>
            </div>
            <TextBox block={layout.back.heading} />
            <TextBox block={layout.back.host} />
            <TextBox block={layout.back.phone} />
            <TextBox block={layout.back.email} />
            <TextBox block={layout.back.returns} />
            <TextBox block={layout.back.footer} title={`${PRODUCT_NAME} card`} />
          </>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">
        CR80 85.6 × 54 mm · front and back use the same layout specification as the printable PDF.
      </p>
    </div>
  );
}
