import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/form/Form'
import { FormInput } from '@/components/form-controls/FormInput'
import { Field } from '@/components/ui/field'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useResetPassword } from '@/gen/endpoints/auth/auth'
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const formSchema = z.object({
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

type FormValues = z.infer<typeof formSchema>

interface AcceptInviteFormProps extends React.ComponentProps<"div"> {
  email: string
  token: string
}

export function AcceptInviteForm({ email, token, className, ...props }: AcceptInviteFormProps) {
  const navigate = useNavigate()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  })

  const { mutate, isPending } = useResetPassword({
    mutation: {
      onSuccess: () => {
        toast.success('Account activated successfully. You can now login.')
        navigate({ to: '/auth/login' })
      },
    },
  })

  function onSubmit(values: FormValues) {
    mutate({
      data: {
        email,
        token,
        newPassword: values.newPassword,
      },
    })
  }

  return (
    <div className={cn("mx-auto flex w-full flex-col gap-6 sm:w-[350px]", className)} {...props}>
      <Card>
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="text-2xl font-bold mt-2">Welcome Aboard!</h1>
              <p className="text-balance text-muted-foreground text-sm">
                Please set up your password to activate your account.
              </p>
            </div>

            <div className="grid gap-6">
              <Form id="accept-invite-form" form={form} onSubmit={onSubmit} className="flex flex-col gap-4">
                <FormInput
                  control={form.control}
                  name="newPassword"
                  label="Password"
                  type="password"
                  disabled={isPending}
                />
                <FormInput
                  control={form.control}
                  name="confirmPassword"
                  label="Confirm Password"
                  type="password"
                  disabled={isPending}
                />
                <Field>
                  <Button type="submit" className="w-full" isDisabled={isPending}>
                    Activate Account
                  </Button>
                </Field>
              </Form>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
