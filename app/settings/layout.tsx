import AuthGate from "@/app/app/AuthGate"

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>
}

