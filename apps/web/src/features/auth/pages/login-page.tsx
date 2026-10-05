import { LoaderCircle, Sparkles } from 'lucide-react'
import { Navigate, useSearchParams } from 'react-router'
import { Button } from '@/shared/ui/button'
import { GithubIcon } from '@/shared/ui/github-icon'
import { loginWithGithub } from '../api/session'
import { useSession } from '../hooks/use-session'

/** Only same-origin paths, so `returnTo` can't be used as an open redirect. */
function safeReturnTo(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/'
}

export function LoginPage() {
  const { data: user, isPending } = useSession()
  const [params] = useSearchParams()
  const returnTo = safeReturnTo(params.get('returnTo'))

  if (user) return <Navigate to={returnTo} replace />

  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-3">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome to makable</h1>
          <p className="text-sm text-muted-foreground">
            Turn your GitHub profile into a live portfolio site in under five minutes.
          </p>
        </div>

        <Button size="lg" className="w-full" disabled={isPending} onClick={() => loginWithGithub(returnTo)}>
          {isPending ? <LoaderCircle className="animate-spin" /> : <GithubIcon />}
          Continue with GitHub
        </Button>

        <p className="text-xs text-muted-foreground">
          We create a repo in your account and deploy it to GitHub Pages. Your code stays yours.
        </p>
      </div>
    </main>
  )
}
