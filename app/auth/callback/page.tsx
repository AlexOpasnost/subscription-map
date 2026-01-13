"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Suspense } from "react";

function AuthCallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [msg, setMsg] = useState("Signing you in…");

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const code = searchParams.get("code");

        if (!code) {
          setMsg("No authentication code found. Redirecting to login…");
          setTimeout(() => router.replace("/login"), 2000);
          return;
        }

        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          console.error("Error exchanging code for session:", error);
          setMsg("Authentication failed. Redirecting to login…");
          setTimeout(() => router.replace("/login"), 2000);
          return;
        }

        if (data.session) {
          // Verify session is set by checking again
          const { data: { session: verifiedSession } } = await supabase.auth.getSession();
          
          if (verifiedSession) {
            // Session is confirmed, redirect immediately
            window.location.href = "/app/map";
          } else {
            setMsg("Session not found. Redirecting to login…");
            setTimeout(() => router.replace("/login"), 2000);
          }
        } else {
          setMsg("No session found. Redirecting to login…");
          setTimeout(() => router.replace("/login"), 2000);
        }
      } catch (error) {
        console.error("Error in auth callback:", error);
        setMsg("Authentication error. Redirecting to login…");
        setTimeout(() => router.replace("/login"), 2000);
      }
    };

    handleAuthCallback();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center space-y-2">
        <div className="text-lg font-semibold">{msg}</div>
        <div className="text-sm text-muted-foreground">Please wait.</div>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="text-center space-y-2">
            <div className="text-lg font-semibold">Signing you in…</div>
            <div className="text-sm text-muted-foreground">Please wait.</div>
          </div>
        </div>
      }
    >
      <AuthCallbackHandler />
    </Suspense>
  );
}
