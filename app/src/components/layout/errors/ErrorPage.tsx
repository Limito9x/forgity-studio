import { Link, useRouter } from '@tanstack/react-router'
import { Button, buttonVariants } from '@/components/ui/button'
import { AlertCircle, RotateCcw } from 'lucide-react'

export function ErrorPage({ error }: { error?: unknown }) {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center p-6">
      <div className="rounded-full bg-destructive/10 p-4 mb-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
      </div>
      <h1 className="text-3xl font-bold mb-4">An unexpected error occurred</h1>
      <p className="text-muted-foreground mb-8 max-w-md">
        We apologize, but the system encountered an issue while processing your request. Please try again later.
      </p>
      
      {Boolean(error && import.meta.env.DEV) && (
        <div className="mb-8 p-4 bg-muted rounded-md text-left text-sm font-mono overflow-auto max-w-3xl w-full text-muted-foreground">
          {error instanceof Error ? error.message : String(error)}
        </div>
      )}

      <div className="flex gap-4">
        <Button onPress={() => router.invalidate()} variant="outline">
          <RotateCcw className="mr-2 h-4 w-4" />
          Try again
        </Button>
        <Link to="/" className={buttonVariants()}>
          Return to Dashboard
        </Link>
      </div>
    </div>
  )
}
