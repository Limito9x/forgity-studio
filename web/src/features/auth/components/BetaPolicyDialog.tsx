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
        By signing in, you agree to the{" "}
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
        title={activeTab === "terms" ? "Terms of Service (Closed Beta)" : "Privacy Policy & Asset Safety"}
        description="Clear, developer-first principles for creators testing Forgity Studio."
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
                    Forgity Studio is currently in Active Beta. While our headless runner executors incorporate atomic locks and zero-destructive pipelines, we advise maintaining local backups for critical production files.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 p-3.5 rounded-xl border border-border/60 bg-card/60">
                <ShieldCheck className="size-5 text-emerald-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-semibold text-foreground text-sm">3. Fair Resource Usage</h4>
                  <p>
                    Local runners run on your workstation hardware. Cloud sync relies on presigned S3 URLs directly connecting your client to your designated S3 bucket without unencrypted intermediaries.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-3 p-3.5 rounded-xl border border-border/60 bg-card/60">
                <ShieldCheck className="size-5 text-emerald-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-semibold text-foreground text-sm">No Model Training / No Asset Scraping</h4>
                  <p>
                    Forgity Studio does not inspect, collect, or train machine learning models on your 3D geometry, textures, or project pipelines.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 p-3.5 rounded-xl border border-border/60 bg-card/60">
                <HardDrive className="size-5 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-semibold text-foreground text-sm">Telemetry & Crash Logs</h4>
                  <p>
                    To optimize runner daemon reliability across Blender and Unreal Engine versions, we only collect anonymized execution durations, error exit codes, and hardware profiles (GPU/RAM specs).
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
