import { ReactNode } from "react"

interface PageShellProps {
  children: ReactNode
}

export default function PageShell({ children }: PageShellProps) {
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-screen-sm md:max-w-3xl mx-auto px-4 py-6 sm:py-8 pb-10">
        {children}
      </div>
    </div>
  )
}
