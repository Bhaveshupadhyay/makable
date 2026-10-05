import { About } from './components/About'
import { Contact } from './components/Contact'
import { Hero } from './components/Hero'
import { Projects } from './components/Projects'
import { Skills } from './components/Skills'
import { portfolio } from './content/portfolio'

export function App() {
  return (
    <div data-theme={portfolio.template}>
      {/* React 19 hoists <title> into <head>, so the tab shows the owner's name. */}
      <title>{portfolio.profile.name}</title>
      <main className="mx-auto max-w-3xl space-y-20 px-6 py-16 sm:py-24">
        <Hero profile={portfolio.profile} />
        <About bio={portfolio.profile.bio} />
        <Skills skills={portfolio.skills} />
        <Projects projects={portfolio.projects} />
        <Contact links={portfolio.links} />
      </main>
    </div>
  )
}
