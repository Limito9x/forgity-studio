import { BaseDialog } from "@/components/custom-ui/overlays/dialog/BaseDialog";
import { Button } from "@/components/ui/button";
import { Zap, Check, HardDrive, ExternalLink } from "lucide-react";
import type { StudioQuotaDto } from "../hooks/useStudioQuota";

interface UpgradePlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quota?: StudioQuotaDto;
}

export function UpgradePlanModal({ open, onOpenChange, quota }: UpgradePlanModalProps) {
  const creditsRemaining = quota?.executionCreditsRemaining ?? 0;
  const isOutOfCredits = creditsRemaining <= 0;

  const handleCheckout = () => {
    const checkoutUrl = import.meta.env.VITE_CREEM_CHECKOUT_URL || "https://forgity.com/pricing";
    window.open(checkoutUrl, "_blank");
  };

  return (
    <BaseDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isOutOfCredits ? "Execution Limit Reached" : "Upgrade to Indie Pro"}
      description="Supercharge your indie studio workflow with unlimited runs and advanced pipeline maestro."
      className="max-w-xl"
    >
      <div className="space-y-5 py-2">
        {/* Current status banner */}
        <div className={`p-3.5 rounded-xl border flex items-center justify-between text-sm ${
          isOutOfCredits 
            ? "border-red-500/30 bg-red-500/10 text-red-400"
            : "border-primary/20 bg-primary/5 text-muted-foreground"
        }`}>
          <div>
            <p className="font-medium text-foreground">
              Current Plan: <span className="font-semibold text-primary">Community Tier</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {creditsRemaining} of 50 free preview runs remaining
            </p>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-background border border-border">
            {creditsRemaining} Runs Left
          </span>
        </div>

        {/* Plan Feature Comparison Card */}
        <div className="rounded-xl border border-primary/30 bg-gradient-to-b from-primary/10 via-background to-background p-5 relative overflow-hidden">
          <div className="absolute top-3 right-3">
            <span className="text-[11px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-primary text-primary-foreground shadow-sm">
              Recommended
            </span>
          </div>

          <div className="space-y-1">
            <h3 className="text-xl font-bold text-foreground">Indie Pro</h3>
            <p className="text-xs text-muted-foreground">
              Built specifically for solo creators and indie game developers
            </p>
          </div>

          <div className="mt-4 space-y-2.5">
            <div className="flex items-center gap-2.5 text-xs text-foreground/90">
              <div className="h-5 w-5 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                <Check className="h-3.5 w-3.5" />
              </div>
              <span className="font-medium">Unlimited Pipeline DAG Executions (No credit limits)</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-foreground/90">
              <div className="h-5 w-5 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                <Check className="h-3.5 w-3.5" />
              </div>
              <span>50 GB High-Speed Studio Cloud Storage</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-foreground/90">
              <div className="h-5 w-5 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                <Check className="h-3.5 w-3.5" />
              </div>
              <span>DAZ to Unreal Shading AAA & Headless Mesh Baking</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-foreground/90">
              <div className="h-5 w-5 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                <Check className="h-3.5 w-3.5" />
              </div>
              <span>Bounded Parallel Batch Concurrency & Native Rust Maestro</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-foreground/90">
              <div className="h-5 w-5 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                <Check className="h-3.5 w-3.5" />
              </div>
              <span>Priority Support & Early Feature Access</span>
            </div>
          </div>

          {/* BYOS Note */}
          <div className="mt-4 pt-3.5 border-t border-border/50 flex items-start gap-2 text-[11px] text-muted-foreground">
            <HardDrive className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80 mt-0.5" />
            <span>
              <strong>Note:</strong> Executing local pipelines on local disk paths or using Bring Your Own Storage (Custom S3) will always remain completely free and unlimited.
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Maybe Later
          </Button>
          <Button 
            onClick={handleCheckout}
            className="gap-2 bg-gradient-to-r from-primary to-primary/85 shadow-md hover:shadow-lg transition-all"
          >
            <Zap className="h-4 w-4 fill-primary-foreground" />
            <span>Upgrade to Indie Pro</span>
            <ExternalLink className="h-3.5 w-3.5 opacity-80" />
          </Button>
        </div>
      </div>
    </BaseDialog>
  );
}
