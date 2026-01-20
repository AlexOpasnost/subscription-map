"use client"

import * as React from "react"
import { DayPicker, type DayPickerProps } from "react-day-picker"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = DayPickerProps

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  const weekdayFormatter =
    props.formatters?.formatWeekdayName ??
    ((date: Date) => date.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2))

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      formatters={{
        ...props.formatters,
        formatWeekdayName: weekdayFormatter,
      }}
      className={cn("w-full", className)}
      classNames={{
        months: "flex flex-col gap-3",
        month: "w-full space-y-3",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium text-foreground/90 tabular-nums",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "bg-transparent hover:bg-white/5 text-foreground/85 focus-visible:ring-[color:var(--accent)]/25 focus-visible:ring-[3px]"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full table-fixed border-collapse",
        head_row: "grid grid-cols-7 gap-1",
        head_cell:
          "h-8 w-full flex items-center justify-center text-muted-foreground/80 font-medium text-[0.72rem] tracking-wide",
        row: "grid grid-cols-7 gap-1 mt-1",
        cell:
          "relative h-10 w-full p-0 text-center text-sm focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "h-10 w-full rounded-xl p-0 font-normal aria-selected:opacity-100 hover:bg-white/5 hover:ring-1 hover:ring-white/10 focus-visible:ring-[color:var(--accent)]/25 focus-visible:ring-[3px]"
        ),
        day_selected:
          "bg-[linear-gradient(180deg,rgba(59,130,246,0.98),rgba(37,99,235,0.98))] text-white shadow-[0_10px_30px_rgba(59,130,246,0.18)] hover:brightness-105",
        day_today:
          "ring-1 ring-[color:color-mix(in_srgb,var(--accent)_24%,transparent)]",
        day_outside: "text-muted-foreground/50 opacity-60",
        day_disabled: "text-muted-foreground/40 opacity-40",
        day_range_middle: "aria-selected:bg-white/5 aria-selected:text-foreground/90",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ className, orientation, ...iconProps }) => (
          <ChevronDown
            className={cn(
              "size-4 opacity-70",
              orientation === "left"
                ? "rotate-90"
                : orientation === "right"
                  ? "-rotate-90"
                  : orientation === "up"
                    ? "rotate-180"
                    : "",
              className
            )}
            {...iconProps}
          />
        ),
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }

