import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ActiveSeasonProvider } from "../lib/activeSeason";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Coach Selection",
  description: "Select your AFL team and follow your competition.",
  applicationName: "Coach Selection",
  appleWebApp: {
    capable: true,
    title: "Coach Selection",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icons/coach-selection-192.png",
    apple: "/icons/coach-selection-180.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#020617",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ActiveSeasonProvider>{children}</ActiveSeasonProvider>
      </body>
    </html>
  );
}
