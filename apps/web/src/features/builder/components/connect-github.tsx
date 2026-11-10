import { useLocation } from 'react-router'
import { loginWithGithub } from '@/features/auth'
import { Button } from '@/shared/ui/button'
import { GithubIcon } from '@/shared/ui/github-icon'
import { GithubExplainer } from './github-explainer'

/**
 * Inline sign-in for the chat. The chat is kept, so it resumes after the redirect. A guest gets the first sign-in,
 * with what GitHub is and where to get an account; `reconnect` asks a signed-in user to sign in again (e.g. to grant
 * a permission makable didn't ask for before).
 */
export function ConnectGithub({ reconnect = false }: { reconnect?: boolean }) {
  const location = useLocation()
  const signIn = () => loginWithGithub(location.pathname + location.search)

  if (reconnect) {
    return (
      <div className="space-y-2">
        <Button onClick={signIn}>
          <GithubIcon />
          Connect GitHub again
        </Button>
        <p className="text-xs text-muted-foreground">Your sites live in repos on your GitHub account. Your code stays yours.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={signIn}>
          <GithubIcon />
          Continue with GitHub
        </Button>
        <GithubExplainer />
      </div>
      <p className="text-xs text-muted-foreground">
        No GitHub account?{' '}
        <a href="https://github.com/signup" target="_blank" rel="noreferrer" className="font-medium text-foreground underline underline-offset-4">
          Create one for free
        </a>
        , then come back here.
      </p>
    </div>
  )
}
