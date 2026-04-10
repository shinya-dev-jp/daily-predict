import type { Metadata, Viewport } from "next";
import { MiniKitWrapper } from "@/components/providers/MiniKitWrapper";
import { Toaster } from "@worldcoin/mini-apps-ui-kit-react";
import "./globals.css";

const BASE_URL = "https://daily-predict-two.vercel.app";

const TITLE = "Daily Predict — A daily prediction game for verified humans";
const DESCRIPTION =
  "Vote on real-world outcomes once a day. Verified humans only via World ID. Build streaks, climb the leaderboard, see what the crowd thinks.";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: TITLE,
    template: "%s | Daily Predict",
  },
  description: DESCRIPTION,
  keywords: [
    "Daily Predict",
    "World ID",
    "World App",
    "Mini App",
    "prediction game",
    "daily quiz",
    "verified humans",
    "proof of personhood",
  ],
  authors: [{ name: "Daily Predict" }],
  creator: "Daily Predict",
  openGraph: {
    type: "website",
    locale: "en_US",
    alternateLocale: ["ja_JP", "es_ES", "ko_KR", "th_TH", "pt_BR"],
    url: BASE_URL,
    siteName: "Daily Predict",
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
  themeColor: "#1E1B4B",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
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
