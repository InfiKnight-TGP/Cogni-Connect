import type { Metadata } from "next";
import "./globals.css";
import localFont from "next/font/local";
import { Noto_Sans_Bengali, Noto_Sans_Devanagari } from "next/font/google";
import { ThemeProvider } from "@/components/ui/theme";
import { SiteLinksPlacement } from "@/components/siteLinks";
import { InteractionProvider } from "@/components/interaction/InteractionProvider";
import { loadLocales } from "@/lib/interaction/load-locales";

const satoshi = localFont({
  src: "../public/fonts/Satoshi-Variable.ttf",
  display: "swap",
  variable: "--font-satoshi",
});

const notoDevanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], display: "swap", preload: false });
const notoBengali = Noto_Sans_Bengali({ subsets: ["bengali"], display: "swap", preload: false });

export const metadata: Metadata = {
  title: "Cogni Connect",
  description: "AI-Powered Companion For Memory Support",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={satoshi.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <InteractionProvider
            locales={loadLocales()}
            fontClassNames={{ hi: notoDevanagari.className, as: notoBengali.className }}
          >
            {children}
            <SiteLinksPlacement />
          </InteractionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
