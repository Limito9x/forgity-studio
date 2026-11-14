import { useState } from "react"
import { BaseDialog } from "@/components/custom-ui/overlays/dialog/BaseDialog"
import { Button } from "@/components/ui/button"
import {
  Coffee,
  Heart,
  ArrowUpRight,
} from "lucide-react"

export function SupportDialog() {
  const [open, setOpen] = useState(false)
  const creemUrl = import.meta.env.VITE_CREEM_CHECKOUT_URL || "https://creem.io"

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onPress={() => setOpen(true)}
        className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 cursor-pointer transition-colors"
        aria-label="Support Forgity Studio"
      >
        <Coffee className="size-4 text-amber-500" />
        <span className="hidden sm:inline font-medium">Support</span>
      </Button>

      <BaseDialog
        open={open}
        onOpenChange={setOpen}
        title="Support Forgity Studio"
        description="Help accelerate headless 3D pipeline tools and community presets."
        size="sm"
        footer={
          <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1 text-[11px]">
              <Heart className="size-3 text-rose-500 fill-rose-500" />
              Thank you for fueling the journey!
            </span>
            <Button variant="outline" size="sm" onPress={() => setOpen(false)}>
              Close
            </Button>
          </div>
        }
      >
        <div className="space-y-4 py-1">
          {/* Founder Note */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground mb-1 flex items-center gap-1.5">
              <Coffee className="size-4 text-amber-500" />
              A Note from the Creator
            </p>
            <p>
              Forgity Studio is independently built to liberate creators and technical artists from tedious multi-DCC manual steps. Your contribution directly covers cloud relay infrastructure and continuous driver maintenance.
            </p>
          </div>

          {/* Action CTA */}
          <div className="space-y-2 pt-1">
            <a
              href={creemUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-xs shadow-md hover:opacity-90 transition-opacity"
            >
              <Coffee className="size-4" />
              <span>Buy Me a Coffee on Creem</span>
              <ArrowUpRight className="size-4" />
            </a>
            <p className="text-[11px] text-muted-foreground text-center">
              Supports Credit Cards, Apple Pay, Google Pay, and international cards.
            </p>
          </div>
        </div>
      </BaseDialog>
    </>
  )
}
