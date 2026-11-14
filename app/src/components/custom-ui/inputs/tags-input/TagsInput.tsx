import * as React from "react"
import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export interface TagsInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value?: string[]
  onChange?: (value: string[]) => void
  placeholder?: string
  maxTags?: number
  transformTag?: (tag: string) => string
  renderTagLabel?: (tag: string) => React.ReactNode
  options?: string[]
  allowCustom?: boolean
}

export const TagsInput = React.forwardRef<HTMLInputElement, TagsInputProps>(
  (
    {
      className,
      value = [],
      onChange,
      placeholder,
      maxTags,
      disabled,
      transformTag,
      renderTagLabel,
      options,
      allowCustom = true,
      ...props
    },
    ref
  ) => {
    const [inputValue, setInputValue] = React.useState("")
    const inputRef = React.useRef<HTMLInputElement>(null)

    // Combine refs
    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault()
        let newTag = inputValue.trim()
        if (transformTag) {
          newTag = transformTag(newTag)
        }
        if (newTag && !value.includes(newTag)) {
          if (maxTags === undefined || value.length < maxTags) {
            onChange?.([...value, newTag])
          }
        }
        setInputValue("")
      } else if (e.key === "Backspace" && inputValue === "" && value.length > 0) {
        // Xóa tag cuối cùng khi bấm Backspace nếu input đang rỗng
        const newTags = [...value]
        newTags.pop()
        onChange?.(newTags)
      }
    }

    const removeTag = (tagToRemove: string) => {
      if (disabled) return
      onChange?.(value.filter((tag) => tag !== tagToRemove))
    }

    const togglePreset = (opt: string) => {
      if (disabled) return
      if (value.includes(opt)) {
        onChange?.(value.filter((tag) => tag !== opt))
      } else {
        if (maxTags === undefined || value.length < maxTags) {
          onChange?.([...value, opt])
        }
      }
    }

    const hasPresets = Array.isArray(options) && options.length > 0

    return (
      <div className="space-y-1.5 w-full">
        <div
          className={cn(
            "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-xs transition-colors focus-within:ring-1 focus-within:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          onClick={() => {
            if (allowCustom) {
              inputRef.current?.focus()
            }
          }}
        >
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 px-1.5 py-0.5 text-xs font-normal">
              {renderTagLabel ? renderTagLabel(tag) : tag}
              <button
                type="button"
                className="ml-0.5 rounded-full outline-hidden focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                onClick={(e) => {
                  e.stopPropagation()
                  removeTag(tag)
                }}
                disabled={disabled}
              >
                <X className="size-3 text-muted-foreground hover:text-foreground" />
                <span className="sr-only">Remove {tag}</span>
              </button>
            </Badge>
          ))}

          {allowCustom ? (
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent outline-hidden placeholder:text-muted-foreground min-w-[100px] text-xs h-6"
              placeholder={value.length === 0 ? placeholder : ""}
              disabled={disabled || (maxTags !== undefined && value.length >= maxTags)}
              {...props}
            />
          ) : (
            value.length === 0 && (
              <span className="text-xs text-muted-foreground italic select-none py-0.5">
                {placeholder || "Select from presets below..."}
              </span>
            )
          )}
        </div>

        {/* Preset Options Chips (Interactive toggle) */}
        {hasPresets && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[10px] uppercase font-semibold text-muted-foreground mr-0.5 select-none">
              Presets:
            </span>
            {options.map((opt) => {
              const isSelected = value.includes(opt)
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={disabled}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    togglePreset(opt)
                  }}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-all select-none border cursor-pointer",
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary shadow-xs font-semibold"
                      : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60"
                  )}
                >
                  <span className="text-[10px]">{isSelected ? "✓" : "+"}</span>
                  <span>{opt}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }
)
TagsInput.displayName = "TagsInput"
