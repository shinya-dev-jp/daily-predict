import type { Metadata, Viewport } from "next";
import { MiniKitWrapper } from "@/components/providers/MiniKitWrapper";
import { Toaster } from "@worldcoin/mini-apps-ui-kit-react";
import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

const BASE_URL = "https://turingvote.vercel.app";

const TITLE = "TuringVote — Verified-human only 2-choice polls";
const DESCRIPTION =
  "Vote on neutral 2-choice questions. Only Verified Humans via World ID can participate. See how the verified crowd answers.";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: TITLE,
    template: "%s | TuringVote",
  },
  description: DESCRIPTION,
  keywords: [
    "TuringVote",
    "World ID",
    "World App",
    "Mini App",
    "verified humans",
    "proof of personhood",
    "2-choice poll",
    "human vote",
  ],
  authors: [{ name: "TuringVote" }],
  creator: "TuringVote",
  openGraph: {
    type: "website",
    locale: "en_US",
    alternateLocale: ["ja_JP"],
    url: BASE_URL,
    siteName: "TuringVote",
    title: TITLE,
    description: DESCRIPTION,
    // No image referenced — Next.js will fall back to the icons defined below.
    // (The previous /opengraph-image.png file was missing, breaking link previews.)
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0A0A0A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable, geistMono.variable)}>
      <head>
        {/* Preconnect to Supabase to shave ~100-300ms off the first /api call */}
        <link rel="preconnect" href="https://wgszbxgsxekwdmssnvvd.supabase.co" />
        <link rel="dns-prefetch" href="https://wgszbxgsxekwdmssnvvd.supabase.co" />
      </head>
      <body>
        <MiniKitWrapper>
          {children}
          <Toaster />
        </MiniKitWrapper>
      </body>
    </html>
  );
}
