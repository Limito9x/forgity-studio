import { useState } from "react"
import { BaseDialog } from "@/components/custom-ui/overlays/dialog/BaseDialog"
import { Button } from "@/components/ui/button"
import { ShieldCheck, HardDrive, FileLock } from "lucide-react"

export function BetaPolicyDialog() {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"terms" | "privacy">("terms")

  const openTerms = (e: React.MouseEvent) => {
    e.preventDefault()
    setActiveTab("terms")
    setOpen(true)
  }

  const openPrivacy = (e: React.MouseEvent) => {
    e.preventDefault()
    setActiveTab("privacy")
    setOpen(true)
  }

  return (
    <>
      <div className="px-6 text-center text-xs text-muted-foreground">
        By continuing, you agree to the{" "}
        <a
          href="#terms"
          onClick={openTerms}
          className="hover:text-foreground underline underline-offset-2 cursor-pointer font-medium"
        >
          Terms of Service
        </a>{" "}
        and{" "}
        <a
          href="#privacy"
          onClick={openPrivacy}
          className="hover:text-foreground underline underline-offset-2 cursor-pointer font-medium"
        >
          Privacy Policy
        </a>
        .
      </div>

      <BaseDialog
        open={open}
        onOpenChange={setOpen}
        title={activeTab === "terms" ? "Terms of Service" : "Privacy Policy & Asset Safety"}
        description="Clear, creator-first principles for using Forgity Studio."
        size="lg"
        footer={
          <Button variant="default" size="sm" onPress={() => setOpen(false)}>
            I Understand
          </Button>
        }
      >
        <div className="space-y-4 text-xs leading-relaxed text-muted-foreground py-2 select-text">
          {activeTab === "terms" ? (
            <>
              <div className="flex gap-3 p-3.5 rounded-xl border border-border/60 bg-card/60">
                <FileLock className="size-5 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-semibold text-foreground text-sm">1. 100% Asset Ownership</h4>
                  <p>
                    All 3D models, textures, animations, materials, and custom automation scripts processed through Forgity Studio remain exclusively your property.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 p-3.5 rounded-xl border border-border/60 bg-card/60">
                <HardDrive className="size-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-semibold text-foreground text-sm">2. Pre-Release Software Notice</h4>
                  <p>
                    Forgity Studio is under active development. We recommend maintaining local backups for critical production files before running automated pipelines.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 p-3.5 rounded-xl border border-border/60 bg-card/60">
                <ShieldCheck className="size-5 text-emerald-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-semibold text-foreground text-sm">3. Local Execution &amp; Template Quotas</h4>
                  <p>
                    All pipelines execute directly on your local workstation hardware. Cloud Templates include run quotas tied to your account and workstation; attempting to bypass or abuse quota limits is prohibited.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-3 p-3.5 rounded-xl border border-border/60 bg-card/60">
                <ShieldCheck className="size-5 text-emerald-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-semibold text-foreground text-sm">Zero Asset Upload / No AI Training</h4>
                  <p>
                    Forgity Studio does not upload, inspect, or train machine learning models on your 3D geometry, textures, or local project files.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 p-3.5 rounded-xl border border-border/60 bg-card/60">
                <HardDrive className="size-5 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-semibold text-foreground text-sm">Machine Identity &amp; Account Data</h4>
                  <p>
                    When using the Desktop app, we only store your account email and an anonymized hardware fingerprint hash to manage your personal template library and enforce run quotas.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </BaseDialog>
    </>
  )
}
