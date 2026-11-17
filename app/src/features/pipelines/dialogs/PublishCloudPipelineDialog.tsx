import { useState } from "react";
import { CloudUpload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePublishCloudPipeline } from "@/gen/endpoints/pipelines/pipelines";

interface PublishCloudPipelineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineName: string;
  dagBundleJson: Record<string, any>;
  contractsJson: Record<string, any>;
  scripts?: Array<{
    key: string;
    executor: string;
    sourceCode: string;
    requirementsJson?: string[];
  }>;
  projectId?: string;
}

export function PublishCloudPipelineDialog({
  open,
  onOpenChange,
  pipelineName,
  dagBundleJson,
  contractsJson,
  scripts = [],
  projectId,
}: PublishCloudPipelineDialogProps) {
  const [publishAs, setPublishAs] = useState<"Template" | "Project">("Template");
  const [title, setTitle] = useState(pipelineName);
  const [description, setDescription] = useState("");
  const [defaultQuotaLimit, setDefaultQuotaLimit] = useState<string>("20");

  const publishMutation = usePublishCloudPipeline();

  const handlePublish = async () => {
    try {
      const quotaNum = defaultQuotaLimit.trim() === "" ? null : Number(defaultQuotaLimit);
      const res = await publishMutation.mutateAsync({
        data: {
          pipelineId: null,
          studioId: null,
          name: pipelineName,
          dagBundleJson: dagBundleJson as any,
          contractsJson: contractsJson as any,
          scripts: scripts.map((s) => ({
            key: s.key,
            executor: s.executor,
            sourceCode: s.sourceCode,
            requirementsJson: (s.requirementsJson ?? []) as any,
          })),
          publishAs,
          projectId: publishAs === "Project" ? projectId : null,
          title: title.trim() || pipelineName,
          description: description.trim() || null,
          category: "General",
          defaultQuotaLimit: Number.isFinite(quotaNum) ? quotaNum : null,
        },
      });
      toast.success(
        `Published v${res.versionNumber} (${publishAs === "Template" ? "Template" : "Project"})`
      );
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to publish pipeline to Cloud");
    }
  };

  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudUpload className="h-4 w-4 text-primary" />
            Publish to Forgity Cloud
          </DialogTitle>
          <DialogDescription>
            Creates an immutable PipelineVersion. Template mode strips personal constant values automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={publishAs === "Template" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setPublishAs("Template")}
            >
              Public Template
            </Button>
            <Button
              type="button"
              variant={publishAs === "Project" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setPublishAs("Project")}
            >
              Project Pipeline
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={pipelineName} />
          </div>

          {publishAs === "Template" && (
            <>
              <div className="space-y-1.5">
                <Label>Default Quota (runs)</Label>
                <Input
                  type="number"
                  min={0}
                  value={defaultQuotaLimit}
                  onChange={(e) => setDefaultQuotaLimit(e.target.value)}
                  placeholder="Unlimited if empty"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this template automates..."
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onPress={handlePublish} isDisabled={publishMutation.isPending}>
            {publishMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Publish Version
          </Button>
        </DialogFooter>
    </Dialog>
  );
}
