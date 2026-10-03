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
}

export const TagsInput = React.forwardRef<HTMLInputElement, TagsInputProps>(
  ({ className, value = [], onChange, placeholder, maxTags, disabled, transformTag, renderTagLabel, ...props }, ref) => {
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

    return (
      <div
        className={cn(
          "flex min-h-9 w-full flex-wrap gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 px-1.5 py-0.5 text-xs font-normal">
            {renderTagLabel ? renderTagLabel(tag) : tag}
            <button
              type="button"
              className="ml-1 rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={(e) => {
                e.stopPropagation()
                removeTag(tag)
              }}
              disabled={disabled}
            >
              <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              <span className="sr-only">Remove {tag}</span>
            </button>
          </Badge>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground min-w-[120px]"
          placeholder={value.length === 0 ? placeholder : ""}
          disabled={disabled || (maxTags !== undefined && value.length >= maxTags)}
          {...props}
        />
      </div>
    )
  }
)
TagsInput.displayName = "TagsInput"
