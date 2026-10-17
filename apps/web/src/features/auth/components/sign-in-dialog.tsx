import { X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { Button } from '@/shared/ui/button'
import { GithubIcon } from '@/shared/ui/github-icon'
import { loginWithGithub } from '../api/session'

type SignInDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Where to come back to after signing in. */
  returnTo?: string
}

/** Asks a guest to sign in with GitHub before building: makable keeps every site in the user's own GitHub. */
export function SignInDialog({ open, onOpenChange, returnTo = '/' }: SignInDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 space-y-5 rounded-2xl border bg-background p-6 shadow-lg">
          <div className="space-y-1.5 pr-6">
            <Dialog.Title className="text-lg font-semibold tracking-tight">Sign in to start building</Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">
              makable keeps your site in your own GitHub account and publishes it from there. Your code stays yours.
            </Dialog.Description>
          </div>
          <Button className="w-full" onClick={() => loginWithGithub(returnTo)}>
            <GithubIcon />
            Continue with GitHub
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            No GitHub account?{' '}
            <a
              href="https://github.com/signup"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Create one for free
            </a>
            , then come back.
          </p>
          <Dialog.Close asChild>
            <Button variant="ghost" size="icon" aria-label="Close" className="absolute top-3 right-3 size-8">
              <X />
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
