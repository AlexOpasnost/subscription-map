"use client"

import * as React from "react"
import { format } from "date-fns"
import { enUS } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type DatePickerProps = {
  id?: string
  value: string | null | undefined
  onChange: (nextIso: string | null) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}

function isoToLocalDate(iso: string): Date | undefined {
  const s = iso.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return undefined
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  const dt = new Date(y, mo, d)
  if (Number.isNaN(dt.getTime())) return undefined
  // Guard against rollover (e.g. 2026-02-31)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return undefined
  return dt
}

export function DatePicker({
  id,
  value,
  onChange,
  disabled,
  placeholder = "Pick a date",
  className,
}: DatePickerProps) {
  const selected = typeof value === "string" && value.trim() ? isoToLocalDate(value) : undefined

  const label = selected ? format(selected, "MMM d, yyyy", { locale: enUS }) : placeholder

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("w-full justify-start text-left font-normal", !selected && "text-muted-foreground", className)}
        >
          <CalendarIcon className="mr-2 h-4 w-4" aria-hidden="true" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (!d) {
              onChange(null)
              return
            }
            // Store as ISO YYYY-MM-DD (never locale-formatted strings).
            onChange(format(d, "yyyy-MM-dd"))
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}

