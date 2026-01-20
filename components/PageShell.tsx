import { ReactNode } from "react"

interface PageShellProps {
  children: ReactNode
}

export default function PageShell({ children }: PageShellProps) {
  return (
    <div className="relative min-h-dvh">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(1100px 700px at 50% 35%, rgba(255,255,255,0.06), transparent 60%)," +
            "radial-gradient(900px 600px at 50% 35%, rgba(59,130,246,0.10), transparent 62%)," +
            "radial-gradient(900px 700px at 50% 120%, rgba(0,0,0,0.55), transparent 55%)",
        }}
      />
      <div className="relative mx-auto w-full max-w-[1100px] px-4 sm:px-6 lg:px-8 py-8 sm:py-10 lg:py-12">
        {children}
      </div>
    </div>
  )
}
