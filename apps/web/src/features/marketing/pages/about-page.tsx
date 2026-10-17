import { ArrowRight, Code, GitBranch, KeyRound, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'
import { GithubIcon } from '@/shared/ui/github-icon'
import { MakableIcon } from '@/shared/ui/makable-logo'
import { Aurora } from '../components/landing'
import { SiteFooter } from '../components/site-footer'
import { REPO_URL } from '../lib/links'

const PRINCIPLES = [
  {
    icon: Code,
    title: 'Open source',
    text: 'The builder is developed in the open on GitHub. Read the code, file issues, send pull requests.',
  },
  {
    icon: GitBranch,
    title: 'Your site lives in your repo',
    text: 'Publishing pushes plain files to a repository on your GitHub account. No lock-in: it keeps working without us.',
  },
  {
    icon: KeyRound,
    title: 'Bring your own model',
    text: 'Add your own AI provider keys and choose the model for every edit. Keys are checked, stored encrypted and never shown in full.',
  },
  {
    icon: ShieldCheck,
    title: 'Your GitHub, your code',
    text: 'Sign in with GitHub to build: every site is a repo on your account, so the code stays yours.',
  },
]

/** /about: what makable is and why it's built the way it is. */
export function AboutPage() {
  return (
    <div className="flex min-h-[calc(100svh-3.5rem)] flex-col">
      <section className="relative isolate overflow-hidden px-4 pt-20 pb-16 sm:pt-28">
        <Aurora />
        <div className="mx-auto max-w-3xl text-center">
          <MakableIcon className="mx-auto size-14" glow />
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">A website builder that talks with you</h1>
          <p className="mt-5 text-base text-pretty text-muted-foreground sm:text-lg">
            makable is an open-source, chat-first website builder, inspired by tools like Lovable and Bolt. Describe a site and
            it's built, in a repo on your own GitHub, and published to the web in minutes.
          </p>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="mx-auto max-w-3xl space-y-4 text-muted-foreground">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Why we're building it</h2>
          <p>
            Making a personal site shouldn't mean picking a framework, wiring a build, and learning a hosting dashboard. It also
            shouldn't mean handing your site to a platform you can't leave.
          </p>
          <p>
            So makable keeps the conversation simple and the output yours: you describe the site, click to edit, ask AI for the
            rest, and every change is a commit in your own GitHub repository, published to GitHub Pages, Vercel, Cloudflare
            Pages or Netlify.
          </p>
        </div>
      </section>

      <section className="border-t bg-muted/30 px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-semibold tracking-tight">What we believe</h2>
          <ul className="mt-12 grid gap-6 sm:grid-cols-2">
            {PRINCIPLES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-2xl border bg-background p-6 shadow-xs">
                <Icon className="size-5 text-[#FF3366]" />
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-4 py-20">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Build it with us</h2>
          <p className="text-muted-foreground">makable is young. Ideas, bug reports and contributions are all welcome.</p>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-transform hover:scale-[1.03]"
            >
              Start building
              <ArrowRight className="size-4" />
            </Link>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border bg-background px-5 py-2.5 text-sm font-medium shadow-xs transition-colors hover:bg-accent"
            >
              <GithubIcon className="size-4" />
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
