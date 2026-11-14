import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/form/Form'
import { FormInput } from '@/components/form-controls/FormInput'
import { Field } from '@/components/ui/field'
import { Link } from '@tanstack/react-router'
import { useForgotPassword } from '@/gen/endpoints/auth/auth'
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

const formSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email format'),
})

type FormValues = z.infer<typeof formSchema>

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [isSuccess, setIsSuccess] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
    },
  })

  const { mutate, isPending } = useForgotPassword({
    mutation: {
      onSuccess: () => {
        setIsSuccess(true)
      },
    },
  })

  function onSubmit(values: FormValues) {
    mutate({ data: { email: values.email } })
  }

  if (isSuccess) {
    return (
      <div className={cn("mx-auto flex w-full flex-col gap-6 sm:w-[350px]", className)} {...props}>
        <Card>
          <CardContent className="p-6 md:p-8 flex flex-col items-center justify-center space-y-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
            <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
            <p className="text-sm text-muted-foreground">
              If your email exists in our system, we have sent a password reset link. Please check your inbox.
            </p>
            <Button type="button" variant="outline" className="w-full">
              <Link to="/auth/login">Back to Login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className={cn("mx-auto flex w-full flex-col gap-6 sm:w-[350px]", className)} {...props}>
      <Card>
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="text-2xl font-bold mt-2">Forgot Password</h1>
              <p className="text-balance text-muted-foreground text-sm">
                Enter your email address and we'll send you a link to reset your password.
              </p>
            </div>

            <div className="grid gap-6">
              <Form id="forgot-password-form" form={form} onSubmit={onSubmit} className="flex flex-col gap-4">
                <FormInput
                  control={form.control}
                  name="email"
                  label="Email"
                  type="email"
                  placeholder="name@example.com"
                  disabled={isPending}
                />
                <Field>
                  <Button type="submit" className="w-full" isDisabled={isPending}>
                    Send Reset Link
                  </Button>
                </Field>
              </Form>
              <div className="text-center text-sm">
                <Link to="/auth/login" className="underline underline-offset-4 hover:text-primary">
                  Back to login
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
