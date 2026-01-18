"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/supabase/auth";
import { isEmailConfirmed } from "@/lib/isEmailConfirmed";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    // CRITICAL: Only redirect AFTER loading is complete
    if (loading === false && user === null) {
      router.replace("/login");
      return;
    }

    if (loading === false && user) {
      const confirmed = isEmailConfirmed(user);
      if (!confirmed) {
        const email = typeof user.email === "string" ? user.email : "";
        const qs = email ? `?email=${encodeURIComponent(email)}` : "";
        router.replace(`/check-email${qs}`);
        return;
      }
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

  // If user exists but is not confirmed, don't render (redirect will happen)
  if (!isEmailConfirmed(user)) {
    return null;
  }

  // User exists, render children
  return <>{children}</>;
}
