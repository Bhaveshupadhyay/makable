import { Link } from 'react-router'
import { analytics } from '@/shared/lib/analytics'
import { GithubIcon } from '@/shared/ui/github-icon'
import { MakableLogo } from '@/shared/ui/makable-logo'
import { ISSUES_URL, MEETING_URL, REPO_URL, SUPPORT_EMAIL, SUPPORT_MAILTO } from '../lib/links'
import { FooterLogo } from './footer-logo'

type FooterLink = { label: string; to: string } | { label: string; href: string; support?: 'email' | 'call' }

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Builder', to: '/' },
      { label: 'About', to: '/about' },
      { label: 'AI models', to: '/settings' },
    ],
  },
  {
    title: 'Open source',
    links: [
      { label: 'GitHub', href: REPO_URL },
      { label: 'Report an issue', href: ISSUES_URL },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: SUPPORT_EMAIL, href: SUPPORT_MAILTO, support: 'email' },
      { label: 'Book a 1:1 call', href: MEETING_URL, support: 'call' },
    ],
  },
]

const YEAR = new Date().getFullYear()

/** The landing and About pages' footer. The builder workspace has none, since it fills the screen. */
export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-14 sm:px-6 sm:grid-cols-3 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="space-y-4 sm:col-span-3 lg:col-span-1">
          <MakableLogo iconClassName="size-7" textClassName="text-lg font-bold tracking-tight" />
          <p className="max-w-xs text-sm text-muted-foreground">
            An open-source AI website builder. Chat your way to a website and publish it from your own GitHub.
          </p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm font-medium shadow-xs transition-colors hover:bg-accent"
          >
            <GithubIcon className="size-4" />
            Star on GitHub
          </a>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title} className="space-y-3">
            <h2 className="text-sm font-semibold">{column.title}</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {column.links.map((link) => (
                <li key={link.label}>
                  {'to' in link ? (
                    <Link to={link.to} className="transition-colors hover:text-foreground">
                      {link.label}
                    </Link>
                  ) : (
                    <ExternalLink {...link} />
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto mt-10 flex max-w-6xl flex-col gap-1 px-4 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
        <p>© {YEAR} makable. Built in the open.</p>
        <p>Your site, your repo, your keys.</p>
      </div>
      <div className="mx-auto mt-12 max-w-6xl px-4 sm:px-6">
        <FooterLogo />
      </div>
    </footer>
  )
}

/** A link off the site, in a new tab; an email link opens the mail app instead. */
function ExternalLink({ label, href, support }: { label: string; href: string; support?: 'email' | 'call' }) {
  const email = href.startsWith('mailto:')
  return (
    <a
      href={href}
      target={email ? undefined : '_blank'}
      rel={email ? undefined : 'noreferrer'}
      onClick={support ? () => analytics.track('support_contact_clicked', { channel: support, placement: 'footer' }) : undefined}
      className="break-words transition-colors hover:text-foreground"
    >
      {label}
    </a>
  )
}
