"use client"

import * as React from "react"
import { DayPicker } from "react-day-picker"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium text-foreground/90",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "h-7 w-7 bg-transparent p-0 text-muted-foreground hover:text-foreground"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "h-9 w-9 p-0 font-normal text-foreground/90 hover:bg-accent hover:text-accent-foreground"
        ),
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-muted text-foreground",
        day_outside: "text-muted-foreground/70 opacity-60",
        day_disabled: "text-muted-foreground/50 opacity-50",
        ...classNames,
      }}
      components={{
        Chevron: ({ className, orientation = "left", ...props }) => {
          const Icon =
            orientation === "left"
              ? ChevronLeft
              : orientation === "right"
                ? ChevronRight
                : orientation === "up"
                  ? ChevronUp
                  : ChevronDown
          return <Icon className={cn("h-4 w-4", className)} {...props} />
        },
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }

