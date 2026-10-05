import { Section } from './Section'

export function About({ bio }: { bio: string }) {
  if (!bio) return null
  return (
    <Section id="about" title="About">
      <p data-content="profile.bio" className="text-lg leading-relaxed">
        {bio}
      </p>
    </Section>
  )
}
