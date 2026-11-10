import { CircleHelp, ExternalLink } from 'lucide-react'
import { Popover } from 'radix-ui'
import { Button } from '@/shared/ui/button'

const POINTS = [
  { title: 'Private', text: 'Your site goes into a private repository (a project folder) on your account. No one else can see it unless you make it public.' },
  { title: 'Yours', text: 'The code belongs to you. It stays on your GitHub even if you stop using makable.' },
  { title: 'Safe', text: 'Every change is saved as a version, so nothing gets lost and a change can be undone.' },
  { title: 'Free', text: 'Signing up takes a minute and only needs an email address.' },
]

/** "What’s GitHub?" for people who've never used it: what it is and why makable keeps sites there, in plain words. */
export function GithubExplainer() {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <CircleHelp />
          What’s GitHub?
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={16}
          className="z-50 w-80 max-w-[calc(100vw-2rem)] space-y-3 rounded-xl border bg-popover p-4 text-sm text-popover-foreground shadow-md outline-none"
        >
          <div className="space-y-1">
            <p className="font-semibold">What’s GitHub?</p>
            <p className="text-muted-foreground">
              A free service where the code of a website or app is kept, a bit like Google Drive, but for code. Millions of people use it.
            </p>
          </div>
          <ul className="space-y-2">
            {POINTS.map((point) => (
              <li key={point.title}>
                <span className="font-medium">{point.title}.</span> <span className="text-muted-foreground">{point.text}</span>
              </li>
            ))}
          </ul>
          <a
            href="https://docs.github.com/en/get-started/start-your-journey/about-github-and-git"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium underline underline-offset-4"
          >
            Learn more about GitHub
            <ExternalLink className="size-3.5" />
          </a>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
