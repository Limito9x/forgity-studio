import * as React from "react"
import { cn } from "@/lib/utils"

interface CardGridProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function CardGrid({ className, children, ...props }: CardGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
