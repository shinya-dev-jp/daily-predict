import type { Metadata, Viewport } from "next";
import { MiniKitWrapper } from "@/components/providers/MiniKitWrapper";
import { Toaster } from "@worldcoin/mini-apps-ui-kit-react";
import "./globals.css";

const BASE_URL = "https://daily-predict.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "Daily Predict — Predict the Future, Win WLD",
    template: "%s | Daily Predict",
  },
  description:
    "Make one daily prediction. Verified real humans only via World ID. Top predictors win WLD rewards. Can you beat the crowd?",
  keywords: ["prediction", "World ID", "World App", "WLD", "daily quiz", "crypto", "forecasting"],
  authors: [{ name: "Daily Predict" }],
  creator: "Daily Predict",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: BASE_URL,
    siteName: "Daily Predict",
    title: "Daily Predict — Predict the Future, Win WLD",
    description:
      "One prediction per day. Real humans only. Win WLD by outsmarting the crowd.",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Daily Predict — Predict the Future, Win WLD",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Daily Predict — Predict the Future, Win WLD",
    description:
      "One prediction per day. Real humans only. Win WLD by outsmarting the crowd.",
    images: ["/opengraph-image.png"],
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <MiniKitWrapper>
          {children}
          <Toaster />
        </MiniKitWrapper>
      </body>
    </html>
  );
}
