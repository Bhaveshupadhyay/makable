import { Section } from './Section'

export function Skills({ skills }: { skills: string[] }) {
  if (skills.length === 0) return null
  return (
    <Section id="skills" title="Skills">
      <ul className="flex flex-wrap gap-2">
        {skills.map((skill, i) => (
          <li
            key={`${i}-${skill}`}
            data-content={`skills.${i}`}
            className="rounded-(--radius) border border-(--border) bg-(--card) px-3 py-1 text-sm"
          >
            {skill}
          </li>
        ))}
      </ul>
    </Section>
  )
}
