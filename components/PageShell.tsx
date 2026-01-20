import { ReactNode } from "react"

interface PageShellProps {
  children: ReactNode
}

export default function PageShell({ children }: PageShellProps) {
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-[1100px] px-4 sm:px-6 lg:px-8 py-8 lg:py-10">
        {children}
      </div>
    </div>
  )
}
