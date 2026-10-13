import Link from "next/link";

// Keep patient-facing copy together so Part D can replace these strings with translation keys.
const FOOTER_COPY = {
  about: "About",
  terms: "Terms",
  privacy: "Privacy",
  languagePicker: "Language picker · coming in Part D",
  memoryLine: "Built with ❤️ to help individuals with dementia and Alzheimer's stay connected to their memories",
  tagline: "CogniConnect - Connecting Minds, Preserving Memories",
};

export default function Footer() {
  return (
    <footer className="border-t border-border bg-background px-4 pb-24 pt-6 text-center text-base text-muted-foreground print:hidden lg:pb-8">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-3">
        <div className="flex flex-wrap items-center justify-center gap-x-5">
          <nav className="flex flex-wrap items-center justify-center gap-x-5" aria-label="Information">
            <Link
              className="flex min-h-12 items-center hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              href="/about"
            >
              {FOOTER_COPY.about}
            </Link>
            <span aria-hidden="true">·</span>
            <Link
              className="flex min-h-12 items-center hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              href="/terms"
            >
              {FOOTER_COPY.terms}
            </Link>
            <span aria-hidden="true">·</span>
            <Link
              className="flex min-h-12 items-center hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              href="/privacy"
            >
              {FOOTER_COPY.privacy}
            </Link>
          </nav>
          <span className="inline-flex min-h-12 items-center rounded-lg border border-dashed border-border px-3">
            {FOOTER_COPY.languagePicker}
          </span>
        </div>
        <p className="max-w-4xl">{FOOTER_COPY.memoryLine}</p>
        <p>{FOOTER_COPY.tagline}</p>
      </div>
    </footer>
  );
}
