import type { Metadata } from "next";
import "./globals.css";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/ui/theme";
import { SiteLinksPlacement } from "@/components/siteLinks";

const satoshi = localFont({
  src: "../public/fonts/Satoshi-Variable.ttf",
  display: "swap",
  variable: "--font-satoshi",
});

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
          {children}
          <SiteLinksPlacement />
        </ThemeProvider>
      </body>
    </html>
  );
}
