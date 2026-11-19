import type { Metadata, Viewport } from "next";
import { Brygada_1918, Mona_Sans } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { NavBar } from "@/components/nav-bar";
import { TelegramBridge, INK } from "@/components/telegram-bridge";
import { ToastProvider } from "@/components/ui/toast";

const mona = Mona_Sans({
  variable: "--font-mona",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

/** The display voice: the date, page titles and sheet titles. */
const brygada = Brygada_1918({
  variable: "--font-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Calcapone",
  description: "Your AI-powered calendar assistant",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: INK,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // telegram-web-app.js writes its viewport variables onto <html> before React hydrates.
    <html lang="en" className={`${mona.variable} ${brygada.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        {/* Every page needs the Telegram bridge (openLink, showConfirm), not just /login. */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <TelegramBridge />
        <ToastProvider>
          {children}
          <NavBar />
        </ToastProvider>
        <Analytics />
      </body>
    </html>
  );
}
