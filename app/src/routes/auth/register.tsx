import { createFileRoute } from "@tanstack/react-router";
import { RegisterForm } from "@/features/auth";

export const Route = createFileRoute("/auth/register")({
  component: RegisterPage,
});

function RegisterPage() {
  return <RegisterForm />;
}
