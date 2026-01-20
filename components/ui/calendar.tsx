"use client"

import * as React from "react"
import { DayPicker, type DayPickerProps } from "react-day-picker"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = DayPickerProps

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      formatters={{
        formatWeekdayName: (day) =>
          day.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2),
      }}
      className={cn("w-full", className)}
      classNames={{
        months: "flex w-full justify-center",
        month: "w-full",
        caption: "flex justify-between items-center mb-2",
        caption_label: "text-sm font-medium text-white/80",
        nav_button: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "h-8 w-8 rounded-full hover:bg-white/10 focus-visible:ring-[color:var(--accent)]/25 focus-visible:ring-[3px]"
        ),
        table: "w-full border-collapse",
        head_row: "flex justify-between",
        head_cell: "w-9 text-xs text-white/40 text-center",
        row: "flex w-full justify-between mt-2",
        cell: "h-9 w-9 text-center",
        day: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "h-9 w-9 rounded-full hover:bg-white/10 focus-visible:ring-[color:var(--accent)]/25 focus-visible:ring-[3px]"
        ),
        day_selected: "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md",
        day_today: "border border-white/30",
        day_outside: "text-white/20",
        day_disabled: "text-white/20",
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

