import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ToastProvider } from "@/components/ToastProvider";
import { getAppUrl } from "@/lib/getAppUrl";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  applicationName: "Subscription Map",
  title: "Subscription Map",
  description: "Track monthly spending, spot forgotten subscriptions, and stay in control of your money.",
  icons: {
    icon: [
      { url: "/logo.png", sizes: "32x32", type: "image/png" },
      { url: "/logo.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/logo.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: "Subscription Map",
    title: "Subscription Map",
    description: "Track monthly spending, spot forgotten subscriptions, and stay in control of your money.",
    images: [
      {
        url: "/logo.png",
        alt: "Subscription Map",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Subscription Map",
    description: "Track monthly spending, spot forgotten subscriptions, and stay in control of your money.",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-dvh`}
      >
        <ToastProvider>{children}</ToastProvider>
        <Toaster />
      </body>
    </html>
  );
}
