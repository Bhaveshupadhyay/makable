import { ExternalLink, Star } from 'lucide-react'
import type { PortfolioProject } from '../content/types'
import { Section } from './Section'

export function Projects({ projects }: { projects: PortfolioProject[] }) {
  if (projects.length === 0) return null
  return (
    <Section id="projects" title="Projects">
      <ul className="grid gap-4 sm:grid-cols-2">
        {projects.map((project, i) => (
          <li
            key={`${i}-${project.repoUrl}`}
            className="flex flex-col gap-3 rounded-(--radius) border border-(--border) bg-(--card) p-5 transition-colors hover:border-(--accent)"
          >
            <a href={project.repoUrl} target="_blank" rel="noreferrer" className="space-y-2">
              <h3 data-content={`projects.${i}.name`} className="font-semibold">
                {project.name}
              </h3>
              <p data-content={`projects.${i}.description`} className="text-sm text-(--muted)">
                {project.description}
              </p>
            </a>
            <div className="mt-auto flex items-center gap-4 text-xs text-(--muted)">
              {project.language && <span>{project.language}</span>}
              <span className="flex items-center gap-1">
                <Star className="size-3" />
                {project.stars}
              </span>
              {project.homepageUrl && (
                <a
                  href={project.homepageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto flex items-center gap-1 text-(--accent) hover:underline"
                >
                  Live <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}
