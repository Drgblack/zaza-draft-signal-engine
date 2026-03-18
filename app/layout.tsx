import type { Metadata } from "next";
import { Manrope, Source_Serif_4 } from "next/font/google";

import "./globals.css";

import { AppShell } from "@/components/layout/app-shell";
import { getAppConfig } from "@/lib/config";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
});

export const metadata: Metadata = {
  title: "Zaza Draft Signal Engine",
  description: "Internal editorial workflow for signal intake, interpretation, and content drafting.",
  icons: {
    icon: "/Z%20Logo.png",
    apple: "/Z%20Logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const config = getAppConfig();

  return (
    <html lang="en">
      <body className={`${manrope.variable} ${sourceSerif.variable}`}>
        <AppShell appName={config.appName} isAirtableConfigured={config.isAirtableConfigured}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
