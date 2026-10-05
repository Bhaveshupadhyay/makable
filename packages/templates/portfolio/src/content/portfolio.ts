import type { Portfolio } from './types'

// All copy on the site lives here. Components read it and tag elements with
// `data-content="<path>"` so the builder's visual editor can patch this file.
export const portfolio: Portfolio = {
  profile: {
    name: 'Ada Lovelace',
    headline: 'Engineer writing the first programs',
    bio: 'I like turning hard problems into small, readable programs.',
    location: 'London',
    avatarUrl: '',
  },
  links: {
    github: 'https://github.com/octocat',
    linkedin: '',
    x: '',
    website: '',
    email: '',
  },
  skills: ['TypeScript', 'React', 'Node.js'],
  projects: [
    {
      name: 'analytical-engine',
      description: 'A general-purpose mechanical computer.',
      repoUrl: 'https://github.com/octocat/Hello-World',
      homepageUrl: '',
      language: 'TypeScript',
      stars: 42,
    },
  ],
  template: 'minimal',
}
