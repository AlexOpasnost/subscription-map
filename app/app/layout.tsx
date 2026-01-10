"use client";

import AuthGate from "./AuthGate";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGate>{children}</AuthGate>;
}

