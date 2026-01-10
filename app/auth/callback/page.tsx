"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [msg, setMsg] = useState("Signing you in…");

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Extract code from URL query params
        const code = searchParams.get("code");
        
        if (code) {
          // Exchange code for session
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          
          if (error) {
            console.error("Error exchanging code for session:", error);
            setMsg("Authentication failed. Redirecting to login…");
            setTimeout(() => router.replace("/login"), 2000);
            return;
          }

          if (data.session) {
            // Success - redirect to app
            router.replace("/app");
          } else {
            setMsg("No session found. Redirecting to login…");
            setTimeout(() => router.replace("/login"), 2000);
          }
        } else {
          // No code in URL - redirect to login
          setMsg("No authentication code found. Redirecting to login…");
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
