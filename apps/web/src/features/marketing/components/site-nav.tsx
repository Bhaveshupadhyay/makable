import { NavLink } from 'react-router'
import { cn } from '@/shared/lib/cn'
import { GithubIcon } from '@/shared/ui/github-icon'
import { REPO_URL } from '../lib/links'

/** The header's site links: About and the GitHub repo. */
export function SiteNav({ className }: { className?: string }) {
  return (
    <nav aria-label="Site" className={cn('flex items-center gap-1 text-sm', className)}>
      <NavLink
        to="/about"
        className={({ isActive }) =>
          cn(
            'rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            isActive && 'text-foreground',
          )
        }
      >
        About
      </NavLink>
      <a
        href={REPO_URL}
        target="_blank"
        rel="noreferrer"
        aria-label="makable on GitHub"
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <GithubIcon className="size-4" />
        <span className="hidden md:inline">GitHub</span>
      </a>
    </nav>
  )
}
