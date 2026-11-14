"use client"

import { CalendarIcon } from "lucide-react"
import { Temporal } from "@js-temporal/polyfill"
import { CalendarDate } from "@internationalized/date"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface DatePickerProps {
  value?: Temporal.PlainDate | null
  onChange?: (date: Temporal.PlainDate | undefined) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  disabled,
}: DatePickerProps) {
  // 1. Convert Temporal data into a React Aria compatible structure for UI state
  const uiValue = value
    ? new CalendarDate(value.year, value.month, value.day)
    : undefined;

  const handleChange = (newAriaDate: any) => {
    let updatedTemporal: Temporal.PlainDate | undefined = undefined;
    if (newAriaDate) {
      // 2. Convert back to a native Temporal object on change
      updatedTemporal = Temporal.PlainDate.from({
        year: newAriaDate.year,
        month: newAriaDate.month,
        day: newAriaDate.day
      });
    }
    onChange?.(updatedTemporal);
  };

  return (
    <PopoverTrigger>
      <Button
        variant={"outline"}
        isDisabled={disabled}
        className={cn(
          "w-[240px] justify-start text-left font-normal",
          !value && "text-muted-foreground",
          className
        )}
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        {value ? value.toLocaleString() : <span>{placeholder}</span>}
      </Button>
      <Popover placement="bottom start" className="w-auto p-0">
        <Calendar
          value={uiValue}
          onChange={handleChange}
          autoFocus
        />
      </Popover>
    </PopoverTrigger>
  )
}
