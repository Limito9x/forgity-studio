import * as React from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export interface BaseCardProps extends React.ComponentPropsWithoutRef<typeof Card> {
  title: string
  description?: string
  icon?: React.ElementType
  thumbnailUrl?: string
  fallbackThumbnail?: React.ReactNode
  showThumbnail?: boolean
  emptyDescription?: React.ReactNode
  footer?: React.ReactNode
  action?: React.ReactNode
  onClick?: () => void
}

const GRADIENT_PALETTES = [
  { from: "from-blue-600/25", via: "via-indigo-500/15", to: "to-card", text: "text-blue-500", border: "border-blue-500/30", bg: "bg-blue-500/10" },
  { from: "from-emerald-600/25", via: "via-teal-500/15", to: "to-card", text: "text-emerald-500", border: "border-emerald-500/30", bg: "bg-emerald-500/10" },
  { from: "from-purple-600/25", via: "via-fuchsia-500/15", to: "to-card", text: "text-purple-500", border: "border-purple-500/30", bg: "bg-purple-500/10" },
  { from: "from-amber-600/25", via: "via-orange-500/15", to: "to-card", text: "text-amber-500", border: "border-amber-500/30", bg: "bg-amber-500/10" },
  { from: "from-rose-600/25", via: "via-pink-500/15", to: "to-card", text: "text-rose-500", border: "border-rose-500/30", bg: "bg-rose-500/10" },
  { from: "from-cyan-600/25", via: "via-sky-500/15", to: "to-card", text: "text-cyan-500", border: "border-cyan-500/30", bg: "bg-cyan-500/10" },
];

function getPaletteForTitle(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % GRADIENT_PALETTES.length;
  return GRADIENT_PALETTES[index];
}

export const BaseCard = React.forwardRef<HTMLDivElement, BaseCardProps>(
  ({ className, title, description, icon: Icon, thumbnailUrl, fallbackThumbnail, showThumbnail = true, emptyDescription, footer, action, onClick, children, ...props }, ref) => {
    const [imgError, setImgError] = React.useState(false);

    const hasDescription = Boolean(description?.trim());
    const hasChildren = Boolean(children);
    const hasContent = hasDescription || hasChildren || Boolean(emptyDescription);

    const initial = title?.trim()?.charAt(0)?.toUpperCase() || "?";
    const palette = React.useMemo(() => getPaletteForTitle(title || ""), [title]);

    return (
      <Card 
        ref={ref} 
        className={cn(
          "group flex flex-col h-full overflow-hidden transition-all duration-200 hover:border-primary/50 hover:shadow-md", 
          onClick && "cursor-pointer", 
          className
        )} 
        onClick={onClick}
        {...props}
      >
        {showThumbnail && (
          <div className="relative w-full aspect-video bg-muted/20 overflow-hidden border-b flex items-center justify-center shrink-0">
            {thumbnailUrl && !imgError ? (
              <img 
                src={thumbnailUrl} 
                alt={title} 
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                onError={() => setImgError(true)}
              />
            ) : fallbackThumbnail ? (
              fallbackThumbnail
            ) : (
              <div
                className={cn(
                  "relative w-full h-full bg-gradient-to-br flex items-center justify-center overflow-hidden select-none",
                  palette.from,
                  palette.via,
                  palette.to
                )}
              >
                {/* Subtle typography watermark in background */}
                <span className="absolute -right-2 -bottom-5 text-8xl font-black opacity-[0.06] tracking-tighter pointer-events-none select-none">
                  {initial}
                </span>

                {/* Center Frosted Glass Avatar / Icon Badge */}
                <div
                  className={cn(
                    "size-12 rounded-2xl backdrop-blur-md border shadow-xs flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:shadow-md",
                    palette.bg,
                    palette.border,
                    palette.text
                  )}
                >
                  {Icon ? (
                    <Icon className="size-6" />
                  ) : (
                    <span className="text-xl font-bold font-mono tracking-tight">{initial}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <CardHeader className={cn("flex flex-row items-center justify-between space-y-0 p-4", hasContent ? "pb-2" : "pb-4")}>
          <div className="flex items-center space-x-2.5 min-w-0 flex-1 pr-2">
            {Icon && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-3.5 w-3.5" />
              </div>
            )}
            <div className="space-y-1 min-w-0 flex-1">
              <CardTitle className="text-sm font-semibold truncate group-hover:text-primary transition-colors" title={title}>
                {title}
              </CardTitle>
            </div>
          </div>
          {action && (
            <div className="ml-auto shrink-0" onClick={(e) => e.stopPropagation()}>
              {action}
            </div>
          )}
        </CardHeader>

        {hasContent && (
          <CardContent className="flex-1 px-4 pb-4">
            {hasDescription ? (
              <CardDescription className="text-xs text-muted-foreground line-clamp-2">
                {description}
              </CardDescription>
            ) : emptyDescription ? (
              emptyDescription
            ) : null}
            {children}
          </CardContent>
        )}

        {footer && (
          <CardFooter className="bg-muted/20 px-4 py-2 text-xs text-muted-foreground border-t mt-auto">
            {footer}
          </CardFooter>
        )}
      </Card>
    )
  }
)

BaseCard.displayName = "BaseCard"
