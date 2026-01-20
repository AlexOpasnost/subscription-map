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
      className={cn("p-2", className)}
      classNames={{
        months: "flex flex-col gap-4",
        month: "space-y-3",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium text-foreground/90",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "bg-transparent hover:bg-white/5 text-foreground/80"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.75rem]",
        row: "flex w-full mt-1",
        cell:
          "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-white/5 first:[&:has([aria-selected])]:rounded-l-lg last:[&:has([aria-selected])]:rounded-r-lg",
        day: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-white/5"
        ),
        day_selected:
          "bg-[color:color-mix(in_srgb,var(--accent)_26%,transparent)] text-foreground/95 hover:bg-[color:color-mix(in_srgb,var(--accent)_32%,transparent)]",
        day_today:
          "border border-[color:color-mix(in_srgb,var(--accent)_24%,transparent)]",
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

