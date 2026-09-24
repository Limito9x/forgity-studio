import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Workflow, Sparkles, LogOut, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudioForm } from "@/features/studios/components/StudioForm";
import { useCreateStudio } from "@/features/studios/hooks/useStudios";
import { useStudioStore } from "@/stores/studioStore";
import { useAuthStore } from "@/stores/authStore";
import { useLogout } from "@/gen/endpoints/auth/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_protected/onboarding")({
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const createStudio = useCreateStudio();
  const setActiveStudioId = useStudioStore((s) => s.setActiveStudioId);
  const profile = useAuthStore((s) => s.profile);
  const { clearToken, clearProfile } = useAuthStore();
  const logout = useLogout();

  const handleLogout = async () => {
    try {
      await logout.mutateAsync(undefined);
    } catch {
      // Ignore error on logout
    } finally {
      clearToken();
      clearProfile();
      window.location.href = "/auth/login";
    }
  };

  const handleCreateStudio = (values: { name: string; slug?: string; description?: string }) => {
    createStudio.mutate(
      {
        data: {
          name: values.name,
          slug: values.slug || undefined,
          description: values.description || undefined,
        },
      },
      {
        onSuccess: (data) => {
          toast.success(`Studio "${data.name}" created successfully!`);
          setActiveStudioId(data.id);
          navigate({ to: "/" });
        },
        onError: (err: any) => {
          toast.error(err?.response?.data?.detail || "Failed to create studio. Please try again.");
        },
      }
    );
  };

  return (
    <div className="relative min-h-svh w-full flex flex-col items-center justify-center bg-background px-4 py-12 select-none">
      {/* Background decorative ambient glow */}
      <div className="absolute top-1/4 -left-32 size-96 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 size-96 rounded-full bg-primary/5 blur-3xl pointer-events-none" />

      {/* Main card */}
      <div className="relative w-full max-w-lg rounded-2xl border border-border/80 bg-card/90 p-8 shadow-2xl backdrop-blur-sm sm:p-10">
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-inner">
            <Workflow className="size-7" />
          </div>

          <div className="mt-5 flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" />
            <span>Welcome, {profile?.displayName || profile?.userName || "Creator"}</span>
          </div>

          <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Create Your First Studio
          </h1>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            A Studio is your top-level workspace where you manage projects, repositories, and compute runners.
          </p>
        </div>

        {/* Studio Creation Form */}
        <div className="mt-8">
          <StudioForm
            formId="onboarding-studio-form"
            onSubmit={handleCreateStudio}
          />
        </div>

        {/* Submit Action */}
        <div className="mt-8 flex flex-col gap-3">
          <Button
            type="submit"
            form="onboarding-studio-form"
            size="lg"
            className="w-full gap-2 text-sm font-semibold shadow-md"
            isDisabled={createStudio.isPending}
          >
            {createStudio.isPending ? "Setting up studio..." : "Create Studio & Get Started"}
            <ArrowRight className="size-4" />
          </Button>

          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground mt-2 py-1"
          >
            <LogOut className="size-3.5" />
            <span>Sign in with a different account</span>
          </button>
        </div>
      </div>
    </div>
  );
}
