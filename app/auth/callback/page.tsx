import { Suspense } from "react";
import AuthCallbackHandler from "./AuthCallbackHandler";

// Prevent Next.js from prerendering this page (auth callbacks are dynamic)
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
