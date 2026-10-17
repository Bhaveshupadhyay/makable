import { ArrowRight, Code, GitBranch, KeyRound, MessageSquare, MousePointerClick, Rocket, Sparkles } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { useMediaQuery } from '@/shared/hooks/use-media-query'
import { RotatingWord } from './rotating-word'
import { SiteFooter } from './site-footer'

const STEPS = [
  { title: 'Describe your site', text: 'Say what you’re after in your own words. makable asks what it needs to know, right in the chat.' },
  { title: 'makable builds it', text: 'It plans the site, writes every file and checks the code, in a new repo on your GitHub.' },
  { title: 'Edit and publish', text: 'Click any text to change it, ask AI for bigger changes or edit the code, then publish in one step.' },
]

const FEATURES = [
  { icon: MessageSquare, title: 'From a prompt', text: 'Describe the site and get real React and Tailwind code, not a locked-in page.' },
  { icon: MousePointerClick, title: 'Click to edit', text: 'Edit text straight in the live preview, with undo and redo. It changes the code.' },
  { icon: Sparkles, title: 'Edit with AI', text: 'Select any part of the page and describe the change. It’s tried in the preview before it’s saved.' },
  { icon: Rocket, title: 'Publish anywhere', text: 'GitHub Pages, Vercel, Cloudflare Pages or Netlify.' },
  { icon: GitBranch, title: 'Your code, your GitHub', text: 'Every site is its own repo on your GitHub, so it follows you across devices and tools.' },
  { icon: KeyRound, title: 'Bring your own model', text: 'Add your own AI keys and pick the model for every edit.' },
]

/** The headline's first word, cycled: Build your website for free → Host your website for free. */
const HEADLINE_VERBS = ['Build', 'Host']
const BEAT_MS = 2000

/** The home page before the chat starts. `children` is the prompt box that starts it. */
export function Landing({ children }: { children: ReactNode }) {
  const [beat, setBeat] = useState(0)
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  useEffect(() => {
    if (reduceMotion) return
    const timer = window.setInterval(() => setBeat((b) => (b + 1) % HEADLINE_VERBS.length), BEAT_MS)
    return () => window.clearInterval(timer)
  }, [reduceMotion])

  return (
    <div className="flex min-h-[calc(100svh-3.5rem)] flex-col">
      <section id="start" className="relative isolate overflow-hidden px-4 pt-20 pb-24 sm:pt-28">
        <Aurora />
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur">
            <Code className="size-3.5" />
            Open source · publishes from your own GitHub
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            <span className="sr-only">Build and host your website for free</span>
            <span aria-hidden>
              <RotatingWord words={HEADLINE_VERBS} index={beat} /> your website{' '}
              <span className="bg-linear-to-r from-[#FF2E63] via-[#FF7A1A] to-[#8B5CF6] bg-clip-text text-transparent">for free</span>
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-pretty text-muted-foreground sm:text-lg">
            Describe it. makable writes the code to your GitHub and publishes it.
          </p>
          <div className="mt-10 w-full">{children}</div>
        </div>
      </section>

      <section className="border-t bg-muted/30 px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <SectionTitle eyebrow="How it works" title="From hello to a live site in minutes" />
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative rounded-2xl border bg-background p-6 shadow-xs">
                <span className="flex size-8 items-center justify-center rounded-full bg-linear-to-br from-[#FF2E63] to-[#FF9500] text-sm font-semibold text-white">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <SectionTitle eyebrow="Features" title="Everything a small site needs" />
          <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="group bg-background p-6 transition-colors hover:bg-muted/40">
                <Icon className="size-5 text-[#FF3366] transition-transform group-hover:-translate-y-0.5" />
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-3xl border bg-foreground px-6 py-14 text-center text-background">
          <div className="absolute -top-24 left-1/2 -z-10 size-96 -translate-x-1/2 rounded-full bg-[#FF3366]/40 blur-3xl" />
          <h2 className="text-3xl font-semibold tracking-tight">Ready to make yours?</h2>
          <p className="mx-auto mt-3 max-w-md text-sm opacity-70">Sign in with GitHub to start. Your site lives in a repo of your own.</p>
          <a
            href="#start"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-transform hover:scale-[1.03]"
          >
            Start building
            <ArrowRight className="size-4" />
          </a>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="text-center">
      <p className="text-sm font-medium text-[#FF3366]">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
    </div>
  )
}

/** Blurred brand-coloured blobs behind the hero. */
export function Aurora() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="mk-aurora absolute -top-40 left-1/2 h-[36rem] w-[64rem] -translate-x-1/2 opacity-60 blur-3xl">
        <div className="absolute top-10 left-[10%] size-80 rounded-full bg-[#FF2E63]/50" />
        <div className="absolute top-24 left-[38%] size-96 rounded-full bg-[#FF9500]/35" />
        <div className="absolute top-0 right-[8%] size-80 rounded-full bg-[#8B5CF6]/40" />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-40 bg-linear-to-b from-transparent to-background" />
    </div>
  )
}
