import Link from "next/link";
import { BACK_TEXT } from "@/lib/card/layout";
import { CARD_BRAND_NAME } from "@/lib/brand";
import type { PublicCompany } from "@/lib/services/verification";

const brandName = (company: PublicCompany | null) => company?.name?.trim() || CARD_BRAND_NAME;

/** Public shell header: card company lockup on the card's black ground. */
export function VerifyBrandHeader({
  company,
  action,
}: {
  company: PublicCompany | null;
  action?: { href: string; label: string };
}) {
  const name = brandName(company);

  return (
    <header className="border-b border-white/10">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <div className="flex min-w-0 items-center">
          <span className="min-w-0">
            <span className="verify-wordmark block truncate text-lg text-white">{name}</span>
            <span className="mt-1.5 block h-[2px] w-9 bg-[#a12b2b]" aria-hidden="true" />
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <p className="hidden text-right sm:block">
            <span className="verify-body block text-[10px] tracking-[0.18em] text-white/60">{BACK_TEXT.claim}</span>
            <span className="verify-wordmark mt-1 block text-[10px] text-white/70">{BACK_TEXT.established}</span>
          </p>
          {action ? (
            <Link
              href={action.href}
              className="text-xs font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white"
            >
              {action.label}
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}

/** Card-back footer: wordmark, claim and ESTD. line under a hairline. */
export function VerifyBrandFooter({ company }: { company: PublicCompany | null }) {
  const name = brandName(company);

  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-6 text-center">
        <span className="verify-wordmark text-sm text-white/85">{name}</span>
        <p className="verify-body flex flex-wrap items-center justify-center gap-2 text-[10px] tracking-[0.18em] text-white/60">
          <span>{BACK_TEXT.claim}</span>
          <span className="text-[#a12b2b]" aria-hidden="true">
            /
          </span>
          <span>{BACK_TEXT.established}</span>
        </p>
        <p className="text-xs text-white/55">
          © {new Date().getFullYear()} {name}
        </p>
      </div>
    </footer>
  );
}
