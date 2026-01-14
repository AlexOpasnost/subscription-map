import { ReactNode } from "react"

interface PageShellProps {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "6xl"
}

export default function PageShell({
  title,
  description,
  actions,
  children,
  maxWidth = "3xl",
}: PageShellProps) {
  const maxWidthClass = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    "4xl": "max-w-4xl",
    "6xl": "max-w-6xl",
  }[maxWidth]

  return (
    <div className="min-h-screen bg-background">
      <div className={`mx-auto w-full ${maxWidthClass} px-4 sm:px-6 py-6 sm:py-10`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{title}</h1>
            {description && (
              <p className="text-sm sm:text-base text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
