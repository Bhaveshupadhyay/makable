import { Check } from 'lucide-react'
import { useLocation } from 'react-router'
import { loginWithGithub, useSession } from '@/features/auth'
import { Button } from '@/shared/ui/button'
import { GithubIcon } from '@/shared/ui/github-icon'

/**
 * Inline sign-in for features that need a GitHub account. The chat is persisted, so it resumes after the redirect.
 * `reconnect` asks a signed-in user to sign in again (e.g. to grant a permission makable didn't ask for before).
 */
export function ConnectGithub({ reconnect = false }: { reconnect?: boolean }) {
  const { data: user } = useSession()
  const location = useLocation()

  if (user && !reconnect) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="size-3.5" />
        Connected as @{user.login}
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <Button onClick={() => loginWithGithub(location.pathname + location.search)}>
        <GithubIcon />
        {reconnect ? 'Connect GitHub again' : 'Connect GitHub'}
      </Button>
      <p className="text-xs text-muted-foreground">Your sites live in repos on your GitHub account. Your code stays yours.</p>
    </div>
  )
}
