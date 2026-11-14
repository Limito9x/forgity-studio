"use client"

import { CalendarIcon } from "lucide-react"
import { Temporal } from "@js-temporal/polyfill"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { RangeCalendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverTrigger,
} from "@/components/ui/popover"
import { CalendarDate } from "@internationalized/date"

export interface DateRangePickerProps {
  value?: { from?: Temporal.PlainDate; to?: Temporal.PlainDate } | null
  onChange?: (range: { from?: Temporal.PlainDate; to?: Temporal.PlainDate } | undefined) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = "Pick a date range",
  className,
  disabled,
}: DateRangePickerProps) {
  const uiValue = value?.from && value?.to ? {
    start: new CalendarDate(value.from.year, value.from.month, value.from.day),
    end: new CalendarDate(value.to.year, value.to.month, value.to.day)
  } : undefined;

  return (
    <div className={cn("grid gap-2", className)}>
      <PopoverTrigger>
        <Button
          id="date"
          variant={"outline"}
          isDisabled={disabled}
          className={cn(
            "w-[300px] justify-start text-left font-normal",
            !value && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value?.from ? (
            value.to ? (
              <>
                {value.from.toLocaleString()} - {value.to.toLocaleString()}
              </>
            ) : (
              value.from.toLocaleString()
            )
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
        <Popover placement="bottom start" className="w-auto p-0">
          <RangeCalendar
            autoFocus
            value={uiValue}
            onChange={(range) => onChange?.({
              from: range?.start ? Temporal.PlainDate.from({ year: range.start.year, month: range.start.month, day: range.start.day }) : undefined,
              to: range?.end ? Temporal.PlainDate.from({ year: range.end.year, month: range.end.month, day: range.end.day }) : undefined
            })}
          />
        </Popover>
      </PopoverTrigger>
    </div>
  )
}
