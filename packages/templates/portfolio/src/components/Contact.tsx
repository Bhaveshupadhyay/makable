import { Mail } from 'lucide-react'
import type { Portfolio } from '../content/types'
import { Section } from './Section'

const LINK_LABELS: Record<Exclude<keyof Portfolio['links'], 'email'>, string> = {
  github: 'GitHub',
  linkedin: 'LinkedIn',
  x: 'X',
  website: 'Website',
}

export function Contact({ links }: { links: Portfolio['links'] }) {
  const entries = (Object.keys(LINK_LABELS) as (keyof typeof LINK_LABELS)[]).filter((key) => links[key])

  return (
    <Section id="contact" title="Contact">
      {links.email && (
        <a
          href={`mailto:${links.email}`}
          className="inline-flex items-center gap-2 text-2xl font-semibold text-(--accent) hover:underline"
        >
          <Mail className="size-6" />
          <span data-content="links.email">{links.email}</span>
        </a>
      )}
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {entries.map((key) => (
          <li key={key}>
            <a href={links[key]} target="_blank" rel="noreferrer" className="text-(--muted) hover:text-(--fg)">
              {LINK_LABELS[key]}
            </a>
          </li>
        ))}
      </ul>
    </Section>
  )
}
