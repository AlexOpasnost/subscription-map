import AuthGate from "@/app/app/AuthGate"

export default function AssistantLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>
}

