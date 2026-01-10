"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/supabase/auth";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    // CRITICAL: Only redirect AFTER loading is complete
    if (loading === false && user === null) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Checking session…</div>
      </div>
    );
  }

  // If loading is done and no user, don't render (redirect will happen)
  if (!user) {
    return null;
  }

  // User exists, render children
  return <>{children}</>;
}
