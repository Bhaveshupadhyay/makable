import { Check } from 'lucide-react'
import { useLocation } from 'react-router'
import { loginWithGithub, useSession } from '@/features/auth'
import { Button } from '@/shared/ui/button'
import { GithubIcon } from '@/shared/ui/github-icon'

/** Inline sign-in for features that need a GitHub account. The chat is persisted, so it resumes after the redirect. */
export function ConnectGithub() {
  const { data: user } = useSession()
  const location = useLocation()

  if (user) {
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
        Connect GitHub
      </Button>
      <p className="text-xs text-muted-foreground">We create a repo in your account and deploy it to GitHub Pages. Your code stays yours.</p>
    </div>
  )
}
