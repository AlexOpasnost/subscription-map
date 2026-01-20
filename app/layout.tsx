import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ToastProvider } from "@/components/ToastProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Subscriptions",
  title: {
    default: "Subscriptions \u2013 Track your subscriptions",
    template: "%s \u2013 Track your subscriptions",
  },
  description: "Track all your subscriptions in one place",
  icons: {
    icon: [{ url: "/logo.png", type: "image/png" }],
    apple: [{ url: "/logo.png", type: "image/png" }],
    shortcut: [{ url: "/logo.png", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: "Subscriptions",
    title: "Subscriptions \u2013 Track your subscriptions",
    description: "Track all your subscriptions in one place",
    images: [
      {
        url: "/logo.png",
        width: 1024,
        height: 1024,
        alt: "Subscriptions",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Subscriptions \u2013 Track your subscriptions",
    description: "Track all your subscriptions in one place",
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
