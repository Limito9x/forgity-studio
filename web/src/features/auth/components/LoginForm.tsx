import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useLogin } from '../hooks/useLogin'
import { useNavigate, useSearch, Link } from '@tanstack/react-router'
import { getAuthState } from '@/stores/authStore'
import { Workflow, ArrowUpRight } from 'lucide-react'
import forgityLogo from "@/assets/forgity.svg"
import { appConfig } from "@/config/appConfig"
import { Form } from '@/components/form/Form'
import { FormInput } from '@/components/form-controls/FormInput'
import { AuthBrandingPanel } from './AuthBrandingPanel'
import { BetaPolicyDialog } from './BetaPolicyDialog'

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required').min(6, 'Password must be at least 6 characters'),
})

type LoginFields = z.infer<typeof loginSchema>

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { mutate: loginMutate, isPending } = useLogin()
  const navigate = useNavigate()
  const search = useSearch({ from: '/auth/login' })
  const trialFormUrl = import.meta.env.VITE_TRIAL_REQUEST_FORM_URL || "https://forms.google.com"

  const form = useForm<LoginFields>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const onSubmit = (data: LoginFields) => {
    loginMutate(
      { data: data },
      {
        onSuccess: (result) => {
          if (result?.accessToken) {
            getAuthState().setAccessToken(result.accessToken)
            const redirectPath = search.redirect || '/'
            navigate({ to: redirectPath })
          }
        },
      }
    )
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0 border-border/60 shadow-xl">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="p-6 md:p-8 flex flex-col justify-between">
            <Form id="login-form" form={form} onSubmit={onSubmit} className="flex flex-col gap-5">
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="flex items-center gap-2.5 font-semibold text-lg text-foreground tracking-tight">
                  <div className="flex size-9 items-center justify-center rounded-xl border border-border/60 bg-card p-1 shadow-xs overflow-hidden">
                    <img src={forgityLogo} alt={appConfig.shortName} className="size-full object-contain rounded-md" />
                  </div>
                  <span>{appConfig.name}</span>
                </div>
                <h1 className="text-xl font-bold mt-1 text-foreground">Sign in to Studio</h1>
                <p className="text-balance text-muted-foreground text-xs">
                  Enter your credentials to access your pipelines and runners
                </p>
              </div>

              <FormInput
                control={form.control}
                name="email"
                label="Email"
                type="email"
                autoComplete="email"
                placeholder="developer@studio.com"
                disabled={isPending}
              />

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Password
                  </label>
                  <Link
                    to="/auth/forgot-password"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Forgot Password?
                  </Link>
                </div>
                <FormInput
                  control={form.control}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  disabled={isPending}
                />
              </div>

              <Field>
                <Button type="submit" isDisabled={isPending} className="w-full">
                  {isPending ? 'Signing in...' : 'Sign In'}
                </Button>
              </Field>

              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-center space-y-1">
                <p className="text-xs font-medium text-foreground">
                  Looking for Early Access?
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  We are onboarding select creators and technical artists for the closed beta.
                </p>
                <a
                  href={trialFormUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline pt-1"
                >
                  <span>Request Trial Access</span>
                  <ArrowUpRight className="size-3.5" />
                </a>
              </div>
            </Form>
          </div>

          <AuthBrandingPanel />
        </CardContent>
      </Card>

      <BetaPolicyDialog />
    </div>
  )
}
