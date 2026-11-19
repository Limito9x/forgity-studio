import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRegister } from "@/gen/endpoints/auth/auth";
import { useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import forgityLogo from "@/assets/forgity.svg";
import { appConfig } from "@/config/appConfig";
import { Form } from "@/components/form/Form";
import { FormInput } from "@/components/form-controls/FormInput";
import { AuthBrandingPanel } from "./AuthBrandingPanel";
import { BetaPolicyDialog } from "./BetaPolicyDialog";

const registerSchema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().min(1, "Email is required").email("Invalid email address"),
    password: z
      .string()
      .min(1, "Password is required")
      .min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterFields = z.infer<typeof registerSchema>;

export function RegisterForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const navigate = useNavigate();
  const { mutate: registerMutate, isPending } = useRegister({
    mutation: {
      onSuccess: () => {
        toast.success("Account created successfully. Please sign in.");
        navigate({ to: "/auth/login" });
      },
      onError: (err: any) => {
        const message =
          err?.response?.data?.errors?.[0]?.message ||
          err?.response?.data?.title ||
          "Failed to create account. Please try again.";
        toast.error(message);
      },
    },
  });

  const form = useForm<RegisterFields>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = (data: RegisterFields) => {
    registerMutate({
      data: {
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email: data.email.trim(),
        password: data.password,
      },
    });
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0 border-border/80 shadow-lg">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="p-6 md:p-8 flex flex-col justify-center">
            <Form
              id="register-form"
              form={form}
              onSubmit={onSubmit}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col items-center gap-1.5 text-center mb-1">
                <div className="flex items-center gap-2 font-bold text-lg text-foreground">
                  <div className="flex size-9 items-center justify-center rounded-xl border border-border/60 bg-card p-1 shadow-xs overflow-hidden">
                    <img
                      src={forgityLogo}
                      alt={appConfig.shortName}
                      className="size-full object-contain rounded-md"
                    />
                  </div>
                  <span>{appConfig.name}</span>
                </div>
                <h1 className="text-xl font-bold mt-1 text-foreground">
                  Create your account
                </h1>
                <p className="text-balance text-muted-foreground text-xs">
                  Sign up to access cloud templates and your personal library
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormInput
                  control={form.control}
                  name="firstName"
                  label="First Name"
                  placeholder="Alex"
                  disabled={isPending}
                />
                <FormInput
                  control={form.control}
                  name="lastName"
                  label="Last Name"
                  placeholder="Mercer"
                  disabled={isPending}
                />
              </div>

              <FormInput
                control={form.control}
                name="email"
                label="Email"
                type="email"
                autoComplete="email"
                placeholder="you@studio.com"
                disabled={isPending}
              />

              <FormInput
                control={form.control}
                name="password"
                label="Password"
                type="password"
                autoComplete="new-password"
                disabled={isPending}
              />

              <FormInput
                control={form.control}
                name="confirmPassword"
                label="Confirm Password"
                type="password"
                autoComplete="new-password"
                disabled={isPending}
              />

              <Field>
                <Button type="submit" isDisabled={isPending} className="w-full">
                  {isPending ? "Creating account..." : "Create Account"}
                </Button>
              </Field>

              <p className="text-center text-xs text-muted-foreground">
                Already have an account?{" "}
                <Link
                  to="/auth/login"
                  className="font-semibold text-primary hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </Form>
          </div>

          <AuthBrandingPanel />
        </CardContent>
      </Card>

      <BetaPolicyDialog />
    </div>
  );
}
